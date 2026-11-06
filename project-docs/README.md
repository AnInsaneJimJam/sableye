# Project documents

Internal project records and reference material live here. The developer documentation website lives in `frontend/src/app/docs/` and is served at `/docs` by the frontend.

- [Project overview and roadmap](PROJECT.md)
- [Threat model](THREAT_MODEL.md)
- [Verification results](VERIFICATION.md)
- [Mutation testing report](mutation-report.md)
- [SDK documentation audit](SDK_AUDIT.md)
- [AI integration evaluation](AI_EVAL.md)
- [Pitch](PITCH.md)
- [Historical demo handoff](DEMO_HANDOFF.md)

Start the website from `frontend/` with `bun run dev`, or from the repository root with `pnpm --filter sableye-frontend dev`. Open http://localhost:3000/docs (use the port printed by Next.js).

Website maintenance: [frontend documentation guide](../frontend/docs/DOCUMENTATION.md).
