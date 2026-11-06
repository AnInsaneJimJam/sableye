# Verification

This file records what is **proved**, what is **model-checked**, what is **tested**, and what is **not covered**, in the Sableye contracts and SDK. Umbrella issue: #57.

## Summary

| Layer | Technique | Tool | Kind of guarantee | Result |
|---|---|---|---|---|
| Contracts | Symbolic execution | Halmos 0.3.3 + Z3 | **Proof** for every input. The contracts have no loops, so no bound is ever hit. | 17 properties proved |
| Contracts | Model checking of arithmetic | solc 0.8.30 SMTChecker (CHC, z3) | **Proof** per verification condition | 88 proved safe, 13 unproved (triaged below), 0 counterexamples |
| Contracts | Vacuity check | `test/halmos/vacuity.py` | Every proof can fail | 13 of 13 planted bugs caught |
| Contracts | Mutation testing | Gambit 1.0.6 | Measures how much the tests and proofs actually check | 85% of mutants killed in run 1. All 25 survivors were test gaps, and each is now covered |
| SDK | Protocol model checking | Quint 0.33 + Apalache | **Proof about the design**, up to a bound | Keeper: no violation up to 10 steps (see the caveat in §4) |
| SDK | Protocol simulation | Quint simulator | Random exploration of the design | Keeper and indexer: the fixed designs hold over thousands of random traces |
| SDK | Regression tests from counterexamples | `node:test` | Testing | One test per model-found bug |
| SDK | Differential and property tests | `node:test` + anvil | Testing | TS `hashInvoice` equals the contract's over 300 invoices; codec and webhooks checked |
| Both | Unit, fuzz, invariant and stateful tests | Foundry, Medusa/Chimera, `node:test` | Testing | 48 Foundry tests (fuzz 1,000 runs), Medusa about 195k calls, 72 SDK tests |

**The SDK's TypeScript isn't verified directly.** No production-grade verifier for TypeScript exists. Rewriting its kernels in Dafny or Lean would cost days, and viem and the RPC would still be unverified. So the SDK gets two things instead:
- proofs about its **protocols** (Quint models);
- tests that pin the real code to the behaviour the model found correct.

## Bugs this work found

| # | Where | Found by | Bug | Impact | Fix |
|---|---|---|---|---|---|
| 1 | `PaymentProcessor.refund` | Halmos | `refund(id, 0)` succeeded, flipped `Paid → PartiallyRefunded` and emitted `InvoiceRefunded` with nothing refunded | Dashboards and webhooks would report a refund that never happened | `9a4d5fb`: reverts with `ZeroRefund` |
| 2 | Contract test suite | Gambit | Deleting **every check** from `payWithPermit` (signature, expiry, nonce, double pay) passed all tests and proofs. 24 other mutants survived too | The permit path, used by most real payments, was effectively untested beyond balances | New proofs and tests, listed in `docs/mutation-report.md` |
| 3 | `keeper.ts` | Quint model (simulation) | A subscription whose `charge()` *throws* (RPC error, unrecognised revert, a tx reverted by a racing keeper) aborted the whole pass, and the keeper retried every 250 ms | One bad subscription stops **every** renewal after it, and hammers the RPC | Each subscription's error is caught separately and goes through the normal backoff (`test/keeper.test.mjs`) |
| 4 | `indexer.ts` sync | Indexer model (fault injection) | An RPC error between fetch chunks left part of the logs in memory, so the retry stored them twice | Refund transactions listed twice in invoices and the CSV export | The sync is transactional: it works on a copy and commits only on success |
| 5 | `indexer.ts` rollback | Indexer model (fault injection) | An RPC error *inside* the rollback, after it had dropped the reorged logs, meant `invoice.reorged` was never sent | The merchant keeps believing a payment that vanished in a reorg | Same transactional sync |
| 6 | `indexer.ts` rollback | Indexer model (simulation counterexample) | The rollback treated today's finalized head as known-good. A payment stored before it was final, reorged out while the server was offline, and then passed by finality, was **reported `invoice.final`** | A vanished payment is reported final. With Whitechain's ~48-minute finality, about an hour of downtime during a reorg is enough | The rollback trusts only the finalized head seen at the last successful sync (`finalSeen`, persisted) |
| 7 | `normalizeSignedInvoice` | Property test | A corrupted payment link with an out-of-range amount, nonce or expiry was accepted, and failed later with a raw viem error | The checkout crashes instead of saying "invalid link" | Range checks at the trust boundary; the `orderId` case is normalised |
| 8 | `keeper.ts` discovery | Keeper model (simulation counterexample) | Discovery scanned only blocks above its cursor, and the cursor followed the chain head. A reorg could re-include a new `Subscribed` log in a block at or below the cursor | That subscription is never charged until the process restarts | The cursor follows the **finalized** block, so each discovery re-scans the unfinalized range (one `getLogs` call on Whitechain) |

