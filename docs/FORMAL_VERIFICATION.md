# Formal verification: state of play (Phase 4)

> Read this before resuming Phase 4. It records what was done, what it found, and what's left.
> Tracking: umbrella **#57**. Open issues: **#50** (Halmos + SMTChecker, write VERIFICATION.md) and **#51** (Gambit mutation testing).

## Tool and language

- **Halmos 0.3.3 (pinned)**, a16z's symbolic executor for Foundry tests. Properties are written in **Solidity**, as test functions prefixed `check_`. Halmos proves each one for **all** inputs within its bounds (loop unrolling, calldata sizes) using the Z3 SMT solver.
- **Not Lean, and not Certora.** Lean would mean hand-written proofs in its own language, which is too heavy for a weekend. Certora uses its CVL language and its cloud prover needs an API key (stretch goal).
- **Halmos is bounded symbolic execution, not full formal verification.** Say so honestly in the final README / VERIFICATION.md.

## Where the work is

- **Branch `phase4/formal-verification`**, commit `03844a8`, branched from `main` at `9a4d5fb`.
- **File: `sdk/contracts/test/halmos/Processor.halmos.t.sol`.** It contains two test contracts, `ProcessorHalmos` and `SubscriptionsHalmos`.
- **The contracts haven't changed since the branch point** apart from NatSpec comments in `IPaymentProcessor.sol`, so the proofs still apply to the deployed code:
  - PaymentProcessor `0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5`
  - SubscriptionManager `0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78`
- **To resume:** rebase or merge the branch onto `main` first.

```sh
uv tool install halmos==0.3.3          # already installed on Anand's machine (~/.local/bin/halmos)
cd sdk/contracts
halmos --match-contract Halmos                         # all proofs
halmos --match-contract ProcessorHalmos --match-test refundsCapped   # one proof
```

**Gotchas:**
- Halmos **prefixes `--match-test` with `check_` itself**, so pass `refundsCapped`, not `check_refundsCapped`.
- Slither and Halmos run `forge clean` / build without test artifacts. Afterwards, run `forge build` before the TypeScript e2e tests (they load `out/*.t.sol` mocks).
- `via_ir = true` is on (needed for `payWithAuthorization`), so compiles are slow.

## Modelling choice (scope)

- **ECDSA can't be reasoned about symbolically.** So in the proofs the merchant is an **ERC-1271 contract that accepts any signature** (`AcceptAllSigner`). The proofs therefore cover **all the accounting and state logic**.
- **Signature checking itself is covered elsewhere:** unit and fuzz tests (`testFuzz_onlyMerchantKeyWorks`, tampered-field tests, ERC-1271 test) and OpenZeppelin's `SignatureChecker`.
- The token is a plain OpenZeppelin ERC-20 (`HToken`).

## The 7 proofs (all PASS)

| Proof | Property |
|---|---|
| `check_pay_noCustody_exactAmount` | A funded payer's valid `pay` **always succeeds** (a liveness assert). The processor holds 0 afterwards, and the payout receives exactly `amount`. |
| `check_noDoublePay` | Once paid, `pay` for the same invoice fails for **anyone**, at any allowance. |
| `check_refundsCapped` | For any two refunds of any size: `refunded ≤ amount`; the processor holds 0; a refund within the remainder always succeeds; if both succeed then `refunded == r1 + r2`; and status is a pure function of refunded vs amount (Paid / PartiallyRefunded / Refunded). The payout holds `extra` funds, so **only the contract's cap**, not the token balance, can stop an over-refund. |
| `check_statusOnlyForward` | For any 2 symbolic operations (pay / refund / cancel, any arguments), status only moves forward: None → Paid → PartiallyRefunded → Refunded, or None → Cancelled. |
| `check_bumpNonceRevokes` | After `bumpNonce`, no invoice with `nonce < minNonce` can be paid. |
| `check_cancelBlocksPay` | A cancelled invoice can never be paid. |
| `check_chargeRespectsIntervalAndCap` | Subscriptions: a charge before the interval always reverts; `charged ≤ cap`; the manager holds 0. |

## What it found: a real bug (fixed)

- **Counterexample:** `amount = 2^127`, `r1 = 0`, `r2 = 0`.
- **The bug:** `refund(orderId, 0)` on a paid invoice **succeeded**, flipped the status `Paid → PartiallyRefunded` with nothing refunded, and emitted `InvoiceRefunded`. Dashboards and webhooks would then report a refund that never happened.
- **Fix:** commit **`9a4d5fb`** on `main`. `refund` now reverts with `ZeroRefund()`.
  - Regression test: `test_revert_zeroRefund`.
  - Fuzz bounds adjusted.
  - The fix is in the deployed contract.

## Vacuity check (mutation testing, done by hand)

A proof can "pass" because every path reverts before reaching its assertions. So 5 bugs were planted in `PaymentProcessor.sol` and each proof was re-run against them. The contract was restored afterwards.

| Mutant | First run | After strengthening |
|---|---|---|
| Remove the refund cap | **PASSED (vacuous)**: the token's balance blocked the over-refund, not our cap | caught |
| Allow double pay (drop the status check) | caught | caught |
| Drop the nonce check | caught | caught |
| Short the payout (half to the processor) | **PASSED (vacuous)**: the mutant reverted on every path, so the asserts were never reached | caught |
| Refund reopens to `Paid` | **PASSED (vacuous)**: the status didn't change, which looked "forward" | caught |

**Strengthening that fixed the three vacuous cases:**
- liveness asserts (`assert(ok)` when the call must succeed);
- an `extra` balance on the payout;
- the status-vs-refunded consistency check.

**Lesson:** every new proof needs a mutant that proves it can fail. That's what #51 (Gambit) automates.

## Other assurance already in place (not formal)

- **Foundry:**
  - unit and fuzz tests: `PaymentProcessor.t.sol`, `Gasless.t.sol`, `TokenVariants.t.sol`, `SubscriptionManager.t.sol`;
  - invariant tests with a non-vacuity guard: `Invariants.t.sol`;
  - Chimera stateful properties for subscriptions, run by **Foundry and Medusa**: `test/recon/`. Medusa ran ~195k calls; two planted bugs were caught.
- **Slither:** clean in CI. Each suppression has a written justification.
- **Threat model and contract spec:** `docs/THREAT_MODEL.md`.

## What's left for Phase 4

1. Rebase `phase4/formal-verification` onto `main` and re-run all 7 proofs.
2. **#50:** turn on the solc **SMTChecker** for `PaymentProcessor` (overflow / assert checks), and write **`docs/VERIFICATION.md`**: what was proved (tool + bounds), what was fuzzed (runs, depth), and what is **not** covered (USDT token behaviour, sequencer liveness, ECDSA inside the proofs, the TypeScript SDK).
3. **#51:** **Gambit** mutation testing over `PaymentProcessor` and `SubscriptionManager`. Report the share of mutants killed per technique (unit, fuzz, invariant, Halmos) and investigate every survivor.
4. Optional:
   - a differential test that the TypeScript `hashInvoice` equals Solidity's over random invoices (`sableye doctor` already checks this against the live contract);
   - Certora, if an API key is available.
5. In the README, list what was proved, fuzzed, and not covered (the Level 4 "done when").
