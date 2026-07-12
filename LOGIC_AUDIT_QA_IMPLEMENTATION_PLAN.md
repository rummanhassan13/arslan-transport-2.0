# TransportFlow Logic, Data Integrity, and QA Implementation Plan

## Document status

- Scope: full logical-system audit and remediation plan
- Current action: planning and evidence collection only; no business logic has been changed
- Local development server: stopped before the audit began
- Product modes in scope: Supabase mode and demo mode
- Primary risk areas: shipment financials, driver advances, expenses, invoices, payments, status derivation, reporting, and multi-tenant integrity

## 1. Executive assessment

TransportFlow has a useful multi-tenant database foundation, RLS policies, normalized tables for expenses and payment ledgers, and a clear architectural intention documented in `DECISIONS.md`. The current runtime implementation does not consistently follow those decisions.

The main problem is not one broken form. The application currently has multiple competing sources of truth for the same business facts:

- Driver advances exist in both shipment/assignment fields and `driver_payments`.
- Gate Pass, Fashah, and NAQL exist as shipment columns and as normalized expense rows.
- Shipment totals are calculated by two different calculation paths.
- Receivables can come from live shipment calculations or frozen invoice totals.
- Invoice status and payment status are sometimes manually stored and sometimes derived.
- Dashboard, directory, finance, and report screens do not always use the same balance definition.

This creates a material risk of incorrect customer balances, duplicated driver advances, stale invoices, misleading profit reports, and partial database writes. Financial corrections should therefore begin only after the source-of-truth rules and calculation contract are approved.

### Recommended remediation principle

Create one canonical domain calculation layer and one authoritative persisted source for every business fact. Make database workflows atomic, migrate existing data with reconciliation evidence, and then make every screen consume the same projections.

## 2. Audit objectives

The audit and implementation must prove that:

1. Every field has a defined business meaning, owner, source of truth, validation rule, and lifecycle.
2. Every financial number is calculated identically in shipment detail, directory totals, payments, invoices, dashboard, reports, and exports.
3. A failed multi-step action cannot leave partial or contradictory data.
4. Invoice snapshots do not silently change after issue.
5. Payment ledgers, allocations, balances, and status derivation reconcile exactly.
6. Multi-driver shipments allocate rates, advances, expenses, and settlements to the correct driver or assignment.
7. Tenant and role isolation is enforced in the database, not only in the UI.
8. Demo mode behaves like the real domain model instead of maintaining separate business behavior.
9. Existing production/pilot data can be migrated without unexplained financial differences.
10. Automated tests prevent the same classes of defects from returning.

## 3. Severity model

| Severity | Meaning |
| --- | --- |
| Critical | Can create incorrect money, duplicate financial activity, tenant exposure, or unrecoverable partial writes. Blocks production financial use. |
| High | Produces wrong workflow state, stale documents, unreliable balances, or repeated runtime failure. Must be resolved before pilot sign-off. |
| Medium | Creates ambiguity, operational friction, weak auditability, or scaling risk. Resolve before broader rollout. |
| Low | Maintainability or polish issue with limited immediate business impact. Track after core correctness. |

## 4. Confirmed preliminary findings

These are findings from code and schema inspection. The data-reconciliation phase will measure their effect on existing records.

