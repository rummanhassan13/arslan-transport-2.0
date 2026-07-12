-- TransportFlow read-only financial and logical reconciliation.
-- Run in Supabase SQL Editor after replacing the organization UUID below.
-- This script does not mutate data.

begin transaction read only;

-- Set this once for the session, for example:
-- select set_config('transportflow.audit_org_id', '00000000-0000-0000-0000-000000000000', true);

-- 1. Record counts and control totals.
select 'shipments' as entity, count(*) as active_rows,
       coalesce(sum(company_rate), 0) as amount_1,
       coalesce(sum(driver_rate), 0) as amount_2
from public.shipments
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null
union all
select 'expenses', count(*), coalesce(sum(amount), 0), coalesce(sum(client_bill_amount), 0)
from public.shipment_expenses
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null
union all
select 'invoices', count(*), coalesce(sum(total_amount), 0), coalesce(sum(expense_total), 0)
from public.invoices
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null
union all
select 'client_payments', count(*), coalesce(sum(amount * direction), 0), 0
from public.client_payments
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null
union all
select 'driver_payments', count(*), coalesce(sum(amount * direction), 0), 0
from public.driver_payments
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null;

-- 2. Parent driver rate must equal the active assignment-rate sum.
select s.id, s.shipment_no, s.driver_rate as parent_driver_rate,
       coalesce(sum(a.driver_rate) filter (where a.deleted_at is null), 0) as assignment_driver_rate,
       s.driver_rate - coalesce(sum(a.driver_rate) filter (where a.deleted_at is null), 0) as difference
from public.shipments s
left join public.shipment_driver_assignments a on a.shipment_id = s.id
where s.organization_id = current_setting('transportflow.audit_org_id')::uuid and s.deleted_at is null
group by s.id, s.shipment_no, s.driver_rate
having s.driver_rate <> coalesce(sum(a.driver_rate) filter (where a.deleted_at is null), 0)
order by abs(s.driver_rate - coalesce(sum(a.driver_rate) filter (where a.deleted_at is null), 0)) desc;

-- 3. Legacy advances that may already be duplicated in the ledger.
select s.id, s.shipment_no, s.advance as shipment_advance,
       coalesce(sum(a.advance_paid) filter (where a.deleted_at is null), 0) as assignment_advance,
       coalesce((select sum(p.amount * p.direction) from public.driver_payments p
                where p.shipment_id = s.id and p.payment_type = 'advance' and p.deleted_at is null), 0) as ledger_advance
from public.shipments s
left join public.shipment_driver_assignments a on a.shipment_id = s.id
where s.organization_id = current_setting('transportflow.audit_org_id')::uuid
  and s.deleted_at is null
group by s.id, s.shipment_no, s.advance
having s.advance <> 0
    or coalesce(sum(a.advance_paid) filter (where a.deleted_at is null), 0) <> 0;

-- 4. Legacy fixed expenses alongside normalized categories (manual duplicate review).
select s.id, s.shipment_no, s.gate_pass, s.fashah, s.naql,
       coalesce(sum(e.amount) filter (where e.category = 'gate_pass' and e.deleted_at is null), 0) as normalized_gate_pass,
       coalesce(sum(e.amount) filter (where e.category = 'fashah' and e.deleted_at is null), 0) as normalized_fashah,
       coalesce(sum(e.amount) filter (where e.category = 'naql' and e.deleted_at is null), 0) as normalized_naql
from public.shipments s
left join public.shipment_expenses e on e.shipment_id = s.id
where s.organization_id = current_setting('transportflow.audit_org_id')::uuid and s.deleted_at is null
group by s.id, s.shipment_no, s.gate_pass, s.fashah, s.naql
having s.gate_pass <> 0 or s.fashah <> 0 or s.naql <> 0;

-- 5. Multi-assignment reimbursable expenses without an allocation.
select e.id, e.shipment_id, s.shipment_no, e.category, e.amount
from public.shipment_expenses e
join public.shipments s on s.id = e.shipment_id
where e.organization_id = current_setting('transportflow.audit_org_id')::uuid
  and e.deleted_at is null and e.approved and e.driver_reimbursable
  and e.shipment_assignment_id is null
  and (select count(*) from public.shipment_driver_assignments a
       where a.shipment_id = e.shipment_id and a.deleted_at is null) > 1;

