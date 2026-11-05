# Changesets

Every PR that changes a published package adds a changeset: `pnpm changeset`, pick the packages and the bump,
write one line for the changelog. On `main`, the release workflow opens a "Version packages" PR; merging it
publishes to npm **with provenance** (a signed statement linking each tarball to the exact commit and CI run).