| ID | Severity | Confirmed finding | Business risk | Proposed direction |
| --- | --- | --- | --- | --- |
| F-01 | Critical | Driver advance is persisted on assignments and also upserted into `driver_payments`; display enrichment adds the two values. | Advances and driver paid totals can be doubled. | Make `driver_payments` the only advance source; migrate assignment advances once and retire `advance_paid` from writes. |
| F-02 | Critical | The shipment form passes a shipment-level aggregate advance to a single primary driver payment. | Multi-leg advances can be assigned to the wrong driver. | Capture advances per assignment/driver and add an assignment reference to ledger rows. |
| F-03 | Critical | `calculate()` and `calculateShipmentFinancials()` implement different formulas. | The same shipment can show different totals and profit depending on screen/path. | Replace them with one pure, versioned financial engine and typed projections. |
| F-04 | Critical | Legacy shipment expense columns coexist with `shipment_expenses`. | Expenses can be omitted, duplicated, or interpreted differently. | Normalize all expenses into `shipment_expenses`; make legacy columns read-only during migration, then remove them from the application contract. |
| F-05 | Critical | Shipment save creates/updates the parent and assignments in separate calls; update deletes all assignments before reinserting. | Failure can leave a shipment without assignments or a partially created shipment. | Use one transactional database function for shipment plus assignments. |
| F-06 | Critical | Invoice header insert and item inserts are separate calls. | An invoice can exist without its required line items. | Generate invoice header, number, snapshots, and items in one transaction. |
| F-07 | High | New shipment save immediately generates an invoice before later expense activity. | Invoice totals/items become stale and unapproved costs may not be billed correctly. | Generate an invoice through an explicit invoice-ready action after required operational/expense checks. |
| F-08 | High | Existing invoice matching can update the header but returns no items and does not synchronize item snapshots. | Header totals and line items can disagree. | Treat issued invoices as immutable; allow complete draft regeneration or create a revision/adjustment. |
| F-09 | High | Invoice numbers are created client-side from a shipment reference/settings. The DB `next_invoice_number` is not used atomically. | Concurrent users can collide or produce inconsistent numbering. | Allocate numbers in a locked database transaction using organization settings. |
| F-10 | High | When client payment becomes Paid, an effect can move draft/partial/overdue invoices to `sent`, not `paid`. | Stored invoice status contradicts the ledger. | Derive payment state from allocations and define separate document lifecycle state. |
| F-11 | High | Several fallback totals count the full shipment total whenever it is not Paid. | Partial payments can be reported as fully outstanding. | Always calculate balance as authoritative receivable minus net allocated payments. |
| F-12 | High | Operational shipment status exists in the schema but dashboard "active" and pipeline metrics use payment/invoice states. | Operations cannot reliably distinguish pending, in transit, delivered, completed, or cancelled shipments. | Implement a shipment state machine and keep operational, invoice, and payment states separate. |
| F-13 | High | Demo invoice synchronization receives unstable arrays and sets new arrays in effects. The runtime has shown a maximum-update-depth loop. | UI can freeze, spam renders, and make data entry unreliable. | Stabilize hook outputs, remove derived-state effects, and test render counts. |
| F-14 | High | Organization settings exist in Supabase, but company/invoice settings are stored in browser localStorage. | Users in the same organization can see different invoice identity and rules. | Make organization settings authoritative in Supabase; reserve localStorage for non-business UI preferences. |
| F-15 | High | Due-date terms and default invoice status are stored but not consistently applied; generated invoices are always draft and can lack due date. | Invoice workflows do not follow configured business rules. | Parse/store explicit term days and apply them server-side at generation. |
| F-16 | High | Payment services accept zero values and do not enforce outstanding/payable limits or a deliberate credit policy. | Accidental zero/overpayments and hidden credit balances are possible. | Define overpayment policy, validate positive decimal amounts, and support credits explicitly or block them for MVP. |
| F-17 | High | Financial deletes are soft deletes without an explicit reversal/correction workflow. | Historical balances can change without a clear accounting trail. | Use immutable ledger entries after posting and corrective reversal entries with reasons. |
| F-18 | High | An expense can combine `paid_by`, `client_billable`, `driver_reimbursable`, `approved`, and `included_in_invoice` in ambiguous ways. | Costs, payables, markup, and invoice totals can be misclassified. | Define valid combinations, conditional validation, allocation, and lifecycle transitions. |
| F-19 | High | Driver-reimbursable expenses do not identify which assignment receives the reimbursement on a multi-driver shipment. | Payables cannot be reconciled per driver. | Add `shipment_assignment_id` or an explicit expense allocation table. |
| F-20 | Medium | Client and driver summaries aggregate by display names or broad shipment totals in some paths. | Duplicate/renamed names can merge unrelated records. | Aggregate by stable IDs and canonical projections only. |
| F-21 | Medium | A global refresh event reloads many modules after writes. | Unrelated requests can race, overwrite fresher state, or cause unnecessary load. | Introduce scoped invalidation/query keys and request cancellation/versioning. |
| F-22 | Medium | Lists and reports load broad datasets and aggregate in the browser. | Performance and reporting consistency degrade as tenant data grows. | Add server-side pagination, filters, and audited aggregate/report queries. |
| F-23 | Medium | `audit_logs` exists but application workflows do not write it. | Important financial and operational changes are not traceable. | Write audit events in the same transaction as critical mutations. |
| F-24 | Medium | Attachment metadata can be soft-deleted without deleting or scheduling deletion of the private object. | R2 storage accumulates orphaned files. | Add an object-cleanup queue/job with retry and audit state. |
| F-25 | Medium | Auth loads all memberships but always selects the first; there is no persisted active-organization choice. | Multi-organization users can act in the wrong tenant context. | Add explicit organization selection and make all caches/actions organization-keyed. |
| F-26 | Medium | Demo mode has separate persistence and behavior rather than reusing the exact production domain rules. | QA can pass in demo and fail in Supabase mode. | Share domain functions and run the same contract suite against both adapters. |
| F-27 | Medium | There is no test/lint/type QA suite beyond the production build command. | Calculation, transaction, and role regressions are not detected. | Add unit, database, service integration, component, and browser E2E suites. |
| F-28 | Medium | Spreadsheet import scripts need formal staging, validation, idempotency, reconciliation, and rollback tests. | Re-runs or malformed rows can duplicate or misclassify operational/financial data. | Implement staged imports with deterministic keys and post-import control totals. |
| F-29 | Medium | The current `xlsx` dependency has known security advisories in the installed dependency audit. | Crafted spreadsheets may expose import workflows to avoidable risk. | Replace or isolate spreadsheet parsing and validate files in a restricted import pipeline. |

