# Arslan Transport 2.0

Arslan Transport 2.0 is a transport operations platform built on TransportFlow. It brings shipments, master records (companies, drivers, vehicles, truck types, routes), expenses, driver advances and payouts, company receivables, invoices, shipment documents, and reporting into one multi-tenant web application.

It runs in two modes: a self-contained **demo mode** backed by browser storage, and a **Supabase mode** for the Arslan Transport pilot organization.

## Features

- **Shipments** – one-page create/edit form (shipment details, driver details, remarks, live totals), multi-driver legs, status workflow, and a searchable register sorted newest invoice first
- **Automatic invoicing** – each new shipment creates its invoice in the same database transaction; A4 tax-invoice preview, print, and download
- **Driver ledger** – an initial driver advance can be entered on the shipment form and is recorded as a driver payment; later advances and payouts are added from the shipment
- **Company receivables** – invoice-level payments, reversals, and balances
- **Expenses** – billable and driver-reimbursable expense rules with approval
- **Directory** – companies, drivers, vehicles, and truck types
- **Documents** – private shipment attachments stored in Cloudflare R2 behind signed, time-limited URLs
- **Reports and finance** – profit, revenue, and receivables views with exports
- **Access control** – organization-scoped data through Supabase Auth and Row Level Security
- **Landing page** – public marketing site served alongside the app

## Technology

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts |
| Documents | pdf-lib, html2canvas, read-excel-file (imports) |
| Data and authentication | Supabase Postgres, Auth, Row Level Security, SQL workflow functions |
| Storage | Cloudflare R2 through Supabase Edge Functions |
| Quality | Vitest, Testing Library, Playwright, ESLint |

## Architecture

The Vite build has two entry points:

| Path | Entry | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Public landing page (`src/landing/`) |
| `/app/` | `app/index.html` | Operations application (`src/main.tsx`) |

Financial writes go through Postgres functions in `supabase/migrations/` (for example, shipment creation together with its invoice and initial advances), so totals, balances, and ledgers stay consistent. The frontend reads through services in `src/services/` and keeps state in hooks under `src/hooks/`.

```text
.
|-- app/             Application HTML entry (served at /app/)
|-- docs/            Product, architecture, setup, import, and quality documentation
|-- e2e/             Browser smoke tests
|-- import-data/     Source workbooks used by controlled import scripts
|-- scripts/         Import, reconciliation, validation, and test utilities
|-- src/
|   |-- components/  Shared UI, modals, and print templates
|   |-- pages/       Application screens
|   |-- landing/     Public landing page
|   |-- templates/   Standalone A4 invoice template
|   |-- hooks/       Data hooks (demo and Supabase)
|   |-- services/    Supabase data access
|   |-- domain/      Financial domain logic and tests
|   `-- utils/       Formatting, calculations, and permissions
`-- supabase/
    |-- migrations/  Database schema, RLS policies, and workflow functions
    |-- functions/   R2 signed-URL Edge Functions
    `-- tests/       Database tests
```

Runtime-critical directories and configuration files stay at stable paths so imports, scripts, migrations, and deployment do not depend on the documentation layout.

## Getting started

### Prerequisites

- A current Node.js LTS release and npm
- A Supabase project, only for Supabase mode

### Install

```bash
git clone https://github.com/rummanhassan13/arslan-transport-2.0.git
cd arslan-transport-2.0
npm ci
```

### Configure

Create `.env.local` in the repository root. It is ignored by Git.

| Variable | Mode | Purpose |
| --- | --- | --- |
| `VITE_DEMO_MODE` | Both | `true` for demo mode, `false` for Supabase mode. If unset, development uses demo mode and production builds use Supabase mode. |
| `VITE_SUPABASE_URL` | Supabase | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` | Supabase | Public client key |

`NEXT_PUBLIC_` equivalents of the Supabase variables are also accepted. Never put service-role keys or other secrets in frontend environment variables.

### Run

```bash
npm run dev
```

Open the app at `http://localhost:5173/app/` (the landing page is at `/`). Supabase mode signs in with accounts created in Supabase Auth; public sign-up is not enabled.

See the [environment setup guide](docs/development/ENVIRONMENT_SETUP.md) for onboarding users, applying migrations, Cloudflare R2 configuration, and troubleshooting.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Validate the TypeScript project |
| `npm run lint` | Run ESLint on `src`, `scripts`, `e2e`, and config |
| `npm test` | Run the full Vitest suite |
| `npm run test:unit` | Run domain, utility, and hook tests |
| `npm run test:e2e` | Run the Playwright browser smoke workflow |
| `npm run test:db` | Validate the logic-remediation migration |
| `npm run import:*` | Controlled April 2026 and historical data imports (see the [import runbooks](docs/README.md#data-imports)) |

Run `typecheck`, `lint`, `test`, and `build` before opening or merging a pull request.

## Deployment

1. Apply any new files in `supabase/migrations/` to the Supabase project, in order, before deploying frontend code that depends on them.
2. Build with `npm run build`. The output in `dist/` contains both the landing page and `/app/`.
3. In the hosting provider's environment settings, set `VITE_DEMO_MODE=false`, `VITE_SUPABASE_URL`, and the publishable or anon key.
4. Deploy the Supabase Edge Functions in `supabase/functions/` when they change.

The [logic remediation handoff](docs/quality/LOGIC_REMEDIATION_HANDOFF.md) describes the deployment sequence, quality gates, and rollback boundary.

## Documentation

The [documentation index](docs/README.md) covers product context and roadmap, architecture decisions and database design, environment setup, data-import runbooks, and quality and remediation records.

## Security

- `.env*` files, build output, and local tool folders are ignored by Git.
- The frontend uses only the Supabase publishable or anon key; service-role keys, database passwords, and R2 secrets stay server-side.
- All data access is organization-scoped through Row Level Security.
- Shipment documents are private and served through time-limited signed URLs.

## Conventions

- User-facing wording: **Company** is the customer being billed; **Business profile / My business** is your own organization.
- Money-affecting changes go through ledger tables and database workflow functions, not direct column writes.
- Keep detailed records under `docs/` with repository-relative links, and keep this README as the repository landing page.

## Project status

Actively developed for the Arslan Transport pilot. Review the [roadmap](docs/product/ROADMAP.md) before planning production changes.
