-- Cleans up draft invoices that got extra line items from the (now removed) draft refresh.
-- Run in the Supabase SQL editor (it bypasses row-level security, which blocked the old delete).
-- For each draft invoice with more than one transport item or repeated expense items:
--   * keeps the earliest transport item and sets it to the shipment's current company rate,
--   * keeps the earliest item per expense,
--   * recomputes the invoice totals.
-- Review the SELECT first, then run the rest.

-- 1) Preview: draft invoices that have more than one transport item.
select i.invoice_number, count(*) filter (where it.item_type = 'transport') as transport_items
from public.invoices i
join public.invoice_items it on it.invoice_id = i.id
where i.status = 'draft'
group by i.id, i.invoice_number
having count(*) filter (where it.item_type = 'transport') > 1;

begin;

-- 2) Delete extra transport items (keep the earliest per invoice).
delete from public.invoice_items it
using public.invoices i
where it.invoice_id = i.id
  and i.status = 'draft'
  and it.item_type = 'transport'
  and it.id <> (
    select first_item.id from public.invoice_items first_item
    where first_item.invoice_id = it.invoice_id and first_item.item_type = 'transport'
    order by first_item.created_at, first_item.id
    limit 1
  );

-- 3) Delete repeated expense items (keep the earliest per expense).
delete from public.invoice_items it
using public.invoices i
where it.invoice_id = i.id
  and i.status = 'draft'
  and it.item_type = 'expense'
  and it.snapshot ->> 'expenseId' is not null
  and it.id <> (
    select first_item.id from public.invoice_items first_item
    where first_item.invoice_id = it.invoice_id
      and first_item.item_type = 'expense'
      and first_item.snapshot ->> 'expenseId' = it.snapshot ->> 'expenseId'
    order by first_item.created_at, first_item.id
    limit 1
  );

-- 4) Set the remaining transport item to the shipment's current company rate.
update public.invoice_items it
set unit_price = s.company_rate, amount = s.company_rate
from public.invoices i
join public.shipments s on s.id = i.shipment_id
where it.invoice_id = i.id
  and i.status = 'draft'
  and it.item_type = 'transport';

-- 5) Recompute invoice totals.
update public.invoices i
set subtotal = t.subtotal, expense_total = t.expense_total, total_amount = t.total
from (
  select invoice_id,
    coalesce(sum(amount) filter (where item_type <> 'expense'), 0) as subtotal,
    coalesce(sum(amount) filter (where item_type = 'expense'), 0) as expense_total,
    coalesce(sum(amount), 0) as total
  from public.invoice_items
  group by invoice_id
) t
where t.invoice_id = i.id and i.status = 'draft';

commit;
