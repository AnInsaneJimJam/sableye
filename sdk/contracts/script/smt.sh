#!/usr/bin/env bash
# solc SMTChecker (CHC engine, z3) on both contracts, in parallel, listing every unproved condition.
# Needs a `z3` binary on PATH (Halmos ships one: ~/.local/share/uv/tools/halmos/bin/z3). ~7 min.
# Triage of the result: docs/VERIFICATION.md#smtchecker
set -euo pipefail
cd "$(dirname "$0")/.."
SOLC=${SOLC:-$HOME/.local/share/svm/0.8.30/solc-0.8.30}
for c in PaymentProcessor SubscriptionManager; do
  "$SOLC" @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/ --base-path . --evm-version prague "src/$c.sol" \
    --model-checker-engine chc --model-checker-solvers z3 --model-checker-timeout 20000 \
    --model-checker-targets assert,overflow,underflow,divByZero,outOfBounds,popEmptyArray \
    --model-checker-contracts "src/$c.sol:$c" --model-checker-show-unproved --model-checker-show-proved-safe \
    2>&1 | grep -E "^(Warning: CHC|Info: CHC|  --> src)" | sed "s/^/[$c] /" &
done
wait