### Key code evidence

- Competing formulas: `src/utils/calculations.ts`
- Advance enrichment and status overlay: `src/App.tsx`
- Explicit comments acknowledging advance double-count risk: `src/components/ShipmentSummaryModal.tsx`
- Non-atomic parent/assignment persistence: `src/services/shipmentService.ts`
- Non-atomic invoice/item persistence: `src/services/invoiceService.ts`
- Client-side invoice generation and snapshot construction: `src/hooks/useInvoices.ts`
- Ledger upsert that finds the first shipment advance rather than a driver assignment: `src/services/paymentService.ts`
- Browser-local business settings: `src/contexts/BusinessSettingsContext.tsx`
- Full-balance fallback calculations: `src/utils/calculations.ts`, `src/pages/PaymentsPage.tsx`, and `src/pages/InvoicesPage.tsx`
- Automatic Paid-to-Sent mutation: `src/App.tsx`
- First-membership selection: `src/contexts/AuthContext.tsx`

## 5. Proposed canonical source-of-truth model

This is the recommended target. It must be approved against the pilot's real business process before migration.

| Business fact | Authoritative source | Derived values | Retire from application writes |
| --- | --- | --- | --- |
| Shipment identity/reference | `shipments.shipment_no` | Display reference | Treat `invoice_reference` as legacy unless a separate customer reference is explicitly required. |
| Operational state | `shipments.status` with transition history/audit | Active/in-transit/delivered counts | Payment or invoice status as an operational proxy. |
| Base client charge | `shipments.company_rate` | Estimated unbilled charge | Duplicate form totals. |
| Base driver payable | Sum of `shipment_driver_assignments.driver_rate` | Shipment-level driver rate projection | Parent `shipments.driver_rate` as an independent editable value. |
| Expense actual cost | `shipment_expenses.amount` | Approved cost, company cost, reimbursable cost | `shipments.gate_pass`, `fashah`, `naql`. |
| Expense client charge | `shipment_expenses.client_bill_amount` | Billable/unbilled amounts and markup | Implicit fallback once all data is migrated. |
| Driver advances/settlements | `driver_payments` immutable ledger | Paid, advance, pending, credit balance | `shipments.advance` and assignment `advance_paid` as payment sources. |
| Invoice receivable | Frozen `invoice_items` summed into invoice total inside one transaction | Invoice balance/status | Live shipment total after issue. |
| Client payments | `client_payments` plus explicit allocations | Paid, outstanding, credit | Manually stored payment status. |
| Driver balance | Driver/assignment payable less net ledger entries | Pending/paid/credit state | Boolean/manual driver payment status. |
| Organization invoice settings | `settings` row for active organization | Formatted number/due date | Business settings in localStorage. |
| Audit history | `audit_logs` written transactionally | Timeline/export | Ad hoc console/UI history. |

