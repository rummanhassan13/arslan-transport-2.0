-- Run against a disposable database after all migrations.
-- These assertions intentionally fail fast without requiring pgTAP.

do $$
declare
  v_missing text[];
begin
  select array_agg(required.name) into v_missing
  from (values
    ('save_shipment_with_assignments'),
    ('generate_invoice_for_shipment'),
    ('transition_shipment_status'),
    ('transition_invoice_lifecycle'),
    ('record_client_payment'),
    ('record_driver_payment'),
    ('reverse_client_payment'),
    ('reverse_driver_payment'),
    ('void_client_payment'),
    ('void_driver_payment'),
    ('create_shipment_with_invoice')
  ) as required(name)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = required.name
  );
  if v_missing is not null then
    raise exception 'Missing business workflow functions: %', v_missing;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'one_active_invoice_per_shipment'
  ) then raise exception 'Missing one-active-invoice-per-shipment guard.'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'driver_payments' and column_name = 'shipment_assignment_id'
  ) then raise exception 'Driver payments are not assignment-aware.'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_payments' and column_name = 'direction'
  ) then raise exception 'Client ledger does not support immutable reversals.'; end if;
end;
$$;