Bugs 3–8 each have a regression test that passes on the fixed code. For bugs 3–7 the test was also confirmed to fail on the old code; for bug 8 the failure is shown by the model.
- bugs 3 and 8: `sdk/packages/server/test/keeper.test.mjs`;
- bugs 4–6: `test/indexer-faults.test.mjs`, which uses a fake chain with injected RPC failures;
- bug 7: `test/differential.test.mjs`.

## 1. Contracts: Halmos proofs

- **File:** `sdk/contracts/test/halmos/Processor.halmos.t.sol`.
- **Run:** `cd sdk/contracts && halmos --match-contract Halmos` (about 30 s). Afterwards, run `forge build`: the TS e2e tests need the test artifacts, and Halmos rebuilds without them.

**What's abstracted:** ECDSA can't be reasoned about symbolically. So in the proofs:
- the merchant is an ERC-1271 contract that accepts any signature;
- the token mock (`HToken3009`) accepts any EIP-3009 or permit signature, but keeps the rules that matter: only the payee can redeem a receive-authorization, and each nonce works once.

The mock can also charge a fee: on every transfer, or only on transfers into the processor, or only into the payout. Signature checking itself is covered by unit and fuzz tests (`testFuzz_onlyMerchantKeyWorks`, the tampered-field tests, the ERC-1271 test).

| Contract | Proof | Property (for all inputs) |
|---|---|---|
| PaymentProcessor | `check_pay_noCustody_exactAmount` | A funded payer's `pay` always succeeds. The processor holds 0. The payout, which may already hold funds, gains exactly `amount`. The receipt records payer, payout, token, amount, `paidAt` and `paidBlock` exactly. |
| | `check_noDoublePay` | A paid invoice can't be paid again, by anyone. |
| | `check_refundsCapped` | Over any two refunds: `refunded ≤ amount`; the processor holds 0; any non-zero refund within the remainder succeeds; status matches `refunded`. Only the cap stops an over-refund. |
| | `check_statusOnlyForward` | Over any two operations, status only moves forward. |
| | `check_bumpNonceRevokes` | After `bumpNonce`, older invoices can't be paid. |
| | `check_cancelBlocksPay` | A cancelled invoice can't be paid. |
| | `check_payWithAuthorization_noCustody_boundNonce` | Gasless pay through any relayer always succeeds. The processor's stray balance is untouched, and the payout gains exactly `amount`. The EIP-3009 nonce **is** the invoice digest. No double pay. |
| | `check_payWithPermit_noCustody` | Pay with permit succeeds even when the permit was front-run. No custody; the receipt is Paid; no second payment through permit. |
| | `check_feeOnTransfer_alwaysReverts` | A fee-on-transfer token can't settle an invoice on any pay path, under any fee placement, even when the processor holds dust. |
| SubscriptionManager | `check_chargeRespectsIntervalAndCap` | There's no charge before the interval; `charged ≤ cap`; the manager holds 0. |
| | `check_subStatusMachine` | `charge` and `cancel` only move Active ⇄ PastDue → Cancelled, and Cancelled is terminal for them. Value is conserved: the payout's balance equals `charged`. |
| | `check_failedChargesCancelAfterMax` | Exactly 3 consecutive failures cancel; a success resets the count. Failures move no funds and don't advance the schedule. |
| | `check_onlyPartiesCancel` | Nobody but the payer or the merchant can cancel. |
| | `check_partiesCanCancelOnce` | The payer or the merchant can cancel, and a second cancel fails. |
| | `check_revokedPlanBlocksSubscribe` | Nobody can subscribe to a revoked plan. |
| | `check_invalidPlanRejected` | A plan with a zero amount or zero interval, or a cap below one cycle, is rejected. |
| | `check_subscribeExact_andFeeTokensRejected` | Subscribing pays exactly one cycle. With a fee-on-transfer token, `subscribe` reverts, and a later charge never records an underpayment. |

