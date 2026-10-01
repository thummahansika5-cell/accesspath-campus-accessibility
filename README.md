# AccessPath

**Maps tell you where to go. AccessPath tells you whether you can get there — and how.**

AccessPath is a campus accessibility pilot. It helps people understand sample access information for campus locations, describe their needs in natural language, compare routes on a real interactive map, and report barriers to a shared activity record.

> Campus locations and accessibility details in this demo are sample data, not verified real-world conditions. Confirm access conditions on site.

## Problem

Conventional maps show where a place is but not whether a person can reach it based on their mobility, vision, hearing, or other access needs. Stairs, blocked ramps, unavailable elevators, and unclear entrances can make a seemingly short route unusable.

## Solution

AccessPath combines a seeded campus walking graph with location accessibility records. A route is calculated from those records and the user's structured or natural-language preferences. Routes are shown as polylines on an interactive Leaflet map with OpenStreetMap tiles. Community barrier reports are classified, stored in PostgreSQL, and visible in the report activity dashboard.

## Key features

- Nine sample campus locations with step-free entrance, ramp, elevator, accessible washroom, and notes fields.
- A campus route graph with distance, stairs, step-free status, ramp/elevator access, surface, steepness, and wheelchair suitability for each segment.
- Preference-aware route search and route alternatives. Hard constraints such as avoiding stairs or non-wheelchair-suitable segments are excluded.
- Interactive location map with markers, popups, route start/end markers, and distinct selected and alternative route polylines.
- Natural-language accessibility needs interpretation, with clearly labeled local demo mode when no AI provider is configured.
- Barrier reporting with structured classification and a report activity dashboard with persistent status changes.
- Email/password account registration and login. Passwords are bcrypt-hashed; API responses never include password hashes.

## AI integration

AI calls run only on the API server. Set `OPENAI_API_KEY` to enable OpenAI for needs interpretation, barrier analysis, and route instructions. `OPENAI_MODEL` optionally selects the model (defaults to `gpt-4.1-mini`).

Without an API key, the app uses deterministic phrase matching and rules-based barrier classification. Responses and UI badges identify these as **Demo mode**; the app never represents fallback logic as a live AI call. AI prompts are constrained to supplied user input and seeded route facts. Route and location data remain sample records and should be verified on site.

## Architecture

```text
React + Vite web app
  ├── React Query generated client (OpenAPI)
  ├── Leaflet / OpenStreetMap
  └── /api requests through the Replit project proxy
          ↓
Express 5 API server
  ├── Zod request/response validation (generated from OpenAPI)
  ├── preference-aware campus route graph
  ├── optional server-side OpenAI calls + explicit demo fallback
  └── bcrypt password hashes + signed JWTs
          ↓
PostgreSQL (Drizzle ORM)
  ├── users
  ├── locations + accessibility_features
  ├── route_nodes + route_segments
  └── accessibility_reports
```

## Tech stack

- Frontend: React, Vite, TypeScript, React Router, Tailwind CSS, TanStack React Query, Leaflet, React-Leaflet.
- Backend: Node.js, Express 5, TypeScript, Zod.
- Database: PostgreSQL, Drizzle ORM.
- AI: optional server-side OpenAI Chat Completions API.
- Maps: Leaflet with OpenStreetMap tiles (no paid map API key required).

## Database

The project uses its Replit PostgreSQL database through `DATABASE_URL`. Push the schema once before starting the API:

```bash
pnpm --filter @workspace/db run push
```

On API startup, `seedCampus()` idempotently adds the demo locations, features, route nodes, and route segments. The seed data is clearly marked as sample information and should be replaced with verified campus information before real-world use.

## Local setup

1. Install Node.js 24 and pnpm 10.
2. Install workspace packages:

   ```bash
   pnpm install
   ```

3. Copy `.env.example` to `.env` and provide the required values. Do not commit `.env`.
4. Push the development database schema:

   ```bash
   pnpm --filter @workspace/db run push
   ```

