# Logic Remediation Handoff

## Implementation status

The application-side remediation is implemented. Financial calculations now use one canonical domain engine, client and driver payments are immutable signed ledgers with reversals, invoices are generated explicitly, shipment and invoice lifecycle changes are controlled, and organization-backed settings replace browser-only production settings.

Database integrity is implemented in migrations `015_logic_integrity_workflows.sql` through `017_automatic_shipment_invoice.sql`. They add constraints, idempotency, assignment-level accounting, controlled transitions, audit events, atomic RPC workflows, consistent audited payment deletion, and automatic invoice creation for every new shipment. The migrations have been statically validated in this repository but have not been applied to a live environment from this workspace.

## Required deployment sequence

1. Take a verified database backup and record the application release/version.
2. Run `scripts/logic-reconciliation.sql` against the target organization before migration and retain its output.
3. Resolve or explicitly approve every ambiguous legacy advance, duplicate invoice, orphan record, and balance anomaly reported by reconciliation.
4. Apply migrations through `supabase/migrations/017_automatic_shipment_invoice.sql` in staging first, preserving migration order.
5. Run `supabase/tests/logic_integrity.sql` against staging and repeat the reconciliation report.
6. Deploy `supabase/functions/r2-cleanup-attachments` and configure its Supabase service-role and R2 credentials.
7. Deploy the web application, then perform role-based UAT for admin, manager, dispatcher, accountant, and viewer access.
8. Validate a pilot set covering a single-leg shipment, multi-leg shipment, reimbursable expense, invoice generation, partial payment, overpayment/credit, driver settlement, reversal, and cancellation.
9. Repeat steps 2 and 5 in production during the approved release window, then monitor audit events and attachment cleanup failures.

## Local quality gates

- `npm run lint`
- `npm run build`
- `npm run test:unit`
- `npm run test:db`
- `npm run test:e2e`
- `npm audit --audit-level=high`

## Rollback boundary

Do not attempt to reconstruct finance history by editing or deleting ledger rows. If production validation fails, stop application writes, preserve audit data, restore the verified database backup, and roll back the web deployment as one coordinated release.
