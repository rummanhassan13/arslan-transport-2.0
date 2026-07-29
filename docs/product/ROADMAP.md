# Roadmap

## Completed

### Phase 1: Frontend Refactor

- Split the frontend into pages, components, types, constants, utils, hooks, config, services, and mock data.
- Preserved demo behavior, formulas, local state, and localStorage persistence.

### Phase 2: Product Documentation

- Created source-of-truth docs for product context, roadmap, database planning, environment setup, and key architecture decisions.

### Phase 3: Supabase Schema With Multi-Tenancy And RLS

- Created `supabase/migrations/001_initial_schema.sql`.
- Ran the initial migration successfully in the Supabase project.
- Created all MVP SaaS tables:
  - `organizations`
  - `profiles`
  - `organization_members`
  - `settings`
  - `clients`
  - `drivers`
  - `vehicles`
  - `truck_types`
  - `shipments`
  - `shipment_expenses`
  - `expense_attachments`
  - `client_payments`
  - `driver_payments`
  - `invoices`
  - `invoice_items`
  - `audit_logs`
- Added multi-tenant `organization_id` structure, RLS, roles, ledger payment tables, flexible expenses, invoice snapshots, soft deletes, audit logs, indexes, and constraints.

### Phase 4: Supabase Auth And Organization Context

- Added Supabase client/auth scaffolding.
- Added login/logout flow.
- Added protected app gate.
- Added profile, organization, membership, and role context.
- Preserved demo mode without Supabase.

### Phase 4.5: Supabase Project Setup And Pilot Onboarding

- Supabase project was created.
- First admin user was manually created in Supabase Auth.
- First pilot organization was created:
  - Name: `Arslan Transport`
  - Slug: `arslan-transport`
- Admin profile was seeded.
- Owner membership was seeded in `organization_members`.
- Organization `settings` row was seeded.
- Supabase real mode is confirmed working for login and organization access.

### Frontend SaaS UI Phases

- Mist visual system applied.
- Navigation restructured to:
  - Dashboard
  - Shipments
  - Directory
  - Finance
  - Reports
- Directory, Finance, Reports, header, modals, forms, invoice preview, and settings panels were polished.
- Global display currency setting was added.
- Local company profile and invoice settings were added.

## Current Operating Modes

### Demo Mode

- `VITE_DEMO_MODE=true`
- Uses mock/local data.
- Bypasses Supabase Auth.
- Persists demo values in localStorage where implemented.

### Supabase Mode

- `VITE_DEMO_MODE=false`
- Requires `VITE_SUPABASE_URL`.
- Requires `VITE_SUPABASE_ANON_KEY` or supported publishable-key equivalent.
- Supabase Auth and organization access are confirmed working.

## Next Recommended Phases

### Phase 5: Verify And Complete Real Data Modules

Confirm each business module in Supabase mode and finish any remaining wiring deliberately:

1. Clients
2. Drivers
3. Vehicles
4. Truck Types
5. Shipments
6. Shipment expenses
7. Expense attachment metadata

Use server-side pagination, filtering, search, and date ranges for growing tables before production-scale usage.

### Phase 6: Payments, Invoices, And Reports Real Data

- Connect `client_payments`.
- Connect `driver_payments`.
- Connect invoices and invoice items.
- Preserve invoice snapshot behavior.
- Build reports from Supabase data instead of demo-derived data.
- Add CSV/Excel export later.

### Phase 7: Shipment Attachment Backend Foundation

Status: completed locally.

Scope:

- Add `shipment_attachments` as the new shipment-owned attachment metadata table.
- Require every attachment to link to a shipment.
- Allow optional `shipment_expense_id` for expense-specific bills and receipts.
- Keep `expense_attachments` for backward compatibility.
- Add frontend types and metadata services only.
- Do not add upload UI or deploy Edge Functions in this phase.

Manual requirement:

- Apply `supabase/migrations/002_shipment_attachments.sql` before using the new metadata table in Supabase mode.

### Phase 8: Cloudflare R2 Shipment Attachments

Status: signed URL layer and frontend service flow implemented. Edge Functions must be deployed/redeployed in each target Supabase project after secrets are configured.

Implemented flow:

- Support JPG, PNG, WebP, and PDF.
- Validate images up to 5MB.
- Validate PDFs up to 10MB and store them as-is for MVP.
- Request signed upload/download URLs from Supabase Edge Functions.
- Derive `organization_id` from the shipment instead of trusting frontend input.
- Reject viewer-role upload attempts.
- Store only object keys and metadata in `shipment_attachments`.
- Keep R2 secrets server-side only.
- Keep the final visible upload UI deferred.

Still pending per environment:

- Apply `supabase/migrations/002_shipment_attachments.sql` if not already applied.
- Deploy/redeploy `r2-create-upload-url` and `r2-create-download-url`.
- Production verification against the live R2 bucket.
- Optional PDF thumbnails and advanced PDF processing.
- Optional R2 object cleanup when attachment metadata is soft-deleted.

### Phase 8B: Shipment Attachment UI

Status: implemented.

- Add visible upload/list/delete controls in shipment detail.
- Add shipment-expense receipt upload support.
- Add read-only references in related modules where they can be traced to shipments.
- Use the signed URL helpers created in Phase 8.
- Keep attachments shipment-owned only.
- Production R2 testing requires deployed Edge Functions and the `shipment_attachments` migration in the target Supabase project.

### Phase 8C: Shipment Attachment QA And Hardening

Status: completed in code and Edge Functions redeployed.

- Verify migration, RLS, Edge Functions, secrets, upload/download behavior, demo mode, and read-only references.
- Remove stale upload controls outside shipment and expense workflows.
- Update documentation and deployment notes.

Remaining manual verification:

- Confirm `002_shipment_attachments.sql` is applied in the live Supabase database.
- Test actual JPG/PNG/WebP/PDF uploads with an authenticated pilot user.

### Phase 11: Add Shipment Reliability And Smart Master Data Creation

Status: implemented.

- Added `route_locations` for saved loading point and destination dropdown options.
- Fixed Add new loading point/destination behavior with explicit save/cancel actions.
- Added demo-mode localStorage persistence for saved route locations.
- Improved driver, vehicle, truck type, and phone autofill in Add Shipment.
- Added an in-form Add New Driver/Vehicle flow that creates or links truck type, vehicle, and driver records safely.
- Added duplicate prevention for truck type names, vehicle numbers, and driver name/phone combinations.

### Phase 9: Invoice Documents And PDF Output

- Improve invoice snapshot generation.
- Add browser print/save-as-PDF.
- Add formal PDF generation later.
- Add invoice templates later.

### Phase 10: SaaS Admin, Plans, Billing, And Advanced Features

- Subscription plans
- Trial periods
- User limits
- Storage limits
- Organization billing status
- SaaS admin console

## Future Features

- Excel/CSV import with column mapping, validation, preview, and controlled import
- Mobile app
- Driver portal
- WhatsApp integration
- OCR bill reading
- Advanced accounting
- Subscriptions and pricing plans