5. Start the API and web app in separate terminals:

   ```bash
   pnpm --filter @workspace/api-server run dev
   pnpm --filter @workspace/accesspath run dev
   ```

In Replit, the API and web app have managed workflows and share the project proxy. The web app uses the same-origin `/api` path by default; `VITE_API_BASE_URL` can set the API origin (for example, `https://api.example.com`) when the frontend is hosted separately.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Supplied by the Replit database in Replit deployments. |
| `JWT_SECRET` | Production | Secret used to sign account JWTs. Set a strong private value; never commit it. The Replit demo can use `SESSION_SECRET` if this is unset. |
| `OPENAI_API_KEY` | No | Enables live server-side OpenAI interpretation and classification. Without it, the app clearly labels local demo mode. |
| `OPENAI_MODEL` | No | OpenAI model name; defaults to `gpt-4.1-mini`. |
| `CORS_ORIGIN` | No | Comma-separated allowed origins. When unset, the API allows all origins for the Replit preview. |
| `VITE_API_BASE_URL` | No | API origin for an independently hosted frontend, such as `https://api.example.com`. Leave unset on Replit to use same-origin `/api`. Never put provider credentials in a `VITE_` variable. |

## API documentation

The OpenAPI source of truth is `lib/api-spec/openapi.yaml` (base path `/api`).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/healthz` | Health check |
| `GET` | `/api/locations` | List campus locations and access features |
| `GET` | `/api/locations/:id` | Get one campus location |
| `POST` | `/api/routes` | Calculate and compare access-aware routes |
| `POST` | `/api/ai/interpret-needs` | Interpret natural-language access preferences |
| `GET` | `/api/reports` | List saved barrier reports |
| `POST` | `/api/reports` | Classify and save a barrier report |
| `PATCH` | `/api/reports/:id/status` | Change a report to Reported, Under Review, or Resolved |
| `GET` | `/api/dashboard` | Report counts and recent activity |
| `POST` | `/api/auth/register` | Create an account and return a signed JWT |
| `POST` | `/api/auth/login` | Verify credentials and return a signed JWT |

Regenerate typed React hooks and Zod schemas after changing the contract:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Deployment

For Replit, publish the web and API services from the project. Configure `DATABASE_URL` and a strong `JWT_SECRET` in the deployment environment. Add `OPENAI_API_KEY` only if live AI is desired; the demo remains usable without it. Restrict `CORS_ORIGIN` when serving the frontend from another domain.

For a separate hosting setup, build the frontend with `pnpm --filter @workspace/accesspath run build` and deploy the static output from `artifacts/accesspath/dist/public`. Deploy `artifacts/api-server` as a Node service with `pnpm --filter @workspace/api-server run build` followed by `pnpm --filter @workspace/api-server run start`. Configure the same PostgreSQL schema on the target database, and set `VITE_API_BASE_URL`, `CORS_ORIGIN`, `DATABASE_URL`, and `JWT_SECRET` appropriately.

## 3–5 minute demo flow

1. Open **Plan a route**. The planner starts with **Main Gate → Computer Lab**, calculates the route, and draws the selected path and alternatives on the map.
2. Open **My access needs**, enter “I cannot use stairs and I don't mind walking a little farther,” and review the interpreted preferences and demo/live label.
3. Select **Use these preferences in route planner**. Compare route length, walking time, access score, and explanations, then select an alternative and see its polyline update.
4. Open **Report a barrier**. Select CSE Block, choose **Blocked ramp**, describe “Ramp near CSE Block entrance is blocked,” and submit.
5. Review the saved report analysis and its demo/live label.
6. Open **Campus activity**. Find the saved report, check the dashboard counts, and change its status to **Under Review** or **Resolved**.

## Future improvements

- Replace sample campus data with a verified survey and ongoing accessibility review.
- Add report moderation, evidence attachments, expiry dates, and notifications for changed conditions.
- Add accessible turn-by-turn guidance based on surveyed paths and landmarks.
- Test route and interface behavior with disabled campus community members and assistive technologies.
- Add more detailed surface quality, path width, construction closures, and temporary elevator outages.