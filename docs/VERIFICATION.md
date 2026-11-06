# Verification

What is proved, model-checked and tested in Sableye, and what isn't. Umbrella issue: #57.

> Work in progress (Phase 4). Sections are added as each issue closes; #78 writes the final summary.

## Halmos: symbolic proofs of the contracts

- **File:** `sdk/contracts/test/halmos/Processor.halmos.t.sol`. Uses Halmos 0.3.3 (pinned) with Z3.
- **What a proof covers:** each `check_` function is proved for every value of its parameters. No `bounds` were hit: neither contract has loops.
- **Run:** `halmos --match-contract Halmos` (about 25 s).
- **Model:**
  - The merchant is an ERC-1271 contract that accepts any signature, and the token mock accepts any EIP-3009 or permit signature, because ECDSA can't be reasoned about symbolically.
  - The token mock keeps the rules that matter: only the payee can redeem a receive-authorization, and each nonce works once.
  - Signature checking itself is covered by unit and fuzz tests.

| Contract | Proof | Property |
|---|---|---|
| PaymentProcessor | `check_pay_noCustody_exactAmount` | A funded payer's valid `pay` always succeeds. The processor holds 0 afterwards, and the payout gets exactly `amount`. |
| | `check_noDoublePay` | A paid invoice can't be paid again, by anyone. |
| | `check_refundsCapped` | Over any two refunds: `refunded ≤ amount`; the processor holds 0; status matches `refunded` exactly. Only the cap stops an over-refund, not the payout's balance. |
| | `check_statusOnlyForward` | Over any two operations, status only moves forward. |
| | `check_bumpNonceRevokes` | After `bumpNonce`, older invoices can't be paid. |
| | `check_cancelBlocksPay` | A cancelled invoice can't be paid. |
| | `check_payWithAuthorization_noCustody_boundNonce` | Gasless pay through any relayer always succeeds and keeps no custody. The payout gets exactly `amount`. The EIP-3009 nonce **is** the invoice digest, and there's no double pay. |
| | `check_payWithPermit_noCustody` | Pay with permit succeeds and keeps no custody, even when the permit was front-run. |
| | `check_feeOnTransfer_alwaysReverts` | A fee-on-transfer token can't settle an invoice on any of the three pay paths, for any fee. |
| SubscriptionManager | `check_chargeRespectsIntervalAndCap` | There's no charge before the interval ends; `charged ≤ cap`; the manager holds 0. |
| | `check_subStatusMachine` | `charge` and `cancel` only move Active ⇄ PastDue → Cancelled, and Cancelled is terminal for them. Value is conserved: the payout's balance equals `charged`. |
| | `check_failedChargesCancelAfterMax` | Exactly 3 consecutive failures cancel the subscription. A success resets the count. Failures move no funds and don't advance the schedule. |
| | `check_onlyPartiesCancel` | Only the payer or the merchant can cancel. |
| | `check_revokedPlanBlocksSubscribe` | Nobody can subscribe to a revoked plan. |

Notes on the model:
- **Re-subscribing:** a payer may subscribe again after a cancel, which starts a new cycle. That's by design, so "terminal" applies only to `charge` and `cancel`.
- **Bug found:** Halmos found the zero-refund bug: `refund(id, 0)` flipped the status with nothing refunded. It was fixed in `9a4d5fb`.

### Vacuity check
A proof can pass because every path reverts before reaching an assert. `python3 test/halmos/vacuity.py` plants one bug per property and checks that its proof fails.

- **Result:** all 10 planted bugs are caught.
- **Control:** an equivalent mutant (a 0-token transfer) survives, as it should.

## SMTChecker

- **Run:** `sdk/contracts/script/smt.sh`. It uses solc 0.8.30's CHC engine with z3 and a 20 s query timeout, on both contracts (about 7 min).
- **Targets:** assert, overflow, underflow, divByZero, outOfBounds, popEmptyArray.
- **Result:** 88 conditions proved safe; 13 unproved (5 in PaymentProcessor, 8 in SubscriptionManager); no counterexamples.

Every unproved condition is Solidity 0.8 checked arithmetic. Its worst case is a revert, never a silent wrap.

| Where | Why it's not a bug |
|---|---|
| `balanceOf(x) - before` (PP 61, 89, 97; SM 129, 148) | This underflows only if a token's balance *falls* during a transfer to `x`, and then the payment reverts. |
| `r.refunded + amount` (PP 105) | Halmos proves `refunded ≤ amount`, so this overflows only for a refund near 2²⁵⁶, which reverts. |
| `++minNonce` (PP 128) | It would take 2²⁵⁶ calls to overflow. |
| `now + interval` and `nextChargeAt += interval`, uint64 (SM 119, 130, 152) | These overflow only for an interval of more than 584 billion years. Such a plan can't be subscribed to, or its later charges revert. No funds move. |
| `charged + amount` (SM 142, 151) | Halmos proves `charged ≤ cap`, so this overflows only near 2²⁵⁶, which reverts. |
| `failedCharges++`, uint8 (SM 157) | It never exceeds 3: it's reset on success and the subscription is cancelled at 3. CHC can't infer that bound across calls; `check_failedChargesCancelAfterMax` proves it. |
