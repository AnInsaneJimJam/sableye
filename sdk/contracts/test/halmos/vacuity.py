# Vacuity check for the Halmos proofs: plant one bug per proof and confirm that proof fails.
# Run from sdk/contracts: python3 test/halmos/vacuity.py   (restores every file after each mutant)
import subprocess, shutil, sys, re
M = [
 ("src/PaymentProcessor.sol","validBefore, hashInvoice(inv), v, r, s)","validBefore, bytes32(0), v, r, s)","ProcessorPathsHalmos","payWithAuthorization_noCustody_boundNonce","3009 nonce not bound"),
 ("src/PaymentProcessor.sol","        _push(inv, token);\n","","ProcessorPathsHalmos","payWithAuthorization_noCustody_boundNonce","gasless keeps funds"),
 ("src/PaymentProcessor.sol","try IERC20Permit(inv.token).permit(msg.sender, address(this), inv.amount, deadline, v, r, s) {} catch {}","IERC20Permit(inv.token).permit(msg.sender, address(this), inv.amount, deadline, v, r, s);","ProcessorPathsHalmos","payWithPermit_noCustody","front-run permit blocks pay"),
 ("src/PaymentProcessor.sol","        token.safeTransferFrom(msg.sender, inv.payout, inv.amount);\n        if (token.balanceOf(inv.payout) - before != inv.amount) revert FeeOnTransferNotSupported();","        token.safeTransferFrom(msg.sender, inv.payout, inv.amount);","ProcessorPathsHalmos","feeOnTransfer_alwaysReverts","no fee check on pull"),
 ("src/SubscriptionManager.sol","if (s.failedCharges >= MAX_FAILED_CHARGES)","if (s.failedCharges > MAX_FAILED_CHARGES)","SubscriptionsHalmos","failedChargesCancelAfterMax","off-by-one auto-cancel"),
 ("src/SubscriptionManager.sol","            s.failedCharges = 0;\n","","SubscriptionsHalmos","failedChargesCancelAfterMax","success doesn't reset failures"),
 ("src/SubscriptionManager.sol","            s.failedCharges++;\n","            s.failedCharges++;\n            s.nextChargeAt += s.interval;\n","SubscriptionsHalmos","failedChargesCancelAfterMax","failure advances schedule"),
 ("src/SubscriptionManager.sol","        if (msg.sender != s.payer && msg.sender != s.merchant) revert NotAuthorized();\n","","SubscriptionsHalmos","onlyPartiesCancel","anyone can cancel"),
 ("src/SubscriptionManager.sol","        if (planRevoked[plan.merchant][plan.planId]) revert PlanIsRevoked();\n","","SubscriptionsHalmos","revokedPlanBlocksSubscribe","revocation ignored"),
 ("src/SubscriptionManager.sol","        if (s.status != Status.Active && s.status != Status.PastDue) revert NotActive(s.status);\n        // slither-disable-next-line timestamp -- billing","        if (s.status == Status.None) revert NotActive(s.status);\n        // slither-disable-next-line timestamp -- billing","SubscriptionsHalmos","subStatusMachine","charge revives Cancelled"),
 ("src/SubscriptionManager.sol","        ok = token.trySafeTransferFrom(s.payer, s.payout, s.amount);","        ok = token.trySafeTransferFrom(s.payer, s.payout, s.amount);\n        if (ok) token.safeTransferFrom(s.payer, address(this), 0);","SubscriptionsHalmos","subStatusMachine","(equivalent control: 0-transfer)"),
]
for f,a,b,c,t,name in M:
    src=open(f).read(); assert src.count(a)==1,(name,src.count(a))
    open(f,'w').write(src.replace(a,b))
    try:
        out=subprocess.run(["halmos","--match-contract",c,"--match-test",t],capture_output=True,text=True).stdout
        res="CAUGHT" if "[FAIL]" in re.sub(r'\x1b\[[0-9;]*m','',out) else ("ERROR" if "[PASS]" not in out else "SURVIVED")
    finally:
        open(f,'w').write(src)
    print(f"{res:9} {name}  ({t})",flush=True)
