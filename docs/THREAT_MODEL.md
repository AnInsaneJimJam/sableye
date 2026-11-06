# Sableye: threat model and contract spec

Scope: `PaymentProcessor.sol`, `SubscriptionManager.sol`, and the server SDK paths that move money (relayer, refunds, keeper).
Status: Phase 1. Formal verification is Phase 4 (#57).

## 1. System in one paragraph

A merchant signs EIP-712 **invoices** (and **subscription plans**) off-chain. A customer pays an invoice by calling `PaymentProcessor.pay*`, which moves the token **directly** from customer to the merchant's payout address. On the gasless path, the token passes through the processor and out within the same transaction. Subscriptions pull one cycle per interval from a customer-set cap. Both contracts have **no owner, no admin, no upgrade path and no fees**, and never hold a balance.

## 2. Actors and what they control

| Actor | Controls | Trusted for |
|---|---|---|
| Merchant | Merchant key (signs invoices/plans; sends refunds, cancels, charges, relays) | Their own invoices only |
| Customer (payer) | Their wallet; approvals; EIP-3009/permit signatures | Their own funds |
| Relayer (= merchant server) | Submits gasless payments, pays WBT | Nothing: it can't change what a signed authorization pays |
| Keeper (anyone) | Calls `charge(subId)` | Nothing: funds only go to the plan's payout, at most once per interval |
| Sableye team | Publishes the SDK and contracts | Nothing at runtime: no admin keys exist |
| Token issuer (USDT) | Token contract, blacklist | Token correctness (out of our control) |
| Whitechain sequencer | Ordering and inclusion | Liveness; reorgs before `safe`/`finalized` |
| RPC provider | Reads/writes | Liveness; sees request metadata |

## 3. Assets

1. Customer funds (allowances, balances, signed authorizations).
2. Merchant revenue (the payout balance; refund exposure through the payout's approval).
3. Merchant WBT (relayer and keeper gas).
4. Merchant key.
5. Integrity of the payment record (receipts, events, indexer state, webhooks).

## 4. Contract spec (what must always hold)

| # | Property | Enforced by | Evidence |
|---|---|---|---|
| S1 | The processor's / manager's token balance never changes | Direct `payer → payout`; gasless path forwards within the tx | Invariant `processorHoldsNothing`, Medusa `managerHoldsNothing`, Halmos (Phase 4 branch) |
| S2 | An invoice is paid at most once | Receipt written before transfer; status check | Unit `test_revert_doublePay`, invariant `noDoublePay` |
| S3 | Refunded ≤ paid, per invoice | `total > amount` revert; zero refunds rejected | Fuzz `refundCapped`, invariant `refundsNeverExceedPayments` |
| S4 | Status only moves forward | Explicit transitions | Invariant `statusOnlyMovesForward` |
| S5 | Only the merchant's signature authorizes an invoice/plan | OZ `SignatureChecker` (EOA + ERC-1271) | Fuzz `onlyMerchantKeyWorks`, tamper tests, ERC-1271 test |
| S6 | Payout receives exactly the invoiced amount | Balance-delta check (fee-on-transfer rejected) | `test_revert_feeOnTransfer`, token-variant tests |
| S7 | A gasless authorization can only pay the invoice it was signed for | EIP-3009 nonce = `hashInvoice(invoice)`; `receiveWithAuthorization` (only redeemable by the processor) | `test_revert_authorizationReusedForOtherInvoice`, `test_revert_relayerCannotRedirectPayout` |
| S8 | Revoked invoices can't be paid | `cancelInvoice`; `nonce < minNonce` revert | `test_cancelInvoice`, `test_bumpNonceRevokesOldInvoices` |
| S9 | Subscription charges ≤ amount × cycles elapsed and ≤ cap | `NotDue`, `CapReached`, `nextChargeAt += interval` | Fuzz `chargesNeverExceedSchedule`, Medusa + Foundry `chargesWithinSchedule` |
| S10 | Cancel stops all future charges | Status check in `charge` | Medusa + Foundry `cancelStopsCharges` (mutation-checked) |
| S11 | No re-entrancy into pay/refund/subscribe/charge | `nonReentrant` (transient storage) and checks-effects-interactions | Slither clean |

## 5. Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Forged or tampered invoice (amount, payout) | EIP-712 merchant signature over every field | None known |
| Replay: paying the same invoice twice | Per-merchant `orderId` receipt; status check | None |
| Merchant key theft | Key stays on the server only; SDK throws `secret_in_client` in browsers; KMS signer interface; `bumpNonce()` mass-revokes invoices | A stolen key can sign invoices (money *in* only) and **send refunds up to amounts paid**. Rotate the key, and pick a payout whose approval you control |
| Relayer drain (Scale track) | Own invoices only; signature verified locally; simulate before send; one submission per invoice; gas cap; per-IP rate limit | A determined attacker can make the relayer do signature checks (CPU), not spend WBT |
| Relayer front-running / redirecting the gasless payment | `receiveWithAuthorization` (`to` = processor only), nonce bound to the invoice hash | None |
| Permit front-run griefing | `payWithPermit` wraps `permit` in try/catch | None |
| Malicious keeper charging subscriptions | `charge` only pays the stored payout, once per interval, within the cap | None |
| Customer's empty wallet / revoked allowance | Charge doesn't revert; it goes `past_due`, then cancels after 3 failures | Merchant revenue loss (business risk, as with cards) |
| Fee-on-transfer / rebasing token | Balance-delta checks revert | Rebasing tokens are unsupported; use plain stablecoins |
| Token blacklist (USDT freezes an address) | Payment reverts cleanly; the invoice stays payable | Out of our control |
| Payout named as someone else's approved address (refund pull) | Refund capped at what that invoice delivered to the payout, so the net effect on that address is ≤ 0 | None (see the Slither annotation in `refund`) |
| Chain reorg after "paid" | Indexer tracks pending → safe → final, rolls back to the common ancestor, emits `invoice.reorged` | Merchants fulfilling at `pending` accept reorg risk. Fulfil at `safe` for high value |
| Webhook spoofing / replay | HMAC-SHA256 over `t.body`, constant-time compare, 5-minute tolerance, stable event ids | Receiver must dedupe on `event.id` |
| Phishing payment links | Links carry no secrets; checkout verifies the signature and expiry client-side; links are revocable | Users can still be phished to a look-alike domain (Phase 3: Swarm/ENS) |
| Sableye team disappears or is compromised | No admin keys, no upgrades, no fees; open source | A malicious *future* SDK release (mitigated by npm provenance, #55) |
| AI agent misuse (MCP) | Agents can only create money-in invoices; refunds come back as **unsigned** transactions | The merchant must read the summary before signing |

## 6. Out of scope / not covered

- Correctness of the token contract and of OpenZeppelin libraries.
- Sequencer censorship (Whitechain is an OP Stack L2; forced inclusion via L1 is the escape hatch).
- Privacy: payments are public on-chain (Phase 2 adds encrypted off-chain fields on Arkiv).
- Formal proofs: Phase 4 (#57). Today's evidence is unit, fuzz, invariant and stateful fuzzing (Medusa), plus Slither.
