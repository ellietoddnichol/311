# Copilot Instructions

## Project Overview

**Brighten Install** is a full-stack estimating platform for commercial specialty scope workflows (Division 10 first, expandable by design). It allows estimators to manage projects, perform takeoff, apply catalog items, calculate costs, and generate proposals.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Node.js + Express + TypeScript (served via `tsx`)
- **Database**: SQLite via `better-sqlite3`
- **AI Integration**: Google Gemini (via `@google/genai`) for proposal drafting, document parsing, and item matching
- **Forms**: `react-hook-form` + `zod` for validation
- **Tables**: `@tanstack/react-table`
- **Charts**: `recharts`
- **Routing**: `react-router-dom` v7
- **Path alias**: `@/*` maps to the repo root

## Repository Structure

```
/
├── server.ts              # Express entry point (serves API + Vite in dev)
├── src/
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # Root component with router
│   ├── types.ts           # Shared domain types (Project, Room, CatalogItem, etc.)
│   ├── index.css          # Global styles (Tailwind)
│   ├── components/        # Shared UI components (Layout, ErrorBoundary, shell, workspace, project)
│   ├── pages/             # Route-level page components (Dashboard, Projects, Catalog, Settings, etc.)
│   ├── context/           # React context providers
│   ├── services/          # Frontend API client (api.ts) and Gemini helpers (gemini.ts)
│   ├── shared/            # Shared utilities used by both client and server
│   └── utils/             # Frontend utility functions
│   └── server/
│       ├── db.ts          # SQLite connection singleton
│       ├── engine.ts      # Estimate calculation engine
│       ├── sheets.ts      # Google Sheets sync client
│       ├── db/            # Schema definitions and migrations
│       ├── repos/         # Repository layer (one file per entity)
│       ├── routes/v1/     # Express v1 API route handlers
│       └── services/      # Server-side business logic services
├── .env.example           # Environment variable template
├── Dockerfile             # Container build
├── vite.config.ts         # Vite configuration
└── tsconfig.json          # TypeScript configuration
```

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Express + Vite HMR) on PORT (default 3000)
npm run build        # Production Vite build
npm run lint         # Type-check with tsc --noEmit (no test runner is configured)
```

There is **no test runner** configured. Validate changes by running `npm run lint` (type-check) and manually testing via the dev server.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `DATABASE_URL` | SQLite file path (default `estimator.db`) |
| `GEMINI_API_KEY` | Google AI Studio key for Gemini models |
| `GOOGLE_SERVICE_ACCOUNT` | Google service account JSON for Sheets sync |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Master data spreadsheet |

## API Structure

- **Legacy API**: `/api/*` — kept stable during rebuild
- **v1 API**: `/api/v1/*` — new normalized endpoints:
  - `GET /api/v1/health`
  - `GET|POST /api/v1/projects`
  - `GET|PUT|DELETE /api/v1/projects/:id`
  - `GET|POST /api/v1/rooms`
  - `GET|POST /api/v1/takeoff/lines`
  - `GET /api/v1/takeoff/summary/:projectId`
  - `GET|PUT /api/v1/settings`

## Key Domain Concepts

- **Project**: Top-level entity with settings, rooms, scopes, lines, and proposal settings.
- **Room**: A physical space within a project used to group takeoff lines.
- **Scope**: A work scope/division (e.g., Division 10 – Specialties) with a pricing mode (`material_only` or `material_and_labor`).
- **CatalogItem**: A priced item with SKU, UOM, base material cost, and base labor minutes. Synced from Google Sheets.
- **ProjectLine / TakeoffLine**: A quantity-linked reference to a catalog item (or manual entry) within a room and scope.
- **Bundle**: A named group of catalog items that can be applied together.
- **Modifier**: A price/labor adjustment option grouped under a `ModifierGroup`.
- **EstimateResult**: The calculated output from `engine.ts` — totals by room, scope, and alternate.

## Code Conventions

- All shared domain types live in `src/types.ts`. Add new types there.
- The repository pattern is used for all DB access: one `*Repo.ts` file per entity in `src/server/repos/`.
- Use `better-sqlite3` synchronous APIs (no `async/await` in repo files unless wrapping sync calls).
- Route handlers are thin — delegate logic to repos and services.
- Frontend API calls go through `src/services/api.ts`; do not call `fetch` directly in components.
- Use Tailwind utility classes for styling; avoid inline styles and custom CSS unless necessary.
- Prefer `clsx` + `tailwind-merge` (via the `cn` utility) for conditional class names.
- Use `zod` schemas for runtime validation on both form inputs and API request bodies.
- Google Sheets is a **read-only master-data source**; never write back to Sheets from the app.
