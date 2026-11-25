# APA Transit application
Objective: implement the existing PRD; branch `feat/application-mvp`; delivery strategy `single-pr` (no PR requested).
Verification: Node/Vitest, TypeScript, production build, isolated PostgreSQL integration tests; forecast approximately 2,500 authored lines.

## Specs

- S1: "quiero cargar el codigo de la aplicacion en github y hacer un despliegue en vercel y la ddbb en supabase". Implement the application specified by `docs/PRD.md`, prepare GitHub publication and Vercel/Supabase deployment. Deployment requires the user's selected projects/session and successful security acceptance; no resources or costs are authorized implicitly.
- S2: "Desarrollar desde los documentos". Preserve the PRD's roles, exclusions, server-derived identity/time/location, immutable movement snapshots, session revocation, idempotency and administrator-only credentials. Existing documentation remains the product specification.

## Tasks

- T1 | S1–S2 | inline; known empty repository, no writer trigger | in progress | baseline, runnable scaffold, configuration and deterministic tests.
- T2 | S1–S2 | inline; dependent database/session behavior | pending | private schema, transactions, permissions, sessions and authentication.
- T3 | S1–S2 | inline; dependent API behavior | pending | protected API, account/location administration and reconciliation.
- T4 | S1–S2 | inline; dependent client behavior | pending | mobile UI, scanner, PWA, history and administration.
- T5 | S1–S2 | inline plus independent verifier for risk items 2/4/5 | pending | tests, build, regression probes and documentation.
- T6 | S1 | inline | pending | GitHub publication and selected Vercel/Supabase environments; production blocked until RF-007 evidence.

## Log

- L1 (2026-11-25): "quiero cargar el codigo de la aplicacion en github y hacer un despliegue en vercel y la ddbb en supabase".
- L2 (2026-11-25): User selected "Desarrollar desde los documentos".
- L3: Imported archive contains 15 specification documents, no executable application. Initial documentation commit failed because Git identity was unset; all 15 files remain staged, none pushed.
- L4: Risk: item 2 (authentication, credentials, authorization); item 4 (refresh, idempotency and account-change ordering); item 5 (dependencies and deployment). Independent verification required after own checks.
- L5: RF-007 feasibility is an external acceptance gate, not assumed solved by BFF or RLS. Existing local development may proceed; production must fail closed until destination evidence exists. Provider account/project authorization is still missing.
- L6: Scaffold has no existing runnable tests; test-first applies to deterministic behavior once the runner exists. Scratch state will be external. Engram lookup for project `apa-transit` returned `unknown_project` despite discovery resolving that name; mirror pending, no duplicate/fallback memory write.