### Recommended terminology cleanup

- `Shipment status`: pending, in transit, delivered, completed, cancelled.
- `Invoice lifecycle`: draft, issued/sent, void/cancelled. Overdue is derived from due date and balance.
- `Payment state`: unpaid, partially paid, paid, credit balance. Always derived.
- `Driver settlement state`: unpaid, advance paid, partially settled, settled, credit balance. Always derived.
- `Estimated revenue`: current approved customer charges before invoice.
- `Invoiced revenue`: immutable issued invoice line totals.
- `Cash received`: active client ledger entries in period.
- `Estimated profit`: estimated customer charges minus approved operational cost.
- `Invoiced profit`: invoice items minus attributable approved operational cost.

Do not label invoice status as a shipment pipeline, and do not label unpaid finance records as active shipments.

## 6. Proposed calculation contract

All calculations should be pure decimal-domain functions with no React, formatting, or network dependencies. Money should remain `numeric(12,2)` in Postgres and use a decimal-safe library or integer minor units in TypeScript; native floating-point arithmetic should not be the financial authority.

### Pre-invoice shipment projections

```text
base_client_charge = shipment.company_rate

approved_client_charge = sum(
  expense.client_bill_amount
  where expense.approved = true
    and expense.client_billable = true
)

invoice_ready_expense_charge = sum(
  expense.client_bill_amount
  where expense.approved = true
    and expense.client_billable = true
    and expense.included_in_invoice = true
)

base_driver_payable = sum(assignment.driver_rate)

driver_reimbursements_payable = sum(
  expense.amount
  where expense.approved = true
    and expense.driver_reimbursable = true
    and expense has a valid driver/assignment allocation
)

company_operational_cost = sum each approved expense once
  where paid_by = company or driver_reimbursable = true

estimated_client_revenue = base_client_charge + approved_client_charge
estimated_total_cost = base_driver_payable + company_operational_cost
estimated_profit = estimated_client_revenue - estimated_total_cost
```

The union in `company_operational_cost` is important: an expense that is company-paid and driver-reimbursable must never be counted twice. Invalid combinations should be rejected or require an explicit explanation.

### Invoice and client balance

```text
invoice_subtotal = sum(active transport/adjustment item amounts)
invoice_expense_total = sum(active expense item amounts)
invoice_total = sum(all active invoice item amounts)

allocated_client_payments = sum(active payment allocations to invoice)
invoice_balance = invoice_total - allocated_client_payments - credit_adjustments + debit_adjustments
```

Do not clamp balance to zero in the canonical model. A negative balance is a credit/overpayment that must be visible. If credits are out of MVP scope, block the posting that would create one.

### Driver balance

```text
assignment_payable = assignment.driver_rate
  + approved reimbursable expenses allocated to the assignment

assignment_net_payments = advances + settlements + reimbursements + signed adjustments
assignment_balance = assignment_payable - assignment_net_payments

shipment_driver_balance = sum(assignment balances)
```

Each ledger entry must identify the driver and, for multi-driver correctness, the assignment when applicable.

### Status derivation

```text
payment state:
  balance = original total       -> unpaid
  0 < balance < original total   -> partially paid
  balance = 0                    -> paid/settled
  balance < 0                    -> credit balance

overdue:
  invoice is issued
  and current date > due_date
  and invoice_balance > 0
```

Operational cancellation must not silently delete financial history. It should prevent new billable activity and require explicit invoice/payment handling.

## 7. Business-rule decisions required before coding financial repairs

