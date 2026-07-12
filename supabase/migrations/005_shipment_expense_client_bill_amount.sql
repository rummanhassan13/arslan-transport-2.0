alter table public.shipment_expenses
  add column if not exists client_bill_amount numeric(12, 2);

update public.shipment_expenses
set client_bill_amount = amount
where client_bill_amount is null;

alter table public.shipment_expenses
  alter column client_bill_amount set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shipment_expenses_client_bill_amount_nonnegative'
  ) then
    alter table public.shipment_expenses
      add constraint shipment_expenses_client_bill_amount_nonnegative
      check (client_bill_amount is null or client_bill_amount >= 0);
  end if;
end $$;

comment on column public.shipment_expenses.amount is
  'Actual expense cost. Kept as the legacy storage column for compatibility.';

comment on column public.shipment_expenses.client_bill_amount is
  'Amount billed to the client for this expense. Defaults from amount for existing rows.';