-- 6. Driver payments not uniquely attached to an active assignment.
select p.id, p.shipment_id, s.shipment_no, p.driver_id, p.amount, p.payment_type
from public.driver_payments p
join public.shipments s on s.id = p.shipment_id
where p.organization_id = current_setting('transportflow.audit_org_id')::uuid
  and p.deleted_at is null and p.shipment_assignment_id is null
  and (select count(*) from public.shipment_driver_assignments a
       where a.shipment_id = p.shipment_id and a.driver_id = p.driver_id and a.deleted_at is null) <> 1;

-- 7. Invoice header-to-item drift or missing items.
select i.id, i.invoice_number, i.subtotal, i.expense_total, i.total_amount,
       coalesce(sum(ii.amount) filter (where ii.item_type <> 'expense'), 0) as item_subtotal,
       coalesce(sum(ii.amount) filter (where ii.item_type = 'expense'), 0) as item_expense_total,
       coalesce(sum(ii.amount), 0) as item_total,
       count(ii.id) as item_count
from public.invoices i
left join public.invoice_items ii on ii.invoice_id = i.id
where i.organization_id = current_setting('transportflow.audit_org_id')::uuid and i.deleted_at is null
group by i.id, i.invoice_number, i.subtotal, i.expense_total, i.total_amount
having i.subtotal <> coalesce(sum(ii.amount) filter (where ii.item_type <> 'expense'), 0)
    or i.expense_total <> coalesce(sum(ii.amount) filter (where ii.item_type = 'expense'), 0)
    or i.total_amount <> coalesce(sum(ii.amount), 0)
    or count(ii.id) = 0;

-- 8. Client invoice balances, including overpayments/credits.
select i.id, i.invoice_number, i.total_amount,
       coalesce(sum(p.amount * p.direction) filter (where p.deleted_at is null), 0) as paid,
       i.total_amount - coalesce(sum(p.amount * p.direction) filter (where p.deleted_at is null), 0) as balance
from public.invoices i
left join public.client_payments p on p.invoice_id = i.id
where i.organization_id = current_setting('transportflow.audit_org_id')::uuid and i.deleted_at is null
group by i.id, i.invoice_number, i.total_amount
having i.total_amount - coalesce(sum(p.amount * p.direction) filter (where p.deleted_at is null), 0) < 0;

-- 9. Invalid/legacy zero-value ledger entries.
select 'client' as ledger, id, amount, created_at
from public.client_payments
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null and amount <= 0
union all
select 'driver', id, amount, created_at
from public.driver_payments
where organization_id = current_setting('transportflow.audit_org_id')::uuid and deleted_at is null and amount <= 0;

-- 10. Active financial children of a soft-deleted shipment.
select 'expense' as child_type, e.id as child_id, e.shipment_id
from public.shipment_expenses e join public.shipments s on s.id = e.shipment_id
where e.organization_id = current_setting('transportflow.audit_org_id')::uuid and e.deleted_at is null and s.deleted_at is not null
union all
select 'driver_payment', p.id, p.shipment_id
from public.driver_payments p join public.shipments s on s.id = p.shipment_id
where p.organization_id = current_setting('transportflow.audit_org_id')::uuid and p.deleted_at is null and s.deleted_at is not null
union all
select 'client_payment', p.id, p.shipment_id
from public.client_payments p join public.shipments s on s.id = p.shipment_id
where p.organization_id = current_setting('transportflow.audit_org_id')::uuid and p.deleted_at is null and s.deleted_at is not null;

-- 11. Attachment metadata candidates for R2 object verification/cleanup.
select id, shipment_id, storage_key, deleted_at
from public.shipment_attachments
where organization_id = current_setting('transportflow.audit_org_id')::uuid
order by deleted_at nulls first, created_at;

rollback;