| Decision | Recommended MVP rule | Why it matters |
| --- | --- | --- |
| When is an invoice created? | Explicit Generate Invoice action after shipment is delivered/completed and billable expenses are approved. | Prevents stale and premature invoices. |
| Can a draft be regenerated? | Yes, transactionally replace all draft items. | Keeps a draft aligned without corrupting issued history. |
| Can an issued invoice change? | No direct mutation; void/reissue or adjustment. | Preserves snapshot and audit integrity. |
| What does `included_in_invoice` mean? | Approved billable expense is eligible; inclusion selects the next draft invoice. | Separates billing eligibility from actual invoicing. |
| Who receives a driver-reimbursable expense? | A specific shipment assignment is mandatory. | Required for multi-driver balances. |
| Can one payment cover multiple invoices? | For MVP, one payment can be recorded with one or more explicit allocations; unallocated remainder is on-account credit only if enabled. | Prevents client-level totals from hiding invoice errors. |
| Are overpayments allowed? | Block by default; enable explicit credit flow later. | Avoids hidden negative balances. |
| Can posted payments be edited/deleted? | No; create a reversal and corrected entry with reason. | Preserves audit trail. |
| How are adjustments signed? | Explicit debit/credit direction, never overloaded positive values. | Makes balances understandable. |
| What date drives financial reports? | Offer separate accrual (invoice issue) and cash (payment date) reports. | Prevents mixing revenue with collections. |
| What currency/rounding applies? | One organization currency for MVP; round line amounts to 2 decimals and totals from rounded lines. | Ensures UI/DB/PDF parity. |
| What does shipment completion require? | Delivered proof or manual confirmation, assignments present, and required fields valid; finance may remain open. | Separates operations from settlement. |
| How is cancellation handled? | Cancel state plus mandatory reason; void draft invoice, preserve issued invoice/payment history for explicit resolution. | Prevents disappearance of financial records. |
| What is the customer reference? | Keep a dedicated optional `customer_reference`; never reuse invoice number as shipment identity. | Removes the current field-name collision. |

The answers become the signed `DOMAIN_RULES.md` and are versioned. Formula changes after launch require a migration/recalculation policy, not an untracked frontend edit.

## 8. Audit execution plan

### Phase A - Protect, inventory, and baseline

Actions:

1. Keep the app stopped while establishing the baseline.
2. Record code revision, migration inventory, deployed Edge Function versions, environment mode, and package lock hash.
3. Take a database backup or Supabase point-in-time snapshot before any repair.
4. Export read-only counts and control totals by organization for shipments, assignments, expenses, invoices, invoice items, and payments.
5. Inventory every field from UI input to hook, service payload, DB column, reader, calculation, report, and print output.
6. Mark each field as authoritative, derived, snapshot, display-only, legacy, or unknown.

Deliverables:

- `SOURCE_OF_TRUTH_MATRIX.md`
- `FIELD_DATA_LINEAGE.md`
- Baseline control-total report
- Environment/migration inventory

Exit gate: every persisted business field has an owner and classification; no mutation has occurred.

### Phase B - Domain specification and state machines

Actions:

1. Run a rule workshop using real pilot examples, especially multi-driver and partially paid jobs.
2. Approve the formulas and decisions in Sections 5-7.
3. Define operational shipment transitions and who may perform each transition.
4. Define invoice lifecycle separately from derived payment/overdue state.
5. Define expense combination rules and conditional validation.
6. Define ledger posting, allocation, reversal, and credit behavior.
7. Define period/date semantics for dashboard and reports.

Deliverables:

- `DOMAIN_RULES.md`
- `CALCULATION_SPEC.md`
- `STATUS_TRANSITION_MATRIX.md`
- `ROLE_PERMISSION_MATRIX.md`

Exit gate: product owner and engineering agree on examples and expected numeric outcomes.

### Phase C - Characterization test harness

Actions:

1. Add Vitest for pure TypeScript tests.
2. Add React Testing Library for form/hook behavior.
3. Add Playwright for role-based end-to-end workflows.
4. Add database tests (pgTAP or SQL assertions) for constraints, RLS, transactions, and functions.
5. Create deterministic organization/role seed data.
6. Capture current behavior with characterization tests, even where it is wrong, then mark the intended expectation.
7. Add CI commands for typecheck, lint, unit, integration, E2E, and build.

Recommended scripts:

```text
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:db
npm run build
```

Exit gate: every Critical/High finding has a failing regression test or a database reconciliation assertion before its fix is merged.

### Phase D - Runtime stabilization

Actions:

