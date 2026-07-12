# Database Schema

## Current Status

The initial Supabase schema migration has been run successfully. The shipment attachment migration exists and must be applied to any Supabase project before live shipment document uploads are tested.

Migration file:

```text
supabase/migrations/001_initial_schema.sql
```

The schema is designed for a multi-tenant logistics SaaS where each transport company is an organization.

## Created Tables

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

## Multi-Tenant Model

TransportFlow is organization-scoped.

Every business table must belong to an organization through `organization_id`.

Important tenant rules:

- One Supabase project serves multiple transport companies.
- Every company is an `organizations` row.
- Users access company data through `organization_members`.
- Frontend filters are not enough for security.
- Supabase Row Level Security must enforce tenant isolation.

Core organization tables:

- `organizations`: tenant/company records.
- `profiles`: user profile records linked to Supabase Auth users.
- `organization_members`: connects users to organizations with roles.
- `settings`: one settings row per organization for invoice defaults and business preferences.

## Route Locations

`route_locations` stores reusable Add Shipment dropdown options for loading points and destinations.

Rules:

- Every row belongs to `organization_id`.
- `type` is either `loading_point` or `destination`.
- `name` is required and cannot be empty.
- Active rows are unique per organization, type, and case-insensitive trimmed name.
- RLS allows active organization members to read.
- Owner/admin/manager/dispatcher/accountant roles can insert/update/soft-delete.
- Viewers are read-only.

Shipment rows still store their own text snapshot in `loading_point` and `destination`.

## RLS-First Approach

RLS is enabled from the first schema.

Policy intent:

- Users can read organizations where they are active members.
- Users can read business rows for organizations where they are active members.
- Insert/update access depends on membership role.
- Viewers are read-only.
- Dispatchers manage operational records but not payment/invoice-sensitive records.
- Accountants manage payments, invoices, and finance-related records.
- Owners/admins have broad access.

Never expose a Supabase service role key in frontend code or frontend environment files.

## Role System

Roles are stored on `organization_members.role`.

Supported roles:

- `owner`
- `admin`
- `manager`
- `accountant`
- `dispatcher`
- `viewer`

Pilot state:

- First admin user is linked to `Arslan Transport`.
- The pilot user's membership role is `owner`.

## Ledger Payment Strategy

Payment status fields are not the source of truth.

Client payment logic:

- Invoices store total payable amounts.
- `client_payments` stores payment rows.
- Client payment status should be derived from invoice total minus client payment rows.

Driver payment logic:

- Shipments and reimbursable expenses determine driver payable amounts.
- `driver_payments` stores advances, settlements, reimbursements, and adjustments.
- Driver pending balance should be derived from payable amount minus payment rows.

## Flexible Expense Strategy

`shipment_expenses` supports real logistics expense behavior:

- `category`
- `amount`
- `paid_by`
- `client_billable`
- `driver_reimbursable`
- `approved`
- `included_in_invoice`
- `expense_date`
- `notes`

This supports Gate Pass, Fashah, NAQL, fuel, toll, loading/unloading, repair, parking, food, waiting charges, and future expense types without changing the shipment table.

## Expense Attachments

`expense_attachments` stores legacy metadata for bill evidence and supporting files linked to shipment expenses.

Supported file plan:

- Images: JPG, PNG, WebP
- PDFs: `application/pdf`

Storage rules:

- Store object keys and metadata.
- Do not store public URLs as source of truth.
- Use Supabase Edge Functions to create signed URLs for upload, preview, and download.
- Keep Cloudflare R2 secrets server-side only.
- Current schema uses `expense_id` for the shipment expense link and `object_key` for the private R2 key.

Current status:

- Table exists.
- Cloudflare R2 signed upload/download is implemented in app code.
- Functions must be deployed and R2 secrets configured in the Supabase project before live uploads work.

## Shipment Attachments

`shipment_attachments` is added by `supabase/migrations/002_shipment_attachments.sql` as the new shipment-owned attachment metadata table.

Attachment ownership rule:

- Every uploaded document belongs to a `shipment_id`.
- A document may optionally also link to `shipment_expense_id`.
- Clients, drivers, vehicles, payments, invoices, and settings do not own attachments directly.
- Other screens can later show shipment documents as read-only references.

Supported categories:

- `bill`
- `receipt`
- `gate_pass`
- `fashah`
- `naql`
- `loading_slip`
- `unloading_slip`
- `proof_of_delivery`
- `invoice_support`
- `driver_document`
- `client_document`
- `other`

Rules:

- Every attachment belongs to an `organization_id`.
- `shipment_id` points to the owning shipment.
- `shipment_expense_id` is optional and must belong to the same shipment and organization when present.
- `storage_key` stores the private R2 object key.
- `deleted_at` is used for soft delete.
- RLS enforces active organization membership and blocks viewer writes.
- Inserted metadata must use the authenticated user as `uploaded_by` when provided.
- Write-capable roles can update or soft-delete attachment metadata.
- `expense_attachments` remains for backward compatibility.

Signed URL layer:

- Upload URLs are generated by `r2-create-upload-url`.
- Download URLs are generated by `r2-create-download-url`.
- Upload validation allows JPG, PNG, WebP, and PDF.
- MVP size limits are 5MB for images and 10MB for PDFs.
- R2 keys use `organizations/{organization_id}/shipments/{shipment_id}/{category}/{timestamp}-{safe_filename}`.
- Public URLs are never stored.

Upload and visibility model:

- Upload/manage from shipment documents and shipment expense receipt workflows only.
- Read-only references can appear in invoice, client, driver, finance, and report contexts when they are tied back to shipments.
- Clients, drivers, vehicles, payments, invoices, and reports must not own attachments directly.

## Invoice Snapshot Strategy

Invoices are designed to store snapshot values at generation time:

- Client details snapshot
- Shipment details snapshot
- Expense item snapshot
- Invoice number
- Issue/due dates
- Total amount
- Status

Reason:

- Old invoices must not silently change if shipment, client, driver, or expense data is edited later.

`invoice_items` stores line-level snapshot items for transport charges, expenses, adjustments, and other invoice rows.

## Soft Delete Strategy

Important operational and financial records use `deleted_at` instead of hard deletion.

Soft-delete tables include:

- `clients`
- `drivers`
- `vehicles`
- `shipments`
- `shipment_expenses`
- `expense_attachments`
- `shipment_attachments`
- `invoices`
- `client_payments`
- `driver_payments`

The UI should hide soft-deleted rows by default.

## Audit Log Strategy

`audit_logs` exists for future operational and financial auditability.

It records:

- `organization_id`
- `user_id`
- `entity_type`
- `entity_id`
- `action`
- `old_values`
- `new_values`
- `created_at`

Audit UI can come later, but the table foundation exists now.

## Money Storage

Money values use `numeric(12,2)` in the database.

This is acceptable for the MVP and easier to inspect in Supabase. If stricter accounting precision is needed later, evaluate integer minor-unit storage.

## Invoice Numbering

Invoice numbers are unique per organization.

Required model:

- `organization_id + invoice_number` unique constraint
- Organization `settings` row contains invoice prefix and next invoice number defaults.

## Current Pilot Data

Confirmed seeded pilot records:

- `organizations.name = 'Arslan Transport'`
- `organizations.slug = 'arslan-transport'`
- Supabase Auth admin user exists.
- Matching `profiles` row exists.
- `organization_members` row exists with role `owner`.
- `settings` row exists for the organization.
