# Environment Setup

## Current Status

The app can run in two explicit modes:

- Demo mode: mock/local data, no Supabase login.
- Supabase mode: real Supabase Auth and organization access.

Supabase mode is confirmed working for the first pilot organization:

- Organization name: `Arslan Transport`
- Organization slug: `arslan-transport`
- First admin user: manually created in Supabase Auth
- Membership role: `owner`
- Required seed rows: `profiles`, `organization_members`, and `settings` are in place.

## Local Development

Install and run:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Restart the dev server after changing `.env.local`.

## Demo Mode `.env.local`

Use this when presenting or developing with mock/local data:

```env
VITE_DEMO_MODE=true
```

Demo mode:

- Bypasses Supabase Auth.
- Uses mock/local data.
- Uses localStorage persistence.
- Does not require Supabase URL or key.
- Does not upload files to real storage.

## Supabase Mode `.env.local`

Use this when testing the real Supabase login and organization access flow:

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The app also accepts this newer Supabase dashboard naming:

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use only one public frontend key variable. Do not add private keys to frontend env files.

## Public Key Safety

The Supabase anon/publishable key is acceptable in frontend code because Row Level Security protects database access.

Never place these in `.env.local` for the frontend:

- Supabase service role key
- Supabase database password
- Cloudflare R2 secret access key
- Cloudflare API token
- Any private signing secret

Private credentials must stay server-side only.

## Supabase Project And Migration

The Supabase project has been created and the initial schema migration has been run successfully.

Migration file:

```text
supabase/migrations/001_initial_schema.sql
```

Created tables:

- `organizations`
- `profiles`
- `organization_members`
- `settings`
- `clients`
- `drivers`
- `vehicles`
- `truck_types`
- `route_locations` after applying `supabase/migrations/003_route_locations.sql`
- `shipments`
- `shipment_expenses`
- `expense_attachments`
- `shipment_attachments` after applying `supabase/migrations/002_shipment_attachments.sql`
- `client_payments`
- `driver_payments`
- `invoices`
- `invoice_items`
- `audit_logs`

Do not re-run the migration against an existing project unless you have reviewed idempotency and target state.

## Manual Pilot Onboarding

Public signup is not enabled for the pilot. Onboarding is manual/admin-created.

Completed pilot onboarding:

1. Auth user created in Supabase Auth.
2. `organizations` row created:
   - `name = 'Arslan Transport'`
   - `slug = 'arslan-transport'`
3. `profiles` row created for the auth user.
4. `organization_members` row created with `role = 'owner'`.
5. `settings` row created for the organization.

Template SQL is available in:

```text
supabase/seed_pilot_example.sql
```

When using the seed file, replace placeholder UUIDs carefully:

- `AUTH_USER_ID` must match the Supabase Auth user UUID.
- `ORG_ID` must match the organization UUID.
- Do not confuse Auth user UUIDs with organization UUIDs.

## Troubleshooting

### Login Works But App Shows No Organization Access

- Confirm the user has a row in `organization_members`.
- Confirm `organization_members.user_id` exactly matches the Supabase Auth user UUID.
- Confirm `organization_members.organization_id` points to the correct organization.
- Confirm `organization_members.status = 'active'`.
- Confirm the `organizations` row is not soft-deleted.

### UUID Mistakes

- Auth user UUID belongs in `profiles.id` and `organization_members.user_id`.
- Organization UUID belongs in `organizations.id`, `organization_members.organization_id`, `settings.organization_id`, and business-table `organization_id`.
- Never use the organization UUID as a profile/user ID.

### Missing Env Vars