1. Memoize filtered hook outputs such as `allExpenses`.
2. Remove effects that mirror fully derived state into local state.
3. Make callbacks stable and organization-scoped.
4. Replace broad global refresh with scoped invalidation.
5. Add stale-request protection and visible mutation states.
6. Ensure a failed action reports exactly what committed and provides a safe recovery path until transactions are in place.

Exit gate: no maximum-update-depth errors, no duplicate network mutation caused by React effects, and stable render/request counts under E2E observation.

### Phase E - Canonical financial engine

Actions:

1. Implement pure domain modules for expenses, shipment projections, invoice totals, client balances, driver balances, profit, and statuses.
2. Use a decimal-safe representation and explicit rounding policy.
3. Remove calculation logic from pages, hooks, and display components.
4. Return typed projections such as `ShipmentFinancialProjection`, `InvoiceBalanceProjection`, and `DriverSettlementProjection`.
5. Make demo and Supabase adapters consume the same engine.
6. Add property-based tests for invariants in addition to example tests.

Exit gate: the same golden input produces byte-for-byte equivalent numeric projections in all adapters and consuming screens.

### Phase F - Schema and atomic workflow remediation

Implement migrations additively first. Do not drop legacy columns until reconciliation is complete.

Recommended database work:

1. Add `shipment_assignment_id` to relevant driver payments and reimbursable expense allocation.
2. Add explicit payment allocation tables if payments may cover multiple invoices.
3. Add idempotency/request keys to critical workflow functions.
4. Add invoice lifecycle timestamps (`issued_at`, `sent_at`, `voided_at`) and correction references if approved.
5. Persist organization invoice settings and term days in the existing `settings` table.
6. Add partial/conditional constraints for valid expense and payment combinations.
7. Add audit logging inside critical mutation functions.
8. Add safe uniqueness rules for shipment/customer references and atomic invoice numbers.

Recommended transactional functions:

- `save_shipment_with_assignments(...)`
- `generate_invoice_for_shipment(...)`
- `replace_draft_invoice_items(...)`
- `record_client_payment_with_allocations(...)`
- `record_driver_payment(...)`
- `reverse_financial_entry(...)`
- `transition_shipment_status(...)`

Function requirements:

- Validate tenant ownership for every referenced row.
- Validate the caller's active membership and role.
- Lock affected rows where concurrency matters.
- Commit all related rows or none.
- Be idempotent for retried requests.
- Write an audit event in the same transaction.
- Return the complete authoritative projection needed by the UI.

Exit gate: injected failures at every intermediate step leave no partial rows, and concurrent invoice/payment tests reconcile correctly.

### Phase G - Data migration and reconciliation

Actions:

1. Run a dry-run classification of every legacy advance and fixed expense value.
2. Detect whether assignment advances already have matching ledger entries before migrating; never blindly copy both.
3. Allocate multi-driver advances only with verifiable evidence; place ambiguous rows in a manual-review queue.
4. Convert Gate Pass/Fashah/NAQL legacy columns into normalized expense rows with deterministic migration keys.
5. Compare parent driver rate to assignment-rate sum and resolve discrepancies explicitly.
6. Compare invoice header totals to invoice item totals and live shipment charges.
7. Reconcile client and driver ledgers to balances before and after migration.
8. Preserve old values in migration/audit tables and produce rollback mappings.
9. Only after zero unexplained variance, stop legacy writes and later remove legacy reads.

Required reconciliation queries:

- Assignment advance total versus active driver advance ledger total.
- Parent driver rate versus sum of active assignment rates.
- Legacy fixed expenses versus normalized categorized expenses.
- Invoice subtotal/expense/total versus sum of invoice item types.
- Client payments by invoice and shipment versus receivable.
- Driver payments by driver, shipment, and assignment versus payable.
- Payment rows attached to a driver not assigned to the shipment.
- Overpayments, zero-value payments, duplicate references, and orphan allocations.
- Issued invoices missing items, due dates, client snapshot, or shipment snapshot.
- Active children of soft-deleted parents.
- Cross-organization foreign-key mismatches and RLS-access probes.
- Attachment metadata without an object and objects without active metadata.

Exit gate: reconciliation report shows zero unexplained differences; ambiguous records are approved manually and recorded.

### Phase H - Frontend workflow rewiring

