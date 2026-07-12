# TransportFlow

TransportFlow is a web-based logistics transport management SaaS for small and mid-size transport companies. It replaces Excel/Google Sheet workflows with structured screens for shipments, clients, drivers, vehicles, expenses, attachments, payments, invoices, profit tracking, and reports.

## Current Status

- React/Vite frontend is working.
- Supabase project has been created and connected.
- Initial Supabase database migration has been run successfully.
- Supabase Auth is working.
- First pilot organization is seeded:
  - Name: `Arslan Transport`
  - Slug: `arslan-transport`
- First admin user was manually created in Supabase Auth.
- Admin profile, owner membership, and organization settings row were seeded successfully.
- Supabase real mode is confirmed working for login and organization access.
- Demo mode still exists for local mock-data demos.
- Shipment-owned attachment metadata, R2 signed URL helpers, shipment document UI, expense receipt integration, and read-only document references are implemented in app code.
- Real PDF generation, production payments, production invoices, and production reports are still future phases unless explicitly implemented later.

## Tech Stack

Frontend:

- React
- Vite
- TypeScript
- Tailwind CSS
- lucide-react
- Recharts
- Lightweight local shadcn/ui-style primitives

Backend:

- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security

Planned storage:

- Cloudflare R2 for private shipment attachments, including bill images and PDFs

## Shipment Documents

Attachments are shipment-owned only:

- Upload is allowed from the shipment Documents/Attachments area.
- Receipt upload is allowed from the shipment expense workflow.
- Clients, drivers, vehicles, payments, invoices, and reports do not own attachments.
- Related modules may show shipment documents as read-only references.
- Files are private in R2; the database stores `storage_key` and metadata, not public URLs.

Supported MVP files:

- JPG, PNG, WebP images up to 5MB.
- PDF files up to 10MB.

Required live setup:

- Apply `supabase/migrations/002_shipment_attachments.sql`.
- Configure R2 secrets as Supabase Edge Function secrets.
- Deploy `r2-create-upload-url` and `r2-create-download-url` after code changes. The functions were redeployed to project `vijrszfxhadqklnatkpz` during the Phase 6 hardening pass.

## Run Locally

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5173
```

## Build

```bash
npm run build
```

## Environment Modes

### Demo Mode

```env
VITE_DEMO_MODE=true
```

Demo mode:

- Bypasses Supabase Auth.
- Uses mock/local data.
- Uses localStorage for demo persistence.
- Does not require Supabase environment variables.

### Supabase Mode

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Supabase mode:

- Requires login.
- Loads the authenticated user's organization membership.
- Shows the app only when the user has active organization access.
- Is confirmed working for the Arslan Transport pilot setup.

The app also supports `VITE_SUPABASE_PUBLISHABLE_KEY` for newer Supabase dashboard terminology, but `VITE_SUPABASE_ANON_KEY` remains documented as the standard frontend public key.

## Supabase Setup

The Supabase project exists and the initial schema has been applied. The active pilot setup is:

- Organization: `Arslan Transport`
- Slug: `arslan-transport`
- First admin user: manually created in Supabase Auth
- Role: `owner` through `organization_members`

See [ENVIRONMENT_SETUP.md](</E:/OneDrive/Documents/New project/ENVIRONMENT_SETUP.md>) for env examples, migration notes, manual onboarding SQL guidance, and troubleshooting.
