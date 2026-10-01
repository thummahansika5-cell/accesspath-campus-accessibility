# AccessPath

AccessPath combines a campus access-information record, an accessibility-aware route planner, and community barrier reports on a real interactive map.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/accesspath/` — React/Vite web application.
- `artifacts/api-server/src/routes/accesspath.ts` — REST handlers for campus, routing, AI, reports, dashboard, and accounts.
- `artifacts/api-server/src/lib/campus-routing.ts` — route-graph search and route scoring.
- `artifacts/api-server/src/lib/accesspath-ai.ts` — optional backend OpenAI calls and explicit demo fallbacks.
- `artifacts/api-server/src/lib/seed-campus.ts` — idempotent sample campus locations, features, nodes, and segments.
- `lib/api-spec/openapi.yaml` — API source of truth; regenerate client and validation schemas with the codegen command above.
- `lib/db/src/schema/` — PostgreSQL Drizzle table definitions.
- `README.md` — local setup, API map, deployment, environment variables, and hackathon demo path.

## Architecture decisions

- Campus routing is deliberately limited to a seeded graph; the app is a campus pilot, not a general street-routing service.
- Every campus access record is explicitly sample data and requires on-site verification.
- OpenAI is optional and is called only from the API server; without `OPENAI_API_KEY`, local parsing/classification is labeled demo mode.
- Account passwords are bcrypt-hashed. Use `JWT_SECRET` for deployments; `SESSION_SECRET` is a Replit demo fallback.

## Product

People can inspect sample campus accessibility conditions, describe their needs, compare routes on a Leaflet/OpenStreetMap map, submit barrier reports, and track report status.

## User preferences

- Complete functional MVP expected in one build; no placeholder buttons, fake navigation, or fake map panels.
- Keep AI fallback mode visibly distinct from live AI behavior.

## Gotchas

- Push the Drizzle schema before starting the API. API startup then seeds demo campus graph data.
- Add `DOM.Iterable` to the React Query API client TypeScript libraries when generated fetch code uses `Headers.entries()`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