Actions:

1. Shipment form saves shipment and assignments through the atomic workflow only.
2. Capture driver rate and advance per assignment; remove shipment-level advance as an editable financial source.
3. Add conditional expense fields and validation driven by the domain rules.
4. Separate Save Shipment, Complete Shipment, Generate Invoice, Record Payment, and Reverse Payment actions.
5. Prevent invoice preview from implicitly creating an invoice.
6. Show the document lifecycle and derived balance status as separate labels.
7. Read all financial totals from canonical projections/server responses.
8. Display credit/overpayment and reconciliation exceptions rather than clamping them away.
9. Make business settings organization-backed and add explicit organization switching.
10. Remove legacy fallbacks after migration gates pass.

Exit gate: no page independently recalculates business totals; every mutation has validation, loading, success, failure, and retry behavior.

### Phase I - Reporting, imports, attachments, and operations

Actions:

1. Define each dashboard/report metric with name, formula, date basis, exclusions, and drill-down query.
2. Move growing reports to server-side, organization-scoped aggregate queries.
3. Add cash-versus-accrual labeling and prevent mixed-period totals.
4. Rebuild imports as preview -> validate -> stage -> commit -> reconcile workflows.
5. Add deterministic import keys, row-level error export, and rollback batch ID.
6. Replace or sandbox vulnerable spreadsheet parsing.
7. Add R2 orphan cleanup, retry, and monitoring.
8. Add structured error logging and workflow audit views for administrators.

Exit gate: every aggregate drills down to the exact source rows and equals their sum; import re-runs are idempotent.

### Phase J - Release qualification and controlled rollout

Actions:

1. Run the full automated suite against a fresh database built from all migrations.
2. Run migration forward, rollback where supported, and forward-again tests on a production-like copy.
3. Complete role-based UAT with owner, admin, manager, accountant, dispatcher, and viewer.
4. Run concurrency tests for invoice numbering, duplicate submits, payment retries, and simultaneous edits.
5. Run a pilot shadow comparison: old projections versus new projections, with differences logged but not yet presented as authoritative.
6. Obtain financial reconciliation sign-off.
7. Release behind organization-level feature flags, starting with the pilot.
8. Monitor error rate, reconciliation exceptions, duplicate-request rejection, and balance drift.
9. Keep a tested rollback path that restores the previous reader while preserving new ledger/audit rows.

Exit gate: no Critical/High defects, no unexplained control-total difference, all role tests pass, and pilot owner signs off on golden scenarios.

## 9. Golden QA dataset

The test fixture must contain explicit expected values for at least these scenarios:

| Scenario | Required assertions |
| --- | --- |
| Single shipment, no expenses/payments | Base client charge, driver payable, profit, unpaid states. |
| Approved company-paid billable expense | Actual cost, client charge, markup, invoice item, profit. |
| Approved driver-paid reimbursable expense | Correct assignment payable and company cost counted once. |
| Non-billable company expense | Cost/profit changes; invoice does not. |
| Pending/unapproved expense | No financial authority until approved; visible pending queue. |
| Approved billable but excluded from invoice | Appears as unbilled charge, not in current invoice. |
| Multi-driver, two legs | Rate and balance per assignment equal shipment totals. |
| Per-driver advances | Each ledger entry reduces only the intended assignment balance. |
| Partial client payment | Exact remaining invoice balance on all screens. |
| Partial driver settlement | Exact remaining driver/assignment balance on all screens. |
| Attempted overpayment | Rejected or represented as explicit credit according to policy. |
| Draft regenerated after expense change | Header and every item replaced atomically. |
| Issued invoice followed by shipment edit | Issued snapshot remains unchanged. |
| Cancelled shipment | Operational state changes without deleting financial history. |
| Payment reversal | Original and reversal remain visible; net balance restores correctly. |
| Duplicate submission/retry | One logical shipment/invoice/payment is created. |
| Concurrent invoice generation | Unique sequential organization-scoped numbers. |
| Soft-deleted record | Excluded consistently from projections and reports. |
| Two organizations with identical names/references | No cross-tenant visibility or aggregation. |
| Every role | UI authorization and RLS result match the permission matrix. |
| Import batch re-run | Zero duplicates and identical control totals. |

