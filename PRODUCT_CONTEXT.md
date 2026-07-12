# Product Context

## SaaS Positioning

TransportFlow is a reusable logistics management SaaS for small and mid-size transport companies. It is not a one-off custom dashboard.

The product should support many transport companies through organization-based multi-tenancy.

## First Pilot Organization

The first pilot organization is:

- Name: `Arslan Transport`
- Slug: `arslan-transport`

Arslan Transport currently represents the first real tenant in Supabase. The organization, owner membership, admin profile, and settings row have been seeded successfully.

## Problem

The pilot client currently manages operations through Excel/Google Sheets. That workflow makes it hard to reliably manage:

- Shipment records
- Client billing
- Driver assignments
- Driver advances and pending balances
- Shipment expenses
- Bill images, bill PDFs, and receipts
- Invoice status
- Client and driver payments
- Profit reporting

## Core Promise

Replace manual spreadsheet tracking with a structured SaaS workspace for:

- Shipment tracking
- Client billing
- Driver and vehicle management
- Driver advances and settlements
- Expense tracking
- Bill image/PDF attachment management
- Invoice generation
- Profit visibility
- Reports and exports

## Current Product State

The product has moved beyond frontend-only planning:

- React/Vite frontend exists.
- Mist design system and grouped SaaS navigation are in place.
- Supabase project exists.
- Initial multi-tenant schema has been applied.
- Supabase Auth works.
- Supabase real mode works for login and organization access.
- Demo mode still exists for mock/local presentations.

Current confirmed production-backed capability:

- Login through Supabase Auth
- Organization membership lookup
- Active organization access for Arslan Transport
- Shipment-owned document metadata and private R2 signed URL flows are implemented in the app code.

Still pending as production-grade phases:

- Applying/deploying the latest shipment attachment migration and Edge Functions in each target Supabase project
- Production payment ledger UX
- Production invoice generation and PDF output
- Production report/export workflows
- SaaS billing/plans

## Core Modules

### 1. Master Records

Organizations, users/profiles, clients, drivers, vehicles, truck types, and reusable settings.

### 2. Shipment Management

Shipment date, invoice reference, loading point, destination, customer/client, driver, vehicle, truck type, remarks, and shipment status.

### 3. Expenses & Attachments

Gate Pass, Fashah, NAQL, other expenses, notes, and shipment-owned attachment metadata for bill images/PDFs.

Attachment ownership rule:

- Every uploaded file belongs to a shipment.
- Files can optionally link to a shipment expense.
- Clients, drivers, vehicles, payments, and invoices do not own attachments directly.
- Other pages may later show shipment documents as read-only references.

Future storage:

- Images validated before upload.
- PDFs validated and stored privately.
- Cloudflare R2 object keys stored in Supabase.
- Preview/download through signed URLs.

### 4. Payments & Profit

Company rate, driver rate, advances, company totals, driver totals, pending balances, payment ledgers, and net profit.

Payment statuses should be derived from ledger rows, not treated as the source of truth.

### 5. Invoices & Reports

Invoice snapshots, invoice items, invoice status, client payment reports, driver reports, shipment reports, profit reports, pending payment reports, and future exports.

## MVP Boundaries

Do not build unless explicitly requested:

- Mobile app
- GPS tracking
- OCR bill reading
- WhatsApp automation
- Advanced accounting
- Subscription billing
- Complex approval workflow
- Public self-signup

## Future Expansion

- Driver portal
- Mobile app
- WhatsApp notifications and invoice sharing
- OCR bill reading
- Excel/CSV import
- Advanced accounting workflows
- SaaS plans, trials, billing, and admin console
