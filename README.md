# Arslan Transport 2.0

Arslan Transport 2.0 is a full-stack transport operations platform built on TransportFlow. It brings shipments, master records, expenses, driver reimbursements, payments, invoices, documents, and reporting into one multi-tenant application.

The application supports both a self-contained demo mode and a Supabase-backed live mode for the Arslan Transport pilot organization.

## Core capabilities

- Shipment creation, assignment, status tracking, and route management
- Client, driver, vehicle, and saved-location master records
- Shipment expenses, receipts, and driver reimbursement workflows
- Client and driver payment ledgers
- Invoice preparation and financial reporting
- Private shipment documents backed by signed Cloudflare R2 URLs
- Organization-scoped access through Supabase Auth and Row Level Security

## Technology

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Data and authentication | Supabase Postgres, Auth, Row Level Security |
| Storage integration | Cloudflare R2 through Supabase Edge Functions |
| Charts and UI | Recharts, Lucide React |
| Quality | Vitest, Testing Library, Playwright, ESLint |

## Repository structure

```text
.
|-- docs/          Product, architecture, setup, import, and quality documentation
|-- e2e/           Browser smoke tests
|-- import-data/   Source workbooks used by controlled import scripts
|-- scripts/       Import, reconciliation, validation, and test utilities
|-- src/           React application and domain code
|-- supabase/      Database migrations, tests, seeds, and Edge Functions
`-- README.md      Repository overview and contributor entry point
```

Runtime-critical directories and configuration files remain at stable paths so application imports, scripts, migrations, and deployment behavior are not coupled to the documentation layout.

## Local development

### Prerequisites

- A current Node.js LTS release
- npm
- Supabase credentials only when running in live mode

### Install and run

```bash
git clone https://github.com/rummanhassan13/arslan-transport-2.0.git
cd arslan-transport-2.0
npm ci
```

Create a local `.env.local` file for one of the supported modes.

Demo mode:

```env
VITE_DEMO_MODE=true
```

Supabase mode:

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Then start the development server:

```bash
npm run dev
```

See the [environment setup guide](docs/development/ENVIRONMENT_SETUP.md) for onboarding, migrations, Cloudflare R2 configuration, and troubleshooting.

## Quality commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Validate the TypeScript project |
| `npm run test:unit` | Run focused domain, utility, and hook tests |
| `npm test` | Run the full Vitest suite |
| `npm run lint` | Run ESLint across application and test code |
| `npm run build` | Create a production build |
| `npm run test:e2e` | Run the browser smoke workflow |
| `npm run test:db` | Validate the logic-remediation migration |

Run the relevant quality commands before opening or merging a pull request.

## Documentation

The [documentation index](docs/README.md) is the entry point for:

- Product context and roadmap
- Architecture decisions and database design
- Local and production environment setup
- Controlled data-import procedures
- Logic audit, remediation, and UI implementation records

## Security notes

- Local environment files and build output are intentionally ignored by Git.
- Frontend code must use only the Supabase anon or publishable key.
- Service-role keys, database passwords, R2 secrets, and signing credentials must remain server-side.
- Database access is organization-scoped through Row Level Security.
- Shipment documents are private and accessed through time-limited signed URLs.

## Project status

The platform is actively developed for the Arslan Transport pilot. Review the [roadmap](docs/product/ROADMAP.md) and [implementation handoff](docs/quality/LOGIC_REMEDIATION_HANDOFF.md) before planning production changes.
