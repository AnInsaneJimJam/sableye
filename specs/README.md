# Quint models of the SDK

These are design-level models of the SDK's two concurrency-heavy components. Results and caveats are in [project-docs/VERIFICATION.md](../project-docs/VERIFICATION.md#4-sdk-quint-models).

| Model | Mirrors | Modules |
|---|---|---|
| `keeper.qnt` | `sdk/packages/server/src/keeper.ts` | `keeperFixed` (current code), `keeperBuggyPoison`, `keeperBuggyReorg` (before the fixes) |
| `indexer.qnt` | `sdk/packages/server/src/indexer.ts` | `indexerFixed` (current code), `indexerBuggy` (before the fixes) |

```sh
Q="npx -y @informalsystems/quint"
$Q typecheck keeper.qnt

# Random simulation. --backend=typescript avoids downloading the Rust evaluator, which hits GitHub's rate limit.
$Q run keeper.qnt  --backend=typescript --main=keeperFixed  --invariant=safety --max-steps=30 --max-samples=5000
$Q run indexer.qnt --backend=typescript --main=indexerFixed --invariant=safety --max-steps=25 --max-samples=5000

# Bounded model checking (Apalache, needs Java 17+, about 5 min). Set GITHUB_TOKEN so Quint can download Apalache.
GITHUB_TOKEN=$(gh auth token) $Q verify keeper.qnt --main=keeperFixed --invariant=safety --max-steps=10

# The "buggy" modules must FAIL. That shows each invariant can catch the bug it was written for.
$Q run keeper.qnt  --backend=typescript --main=keeperBuggyPoison --invariant=noStorm   --max-steps=40 --max-samples=3000
$Q run indexer.qnt --backend=typescript --main=indexerBuggy      --invariant=safety    --max-steps=25 --max-samples=3000
```

When `keeper.ts` or `indexer.ts` changes, mirror the change in the model before re-running.