- Set `VITE_DEMO_MODE=false`.
- Set `VITE_SUPABASE_URL`.
- Set either `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Restart the dev server.

### RLS Blocks Data

- Confirm the user belongs to the target organization.
- Confirm the membership status is active.
- Confirm the user's role allows the attempted action.
- Confirm policies from the migration were applied.

### Migration Not Applied

- Check for required tables, especially `organizations`, `profiles`, `organization_members`, and `settings`.
- If tables are missing, apply `supabase/migrations/001_initial_schema.sql` to the correct project.
- If Add Shipment saved locations fail, confirm `route_locations` exists and apply `supabase/migrations/003_route_locations.sql`.

## Cloudflare R2 Shipment Attachments

Cloudflare R2 signed upload/download support is implemented through Supabase Edge Functions.

Phase 6 deployment note:

- `r2-create-upload-url` was redeployed to project `vijrszfxhadqklnatkpz`.
- `r2-create-download-url` was redeployed to project `vijrszfxhadqklnatkpz`.
- The CLI migration status check still requires the project to be linked or a remote DB password/URL.

Bucket:

```text
transportflow-attachments
```

Current shipment attachment flow:

- Browser validates file type and size.
- Images are limited to 5MB for the MVP.
- PDFs are limited to 10MB and stored as-is for the MVP.
- Frontend requests a signed upload URL from a Supabase Edge Function.
- Browser uploads to private R2 storage.
- Supabase stores new attachment metadata in `shipment_attachments`.
- Preview/download uses signed download URLs.

No R2 secrets should ever be placed in frontend env files.

Upload locations:

- Shipment Documents / Attachments tab.
- Shipment expense receipt workflow.

Read-only reference locations:

- Invoice preview can show related shipment documents.
- Client and driver views can show recent shipment documents from their shipments.
- Shipment list rows can show a document count indicator.

Do not add upload controls to clients, drivers, vehicles, payments, invoices, or reports.

Deploy/redeploy functions:

```bash
supabase functions deploy r2-create-upload-url --project-ref YOUR_PROJECT_REF
supabase functions deploy r2-create-download-url --project-ref YOUR_PROJECT_REF
```

Redeploy these same functions after applying the shipment attachments migration. The upload payload is shipment-owned and does not accept generic `entity_type/entity_id` uploads.

Signed upload request body:

```json
{
  "shipment_id": "SHIPMENT_UUID",
  "shipment_expense_id": "OPTIONAL_EXPENSE_UUID",
  "category": "bill",
  "file_name": "receipt.pdf",
  "file_type": "application/pdf",
  "file_size": 123456
}
```

Signed download request body:

```json
{
  "attachment_id": "SHIPMENT_ATTACHMENT_UUID"
}
```

The upload function derives `organization_id` from the shipment and rejects viewer-role writes. The download function loads `shipment_attachments`, rejects deleted rows, verifies membership, and returns a short-lived signed URL.

Backend-only function secrets:

```bash
supabase secrets set R2_ACCOUNT_ID=YOUR_ACCOUNT_ID
supabase secrets set R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
supabase secrets set R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
supabase secrets set R2_BUCKET_NAME=transportflow-attachments
supabase secrets set R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

Do not use `VITE_` variables for R2 credentials. They must remain server-side function secrets.

Deployment commands:

```bash
supabase login
supabase functions deploy r2-create-upload-url --project-ref YOUR_PROJECT_REF
supabase functions deploy r2-create-download-url --project-ref YOUR_PROJECT_REF
```

If using CI or a non-interactive shell, use `SUPABASE_ACCESS_TOKEN` instead of `supabase login`.

Legacy expense attachment metadata uses:

- `expense_id` links the file to `shipment_expenses`.
- `object_key` stores the private R2 object key.
- Public URLs are never stored as source of truth.

Shipment attachment metadata uses:

- `shipment_id` as the required parent.
- `shipment_expense_id` only when the file belongs to a specific expense.
- `storage_key`
- `deleted_at` for soft delete.

Run the shipment attachment migration before testing the new shipment-owned upload flow:

```bash
supabase db push
```

or apply:

```text
supabase/migrations/002_shipment_attachments.sql
```