## 10. Non-negotiable test invariants

1. `invoice.total_amount = sum(active invoice_items.amount)`.
2. `shipment base driver payable = sum(active assignment.driver_rate)`.
3. An expense contributes at most once to operational cost.
4. A ledger entry contributes exactly once to one intended balance.
5. Shipment, invoice, client, driver, dashboard, report, print, and export agree for the same projection/date basis.
6. Issued invoice snapshots never change because a related master or shipment record changed.
7. Derived status is a pure result of lifecycle fields, dates, totals, and ledgers.
8. No failed transactional workflow leaves a partial aggregate.
9. Retrying the same idempotent request does not create duplicates.
10. Every referenced row belongs to the same organization.
11. A viewer cannot mutate; a dispatcher cannot mutate finance; accountant/manager rights match the approved matrix.
12. Soft-deleted/reversed rows are excluded or netted according to one documented rule.
13. Negative balance is never silently clamped or hidden.
14. Report totals always drill down to the exact included rows.
15. Demo and Supabase contract fixtures produce the same domain results.

## 11. Security and tenancy QA matrix

For each table, RPC, Edge Function, and report query, test:

- Unauthenticated request.
- Active member of owning organization.
- Active member of another organization.
- Disabled/removed membership.
- Each supported role.
- Spoofed `organization_id` in payload.
- Cross-tenant foreign key ID in payload.
- Direct REST/RPC call that bypasses the UI.
- Soft-deleted parent/child access.
- Signed URL request for another tenant's attachment.

The database or server function must reject unauthorized requests even if the frontend permission helper is removed.

## 12. Deliverables by the end of implementation

- Approved domain rulebook and terminology glossary.
- Source-of-truth and field-lineage matrices.
- Calculation specification with worked examples.
- Status-transition and role-permission matrices.
- Severity-ranked defect register with reproduction and regression test.
- Canonical TypeScript domain calculation package.
- Atomic Supabase migrations/functions and database tests.
- Data-migration scripts with dry-run and rollback support.
- Reconciliation SQL and signed before/after reports.
- Unit, integration, database, component, and E2E suites.
- Stable demo and Supabase adapters sharing the same domain rules.
- Operational monitoring, audit view, release checklist, and rollback runbook.

## 13. Recommended priority order

### Wave 0 - Stop incorrect financial mutation

- Resolve advance duplication and multi-driver allocation.
- Stop automatic invoice creation on shipment save/preview.
- Remove the Paid-to-Sent status effect.
- Stabilize the render loop.
- Add temporary guards around zero/overpayments and partial workflow failures.

### Wave 1 - Establish authority

- Approve domain rules.
- Build golden fixtures and regression harness.
- Implement canonical calculations and status derivation.
- Make organization settings authoritative.

### Wave 2 - Make persistence safe

- Add assignment-aware ledger schema.
- Add payment allocations if approved.
- Add transactional shipment, invoice, and payment workflows.
- Add audit logging and idempotency.

### Wave 3 - Migrate and reconcile

- Deduplicate advances.
- Normalize legacy expenses.
- Reconcile assignments, invoices, and payments.
- Disable legacy writes, then legacy reads.

### Wave 4 - Rewire product surfaces

- Shipment/expense/invoice/payment workflows.
- Directory and finance totals.
- Dashboard and reports.
- Imports and attachment cleanup.

### Wave 5 - Qualify and release

- Full security, concurrency, migration, and E2E QA.
- Shadow comparisons and pilot UAT.
- Feature-flagged rollout with monitoring and rollback.

## 14. Definition of done

The logical-system remediation is complete only when:

- Every financial field has one authoritative source.
- All formulas are approved, versioned, and covered by golden tests.
- No Critical or High issue remains open.
- All multi-row workflows are atomic and idempotent.
- Existing data reconciles with zero unexplained variance.
- All screens, reports, print output, and exports agree.
- Issued invoices and posted ledger history are auditable and immutable except through controlled correction.
- All role and cross-tenant tests pass at the database boundary.
- Demo and Supabase modes pass the same domain contract suite.
- Production build, automated QA, pilot UAT, monitoring, and rollback readiness all pass the release gate.

