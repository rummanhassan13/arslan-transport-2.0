# TransportFlow UI V2 Implementation

## Scope

UI V2 is a presentation-layer redesign. Existing business behavior remains the source of truth.

The redesign intentionally reuses the current:

- React contexts and hooks
- Supabase services and queries
- domain types
- payment, invoice, expense, attachment, and shipment calculations
- permission helpers and RLS-backed role behavior
- demo-mode persistence
- print templates and export behavior
- application action handlers in `App.tsx`

No database migration or backend contract was changed for UI V2.

## Implemented surfaces

- Responsive desktop application sidebar
- Contextual desktop toolbar
- Four-destination mobile navigation
- Mobile account, search, More, and create-shipment controls
- Central design tokens and responsive component styling
- Redesigned Dashboard presentation
- Simplified desktop shipment register
- Purpose-built mobile shipment cards
- Three-stage Add/Edit Shipment workflow
- Full-workspace shipment detail presentation
- Restyled Directory modules
- Restyled Finance tabs, filters, tables, and forms
- Collapsible mobile expense filters
- Full-width report builder and preview
- Consolidated company and invoice settings access
- Redesigned authentication screen
- Modal focus management, Escape handling, scroll locking, and focus restoration
- Browser zoom support and reduced-motion support

## Navigation mapping

| UI V2 destination | Existing view or behavior |
| --- | --- |
| Dashboard | `Dashboard` |
| Shipments | `Shipments` |
| Finance | `Finance` |
| Directory | `Directory` |
| Reports | `Reports` |
| Settings | Existing company and invoice settings panels |

Directory and Reports are secondary destinations on mobile and remain directly accessible in the desktop Manage section.

## Logic parity checklist

The following behavior must remain identical between the previous UI and UI V2:

- Add, edit, view, and delete shipment
- Inline client creation
- Inline route-location creation
- Driver, vehicle, and truck-type assignment
- Multiple driver legs
- Existing rate, advance, expense, total, pending, and profit calculations
- Invoice creation, preview, printing, status updates, and deletion
- Client payment creation and deletion
- Driver payment creation and deletion
- Expense creation, editing, approval, deletion, and receipt handling
- Shipment document upload, preview, refresh, notes, and deletion
- Client, driver, vehicle, and truck-type CRUD behavior
- Report filtering and print flow
- Demo and Supabase authentication gates
- Role-based visibility and edit permissions
- Company, currency, invoice, theme, and session persistence

## Deferred logic-improvement backlog

These items were identified during the audit but were not changed as part of the UI redesign:

- Driver-advance source-of-truth and potential duplicate aggregation
- Invoice generation timing relative to later shipment expenses
- Separation of shipment reference and invoice number
- Financial-status reconciliation rules
- Partial-balance calculations used by some overview widgets
- Transaction boundaries for multi-record shipment and invoice operations
- Demo-mode repeated-render warning
- Organization-backed company and invoice settings
- Real organization switching
- Audit-log event creation
- Server pagination and search for growing datasets
- Dependency advisories reported by the package audit

Each item should be handled in a separate business-logic phase with dedicated migration, service, and regression-test planning where applicable.

## Validation baseline

- TypeScript compilation passes.
- The Vite production build passes.
- Both landing and application entry points remain in the build.
- No Supabase migration, Edge Function, service, hook, calculation, or permission helper was modified.