Two properties are covered by tests instead of proofs:
- **Charge liveness** (a due charge within the cap succeeds for exactly one cycle) is fuzzed with realistic times in `testFuzz_dueChargeWithinCapSucceeds`. Halmos also explores start times and intervals near 2⁶⁴, where `nextChargeAt` overflows, which is the SMTChecker case below.
- **Re-subscribing after a cancel** is allowed by design.

**Vacuity check:** `python3 test/halmos/vacuity.py` plants 13 bugs: one per original property, plus the worst Gambit survivors. Each makes its proof fail. A control mutant (a 0-token transfer, which changes no behaviour) survives, as it should.

## 2. Contracts: SMTChecker

- **Run:** `sdk/contracts/script/smt.sh` (CHC engine, z3, 20 s per query, about 7 min).
- **Targets:** assert, overflow, underflow, divByZero, outOfBounds, popEmptyArray.
- **Result:** 88 conditions proved safe; 13 unproved; no counterexamples.

Every unproved condition is Solidity 0.8 checked arithmetic. Its worst case is a revert, never a silent wrap:

| Where | Why it's not a bug |
|---|---|
| `balanceOf(x) - before` (PP 61, 89, 97; SM 129, 148) | It underflows only if a token's balance *falls* during a transfer to `x`, and then the call reverts. |
| `r.refunded + amount` (PP 105) | Halmos proves `refunded ≤ amount`, so it overflows only for a refund near 2²⁵⁶, which reverts. |
| `++minNonce` (PP 128) | It would take 2²⁵⁶ calls. |
| `now + interval`, `nextChargeAt += interval`, uint64 (SM 119, 130, 152) | These overflow only for times beyond 2⁶⁴ s (584 billion years). Then that subscription's charges revert, and no funds move. |
| `charged + amount` (SM 142, 151) | Halmos proves `charged ≤ cap`, so it overflows only near 2²⁵⁶, which reverts. |
| `failedCharges++`, uint8 (SM 157) | It never exceeds 3 (it's reset on success, and the subscription is cancelled at 3); `check_failedChargesCancelAfterMax` proves this. CHC can't infer that bound across calls. |

## 3. Contracts: mutation testing (Gambit)

- **Run:** `python3 sdk/contracts/test/mutation/run.py` (about 35 min). It needs `gambit` on PATH and regenerates `docs/mutation-report.md`.
- **How it works:** it generates mutants of both contracts and runs the Foundry suite on each, in parallel workers. Halmos then runs on the mutants that survive.
- **Run 1:** 165 mutants; 128 killed by Foundry and 12 more by Halmos (85%); 25 survived.
- **Survivors:** every one was a real gap; none were equivalent mutants. The report records each survivor and the test or proof added for it.
- **Spot check:** three of the worst survivors were re-planted in `vacuity.py`, and all are caught now. A full re-run would confirm the rest.

## 4. SDK: Quint models

These are in `specs/`; how to run them is in `specs/README.md`. Each model has a `FIXED` flag:
- `FIXED = false` models the code as it was;
- `FIXED = true` models it after the fixes.

So each model shows both the bug and the fix.

### Keeper (`specs/keeper.qnt`), mirroring `keeper.ts`

**Environment:**
- subscribe, cancel externally, change a payer's funding;
- reorg an unfinalized `Subscribed` log into another block;
- "poisoned" subscriptions, whose `charge()` throws.

**Invariants:**
- `noOverdue`: bounded liveness. A live, funded subscription is charged within a fixed slack of its due time or retry time.
- `noStorm`: no retry before the backoff.
- `copyNotAhead`: the keeper's copy of the schedule is never ahead of the chain.
- `wakeAhead`: there's always a pending wake-up.

**Results:**
- **Old keeper:** the model finds both bugs. The retry storm (bug 3) shows up as `noStorm`, and the reorg-hidden subscription (bug 8) as `noOverdue`.
- **Fixed keeper,** with every fault enabled: the simulator finds no violation over 5,000 random traces of 30 steps.
- **Caveat:** Apalache (exhaustive, 10 steps) found no violation on an earlier version of the fixed model. Since then, a ghost variable used only by the liveness invariant has changed. Re-run it with the command in `specs/README.md`.

### Indexer (`specs/indexer.qnt`), mirroring `sync` / `rollback` / `emit`

**Environment:**
- mine blocks, which may include payments;
- advance the finalized head;
- reorg any unfinalized suffix, which drops or re-includes the payments in it;
- inject RPC failures in the middle of the rollback, or between fetch chunks.

**Invariants:**
- `noDuplicateLogs`
- `consistent`: after a successful sync, the stored logs equal the canonical logs up to the cursor.
- `reorgReported`: every reported payment that is no longer canonical has an `invoice.reorged` event.
- `finalNeverRetracted`

**Results:**
- Old indexer: violates `noDuplicateLogs`, `consistent` and `reorgReported` (bugs 4–6).
- Fixed indexer: no violation over 5,000 random traces of 25 steps.

### What links the models to the code
Each counterexample was replayed as a hand-written regression test against the real `startKeeper` and `Indexer`. Those tests use fake dependencies and a fake chain, and each was confirmed to fail before its fix. Automatically replaying generated model traces against the code (#76) wasn't built.

## 5. SDK: differential and property tests

All in `sdk/packages/server/test/differential.test.mjs`. They're seeded, so a failure reproduces exactly.
- **`hashInvoice`:** the TS implementation equals `PaymentProcessor.hashInvoice` on anvil for 300 invoices. The first 40 mix in boundary values: zero, max uint256, max uint64, zero addresses.
- **Invoice codec:** for 200 random signed invoices, `decode(encode(x)) == x`. 4,000 corrupted or truncated payloads either throw `InvalidPaymentLinkError` or decode to something that fails the on-chain signature check.
- **Webhooks:** `verify(sign(body))` passes. Any one-character change to the body or the signature fails, as do a changed timestamp, a wrong secret or a missing header. The 300-second tolerance is enforced.

## 6. What is not covered

- **USDT's own behaviour.** The proofs use mock tokens. Whitechain's USDT (`0xcedf…55a7`) was checked live: permit, EIP-3009 and its domain, via `sableye doctor` and real payments. It isn't proved.
- **ECDSA inside the proofs.** It's abstracted away. Signatures are covered by tests and by OpenZeppelin's `SignatureChecker`.
- **The TypeScript code itself.** It's covered by tests pinned to the models; nothing proves the TS directly.
- **viem, the RPC node, and sequencer liveness.**
- **The React and checkout UI.** They're covered by component tests only.
- **Bounds.** The Apalache keeper check stops at 10 steps, and was last run before the final ghost-variable change. The Quint simulations are random, not exhaustive. The keeper model treats a pass as atomic and abstracts wall time to chain time.
- **Indexer edge case.** An RPC that doesn't support the `finalized` tag is treated as instantly final, by design. On such an RPC, reorgs aren't detected.

## 7. Re-running after SDK or contract changes

The models mirror specific code. When the code changes, update the model **first**, then re-check:

| You changed | Re-run | Update |
|---|---|---|
| `PaymentProcessor.sol` / `SubscriptionManager.sol` | `halmos --match-contract Halmos`, `python3 test/halmos/vacuity.py`, `script/smt.sh`, `python3 test/mutation/run.py` | The proofs in `test/halmos/`. Add a planted bug to `vacuity.py` for every new property. Re-triage the SMTChecker and Gambit results above. |
| `keeper.ts` | `specs/keeper.qnt` (commands in `specs/README.md`), `test/keeper.test.mjs` | Mirror the change in `fire` / `chargeOne` / `nextWake`. |
| `indexer.ts` (`sync` / `rollback` / `emit`) | `specs/indexer.qnt`, `test/indexer-faults.test.mjs` | Mirror the change in `sync`. |
| `invoice.ts`, `webhooks.ts` | `test/differential.test.mjs` | Add the new fields to the generators. |

Afterwards, run `forge build` in `sdk/contracts` before the SDK tests, because Halmos rebuilds `out/` without test artifacts.
