-- Expense "Pay driver" amount.
-- A driver-reimbursable expense now carries its own amount added to the driver's total (driver_pay_amount).
-- NULL keeps the previous behaviour: the driver is reimbursed the expense's actual cost (amount).

alter table public.shipment_expenses
  add column if not exists driver_pay_amount numeric(12, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shipment_expenses_driver_pay_amount_nonnegative'
      and conrelid = 'public.shipment_expenses'::regclass
  ) then
    alter table public.shipment_expenses
      add constraint shipment_expenses_driver_pay_amount_nonnegative
      check (driver_pay_amount is null or driver_pay_amount >= 0);
  end if;
end $$;

comment on column public.shipment_expenses.driver_pay_amount is
  'Amount added to the driver payable for a driver-reimbursable expense. NULL = use amount (actual cost).';

-- The driver payment cap must use the same payable as the app: rate + each reimbursable expense's driver_pay_amount
-- (falling back to amount). Only the two payable sums differ from the version in 015.
create or replace function public.record_driver_payment(
  p_organization_id uuid,
  p_driver_id uuid,
  p_shipment_id uuid,
  p_shipment_assignment_id uuid,
  p_amount numeric,
  p_payment_type text,
  p_payment_date date,
  p_payment_method text,
  p_reference_no text,
  p_notes text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payable numeric(12,2);
  v_paid numeric(12,2);
  v_payment_id uuid;
  v_assignment_count integer;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'You do not have permission to record driver payments.';
  end if;
  if p_shipment_id is null then raise exception 'Driver payments must be linked to a shipment.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_payment_type not in ('advance', 'settlement', 'reimbursement', 'adjustment') then raise exception 'Invalid driver payment type.'; end if;
  perform public.assert_org_reference('public.drivers', p_driver_id, p_organization_id, 'Driver');
  perform public.assert_org_reference('public.shipments', p_shipment_id, p_organization_id, 'Shipment');
  perform 1 from public.shipments where id = p_shipment_id for update;
  if p_idempotency_key is not null then
    select id into v_payment_id from public.driver_payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key and deleted_at is null;
    if v_payment_id is not null then return v_payment_id; end if;
  end if;
  select count(*) into v_assignment_count
  from public.shipment_driver_assignments
  where shipment_id = p_shipment_id and organization_id = p_organization_id and deleted_at is null;
  if p_shipment_assignment_id is not null then
    select driver_rate into v_payable
    from public.shipment_driver_assignments
    where id = p_shipment_assignment_id
      and shipment_id = p_shipment_id
      and organization_id = p_organization_id
      and driver_id = p_driver_id
      and deleted_at is null;
    if not found then raise exception 'Assignment does not match this shipment and driver.'; end if;
    select v_payable + coalesce(sum(coalesce(driver_pay_amount, amount)), 0) into v_payable
    from public.shipment_expenses
    where shipment_id = p_shipment_id and organization_id = p_organization_id
      and deleted_at is null and approved = true and driver_reimbursable = true
      and (shipment_assignment_id = p_shipment_assignment_id or (shipment_assignment_id is null and v_assignment_count = 1));
    select coalesce(sum(amount * direction), 0) into v_paid
    from public.driver_payments
    where organization_id = p_organization_id and shipment_id = p_shipment_id
      and shipment_assignment_id = p_shipment_assignment_id and deleted_at is null;
  else
    select coalesce(sum(driver_rate), 0) into v_payable
    from public.shipment_driver_assignments
    where shipment_id = p_shipment_id and organization_id = p_organization_id
      and driver_id = p_driver_id and deleted_at is null;
    if v_assignment_count > 1 and exists (
      select 1 from public.shipment_driver_assignments
      where shipment_id = p_shipment_id and organization_id = p_organization_id
        and driver_id = p_driver_id and deleted_at is null
      group by driver_id having count(*) > 1
    ) then
      raise exception 'Select a specific assignment for a driver assigned to multiple legs.';
    end if;
    select v_payable + coalesce(sum(coalesce(e.driver_pay_amount, e.amount)), 0) into v_payable
    from public.shipment_expenses e
    left join public.shipment_driver_assignments a on a.id = e.shipment_assignment_id
    where e.shipment_id = p_shipment_id and e.organization_id = p_organization_id
      and e.deleted_at is null and e.approved = true and e.driver_reimbursable = true
      and ((a.driver_id = p_driver_id and a.deleted_at is null) or (e.shipment_assignment_id is null and v_assignment_count = 1));
    select coalesce(sum(amount * direction), 0) into v_paid
    from public.driver_payments
    where organization_id = p_organization_id and shipment_id = p_shipment_id
      and driver_id = p_driver_id and deleted_at is null;
  end if;
  if v_payable <= 0 then raise exception 'No payable amount exists for this driver and shipment.'; end if;
  if p_amount > v_payable - v_paid then raise exception 'Payment exceeds the outstanding driver balance of %.', v_payable - v_paid; end if;
  insert into public.driver_payments (
    organization_id, driver_id, shipment_id, shipment_assignment_id,
    amount, direction, payment_type, payment_date, payment_method,
    reference_no, notes, idempotency_key, created_by, updated_by
  ) values (
    p_organization_id, p_driver_id, p_shipment_id, p_shipment_assignment_id,
    p_amount, 1, p_payment_type, coalesce(p_payment_date, current_date),
    nullif(p_payment_method, ''), nullif(p_reference_no, ''), nullif(p_notes, ''),
    p_idempotency_key, auth.uid(), auth.uid()
  ) returning id into v_payment_id;
  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, new_values)
  values (
    p_organization_id, auth.uid(), 'driver_payment', v_payment_id, 'payment_recorded',
    (select to_jsonb(p) from public.driver_payments p where p.id = v_payment_id)
  );
  return v_payment_id;
end;
$$;
