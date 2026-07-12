# Architecture Decisions

## SaaS, Not Custom Software

TransportFlow is being built as a reusable SaaS product for transport companies. Arslan Transport is the first pilot organization, not the only intended customer.

## Supabase Is The Confirmed Backend

Supabase is now the active backend choice for:

- Authentication
- Postgres database
- Row Level Security
- Organization-scoped access

The Supabase project has been created and connected. The initial database migration has been run successfully.

## Multi-Tenancy From Day One

Every business record must belong to an `organization_id`.

Tenant isolation must be enforced by Supabase RLS and organization membership checks, not frontend filtering alone.

## Manual Pilot Onboarding

Public self-signup is deferred.

Current pilot onboarding is manual/admin-created:

- First admin user created in Supabase Auth.
- First organization created:
  - `Arslan Transport`
  - `arslan-transport`
- Admin `profiles` row seeded.
- `organization_members` row seeded with role `owner`.
- Organization `settings` row seeded.

Future onboarding can add invitations, organization switching, and admin-managed user creation.

## Demo Mode Vs Real Mode

Demo mode:

- `VITE_DEMO_MODE=true`
- Bypasses Supabase Auth.
- Uses mock/local data.
- Uses localStorage persistence where implemented.

Supabase mode:

- `VITE_DEMO_MODE=false`
- Requires Supabase URL and public anon/publishable key.
- Requires login.
- Requires active organization membership.
- Confirmed working for Arslan Transport login and organization access.

The app must not silently mix demo fallback data into production mode.

## Frontend Env Safety

Frontend env files may contain public values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Frontend env files must never contain:

- Supabase service role key
- Supabase database password
- Cloudflare R2 secret access key
- Cloudflare API token
- Private signing secrets

## Role-Based Access

Roles live in `organization_members.role`.

Supported roles:

- `owner`
- `admin`
- `manager`
- `accountant`
- `dispatcher`
- `viewer`

UI permission helpers are useful for experience, but RLS and server-side checks are the security boundary.

## Ledger-Based Payments

Payment status fields are not the source of truth.

Use ledger tables:

- `client_payments`
- `driver_payments`

Client payment status should be derived from invoice totals minus client payment rows. Driver balances should be derived from driver payable amounts, reimbursable expenses, advances, and settlements.

## Flexible Expenses

Shipment expenses need flexible fields instead of fixed hard-coded columns only.

`shipment_expenses` supports:

- category
- paid by
- client billable
- driver reimbursable
- approval state
- invoice inclusion

This keeps Gate Pass, Fashah, NAQL, and future expense types scalable.

## Saved Route Locations

Reusable loading points and destinations are stored in `route_locations`, not hard-coded in the frontend.

Decisions:

- Locations are organization-scoped.
- The Add Shipment form can create saved locations when the user chooses `Add new...`.
- Shipment records still keep text snapshots for `loading_point` and `destination`.
- Demo mode stores saved route locations in localStorage.
- Supabase mode stores them under the active organization with RLS.

## Invoice Snapshots

Generated invoices must store snapshot data so old invoices do not change when shipment, client, driver, vehicle, or expense records are edited later.

Use:

- `invoices`
- `invoice_items`

## Soft Deletes For Financial Records

Important operational and financial records should use `deleted_at` instead of hard delete by default.

This protects invoice/payment history and reduces accidental data loss.

## Audit Logs

`audit_logs` exists from the first schema. Audit UI can come later, but the system should preserve a foundation for tracking important edits, exports, invoice generation, and payment recording.

## Cloudflare R2 Uses Private Signed URLs

Cloudflare R2 is the private storage layer for shipment attachments:

- Bill images: JPG, PNG, WebP
- Bill PDFs: `application/pdf`

MVP flow:

- Frontend validates file type and size.
- Images are limited to 5MB for MVP upload signing.
- PDFs are limited to 10MB and stored as-is for MVP.
- Frontend requests signed upload/download URLs from Supabase Edge Functions.
- R2 object keys and metadata are saved in Supabase.
- No R2 secrets are exposed to the frontend.

Do not treat public URLs as the source of truth for attachments. New uploads should use `shipment_attachments.storage_key` as the durable storage reference. Every uploaded file belongs to a shipment; it can optionally also link to a shipment expense. Keep `expense_attachments` readable for backward compatibility.

The upload signing function derives organization access from the shipment record and rejects viewer-role uploads. It must not accept generic record attachments.

Upload ownership decision:

- Upload/manage from shipment Documents/Attachments.
- Upload/manage receipts from shipment expense workflows.
- Show shipment documents read-only from related invoice, client, driver, finance, or report views when useful.
- Do not add attachment ownership to clients, drivers, vehicles, payments, invoices, or reports.

## Source Of Truth For Current State

As of this documentation update:

- Supabase project exists.
- Initial migration has been run.
- Required MVP tables exist.
- Supabase Auth works.
- Arslan Transport organization exists.
- Owner membership and settings seed are complete.
- Real mode login and organization access are confirmed working.
- R2 signed upload/download is implemented in code. The upload/download Edge Functions were redeployed for project `vijrszfxhadqklnatkpz` during Phase 6; each future project still needs its own secrets and deployment.
- Production invoice PDF output and advanced reports remain future phases unless explicitly implemented later.
