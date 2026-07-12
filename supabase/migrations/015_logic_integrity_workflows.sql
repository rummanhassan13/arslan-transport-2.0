-- Canonical business logic, atomic workflows, and ledger integrity.
-- Apply after 014_driver_assignment_advance.sql.

-- ---------------------------------------------------------------------------
-- Additive schema changes. Legacy shipment/assignment finance columns remain
-- during reconciliation but are no longer authoritative for new workflows.
-- ---------------------------------------------------------------------------

alter table public.settings
  add column if not exists invoice_due_days integer not null default 15 check (invoice_due_days >= 0),
  add column if not exists invoice_footer_notes text,
  add column if not exists company_profile jsonb not null default '{}'::jsonb;

alter table public.shipments
  add column if not exists workflow_key text;

create unique index if not exists shipments_org_workflow_key_unique
  on public.shipments (organization_id, workflow_key)
  where workflow_key is not null;

alter table public.shipment_expenses
  add column if not exists shipment_assignment_id uuid
    references public.shipment_driver_assignments(id) on delete set null;

create index if not exists shipment_expenses_assignment_idx
  on public.shipment_expenses(shipment_assignment_id)
  where shipment_assignment_id is not null and deleted_at is null;

alter table public.client_payments
  add column if not exists direction smallint not null default 1 check (direction in (-1, 1)),
  add column if not exists reversal_of_id uuid references public.client_payments(id) on delete restrict,
  add column if not exists idempotency_key text;

alter table public.driver_payments
  add column if not exists shipment_assignment_id uuid
    references public.shipment_driver_assignments(id) on delete set null,
  add column if not exists direction smallint not null default 1 check (direction in (-1, 1)),
  add column if not exists reversal_of_id uuid references public.driver_payments(id) on delete restrict,
  add column if not exists idempotency_key text;

alter table public.invoices
  add column if not exists issued_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists idempotency_key text;

create table if not exists public.attachment_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attachment_table text not null check (attachment_table in ('shipment_attachments', 'expense_attachments')),
  attachment_id uuid not null,
  object_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (attachment_table, attachment_id)
);

alter table public.attachment_cleanup_jobs enable row level security;
create policy "attachment_cleanup_jobs_select_admin" on public.attachment_cleanup_jobs
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));
create policy "attachment_cleanup_jobs_insert_attachment_roles" on public.attachment_cleanup_jobs
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant', 'dispatcher']));

create or replace function public.enqueue_attachment_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_object_key text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    v_object_key := case
      when tg_table_name = 'shipment_attachments' then to_jsonb(new)->>'storage_key'
      else to_jsonb(new)->>'object_key'
    end;
    if nullif(v_object_key, '') is not null then
      insert into public.attachment_cleanup_jobs(organization_id, attachment_table, attachment_id, object_key)
      values (new.organization_id, tg_table_name, new.id, v_object_key)
      on conflict (attachment_table, attachment_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enqueue_shipment_attachment_cleanup on public.shipment_attachments;
create trigger enqueue_shipment_attachment_cleanup
after update of deleted_at on public.shipment_attachments
for each row execute function public.enqueue_attachment_cleanup();

drop trigger if exists enqueue_expense_attachment_cleanup on public.expense_attachments;
create trigger enqueue_expense_attachment_cleanup
after update of deleted_at on public.expense_attachments
for each row execute function public.enqueue_attachment_cleanup();

create unique index if not exists client_payments_org_idempotency_unique
  on public.client_payments(organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists driver_payments_org_idempotency_unique
  on public.driver_payments(organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists invoices_org_idempotency_unique
  on public.invoices(organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists one_active_invoice_per_shipment
  on public.invoices(organization_id, shipment_id)
  where shipment_id is not null and deleted_at is null and status <> 'cancelled';

create unique index if not exists one_reversal_per_client_payment
  on public.client_payments(reversal_of_id)
  where reversal_of_id is not null and deleted_at is null;

create unique index if not exists one_reversal_per_driver_payment
  on public.driver_payments(reversal_of_id)
  where reversal_of_id is not null and deleted_at is null;

alter table public.client_payments
  add constraint client_payments_positive_amount check (amount > 0) not valid;

alter table public.driver_payments
  add constraint driver_payments_positive_amount check (amount > 0) not valid;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'create', 'update', 'delete', 'restore', 'login', 'export',
    'invoice_generated', 'invoice_transitioned', 'payment_recorded',
    'payment_reversed', 'shipment_transitioned'
  ));

create or replace function public.validate_shipment_expense_treatment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.amount <= 0 then
    raise exception 'Expense actual cost must be greater than zero.';
  end if;
  if new.included_in_invoice and not new.client_billable then
    raise exception 'Only client-billable expenses can be included in an invoice.';
  end if;
  if new.driver_reimbursable and new.paid_by <> 'driver' then
    raise exception 'A driver-reimbursable expense must be recorded as paid by the driver.';
  end if;
  if new.driver_reimbursable and new.shipment_assignment_id is null then
    raise exception 'A driver-reimbursable expense requires a shipment assignment.';
  end if;
  if new.shipment_assignment_id is not null and not exists (
    select 1 from public.shipment_driver_assignments a
    where a.id = new.shipment_assignment_id
      and a.shipment_id = new.shipment_id
      and a.organization_id = new.organization_id
      and a.deleted_at is null
  ) then
    raise exception 'Expense assignment does not match the shipment and organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_shipment_expense_treatment_trigger on public.shipment_expenses;
create trigger validate_shipment_expense_treatment_trigger
before insert or update on public.shipment_expenses
for each row execute function public.validate_shipment_expense_treatment();

create or replace function public.prevent_legacy_financial_writes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_table_name = 'shipments' then
    if tg_op = 'INSERT' and (
      coalesce(new.advance, 0) <> 0 or coalesce(new.gate_pass, 0) <> 0 or
      coalesce(new.fashah, 0) <> 0 or coalesce(new.naql, 0) <> 0
    ) then
      raise exception 'Legacy shipment advance/expense columns are read-only. Use payment and expense ledgers.';
    end if;
    if tg_op = 'UPDATE' and (
      new.advance is distinct from old.advance or new.gate_pass is distinct from old.gate_pass or
      new.fashah is distinct from old.fashah or new.naql is distinct from old.naql
    ) and not (
      coalesce(new.advance, 0) = 0 and coalesce(new.gate_pass, 0) = 0 and
      coalesce(new.fashah, 0) = 0 and coalesce(new.naql, 0) = 0
    ) then
      raise exception 'Legacy shipment advance/expense columns are read-only. Use payment and expense ledgers.';
    end if;
  elsif tg_table_name = 'shipment_driver_assignments' then
    if tg_op = 'INSERT' and coalesce(new.advance_paid, 0) <> 0 then
      raise exception 'Assignment advance_paid is read-only. Use driver_payments.';
    end if;
    if tg_op = 'UPDATE' and new.advance_paid is distinct from old.advance_paid and coalesce(new.advance_paid, 0) <> 0 then
      raise exception 'Assignment advance_paid is read-only. Use driver_payments.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_legacy_shipment_financial_writes on public.shipments;
create trigger prevent_legacy_shipment_financial_writes
before insert or update on public.shipments
for each row execute function public.prevent_legacy_financial_writes();

drop trigger if exists prevent_legacy_assignment_advance_writes on public.shipment_driver_assignments;
create trigger prevent_legacy_assignment_advance_writes
before insert or update on public.shipment_driver_assignments
for each row execute function public.prevent_legacy_financial_writes();

-- ---------------------------------------------------------------------------
-- Validation helper: references must belong to the workflow organization.
-- ---------------------------------------------------------------------------

create or replace function public.assert_org_reference(
  p_table regclass,
  p_id uuid,
  p_organization_id uuid,
  p_label text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_matches boolean;
begin
  if p_id is null then
    return;
  end if;
  execute format(
    'select exists(select 1 from %s where id = $1 and organization_id = $2 and deleted_at is null)',
    p_table
  ) into v_matches using p_id, p_organization_id;
  if not v_matches then
    raise exception '% does not belong to the active organization or is inactive.', p_label;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic shipment + assignment + initial advance workflow.
-- ---------------------------------------------------------------------------

create or replace function public.save_shipment_with_assignments(
  p_organization_id uuid,
  p_shipment_id uuid,
  p_shipment jsonb,
  p_assignments jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shipment_id uuid;
  v_existing public.shipments%rowtype;
  v_old_values jsonb;
  v_assignment jsonb;
  v_assignment_id uuid;
  v_assignment_existed boolean;
  v_keep_assignment_ids uuid[] := '{}';
  v_driver_id uuid;
  v_vehicle_id uuid;
  v_truck_type_id uuid;
  v_client_id uuid;
  v_initial_advance numeric(12,2);
  v_driver_rate numeric(12,2);
  v_primary_driver_id uuid;
  v_primary_vehicle_id uuid;
  v_primary_truck_type_id uuid;
  v_status text;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'manager', 'dispatcher']) then
    raise exception 'You do not have permission to save shipments for this organization.';
  end if;
  if jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Assignments must be a JSON array.';
  end if;
  if nullif(trim(p_shipment->>'shipment_date'), '') is null then
    raise exception 'Shipment date is required.';
  end if;
  if nullif(trim(p_shipment->>'loading_point'), '') is null or nullif(trim(p_shipment->>'destination'), '') is null then
    raise exception 'Loading point and destination are required.';
  end if;
  if coalesce((p_shipment->>'company_rate')::numeric, 0) < 0 then
    raise exception 'Company rate cannot be negative.';
  end if;

  if p_shipment_id is null and p_idempotency_key is not null then
    select id into v_shipment_id
    from public.shipments
    where organization_id = p_organization_id
      and workflow_key = p_idempotency_key
      and deleted_at is null;
    if v_shipment_id is not null then
      return v_shipment_id;
    end if;
  end if;

  v_client_id := nullif(p_shipment->>'client_id', '')::uuid;
  v_vehicle_id := nullif(p_shipment->>'vehicle_id', '')::uuid;
  v_truck_type_id := nullif(p_shipment->>'truck_type_id', '')::uuid;
  v_driver_id := nullif(p_shipment->>'driver_id', '')::uuid;
  perform public.assert_org_reference('public.clients', v_client_id, p_organization_id, 'Client');
  perform public.assert_org_reference('public.vehicles', v_vehicle_id, p_organization_id, 'Vehicle');
  perform public.assert_org_reference('public.truck_types', v_truck_type_id, p_organization_id, 'Truck type');
  perform public.assert_org_reference('public.drivers', v_driver_id, p_organization_id, 'Driver');

  v_status := coalesce(nullif(p_shipment->>'status', ''), 'pending');
  if v_status not in ('pending', 'in_transit', 'delivered', 'completed', 'cancelled') then
    raise exception 'Invalid shipment status.';
  end if;

  if p_shipment_id is null then
    insert into public.shipments (
      organization_id, shipment_no, invoice_reference, shipment_date, client_id,
      driver_id, vehicle_id, truck_type_id, loading_point, destination,
      company_rate, driver_rate, status, remarks, advance, gate_pass, fashah, naql,
      workflow_key, created_by, updated_by
    ) values (
      p_organization_id,
      nullif(trim(p_shipment->>'shipment_no'), ''),
      nullif(trim(p_shipment->>'customer_reference'), ''),
      (p_shipment->>'shipment_date')::date,
      v_client_id, v_driver_id, v_vehicle_id, v_truck_type_id,
      trim(p_shipment->>'loading_point'), trim(p_shipment->>'destination'),
      coalesce((p_shipment->>'company_rate')::numeric, 0), 0,
      v_status, nullif(p_shipment->>'remarks', ''),
      0, 0, 0, 0, p_idempotency_key, auth.uid(), auth.uid()
    ) returning id into v_shipment_id;
    v_old_values := null;
  else
    select * into v_existing
    from public.shipments
    where id = p_shipment_id
      and organization_id = p_organization_id
      and deleted_at is null
    for update;
    if not found then
      raise exception 'Shipment not found in the active organization.';
    end if;
    v_shipment_id := p_shipment_id;
    v_old_values := to_jsonb(v_existing);
    update public.shipments set
      shipment_no = coalesce(nullif(trim(p_shipment->>'shipment_no'), ''), shipment_no),
      invoice_reference = nullif(trim(p_shipment->>'customer_reference'), ''),
      shipment_date = (p_shipment->>'shipment_date')::date,
      client_id = v_client_id,
      driver_id = v_driver_id,
      vehicle_id = v_vehicle_id,
      truck_type_id = v_truck_type_id,
      loading_point = trim(p_shipment->>'loading_point'),
      destination = trim(p_shipment->>'destination'),
      company_rate = coalesce((p_shipment->>'company_rate')::numeric, 0),
      status = v_status,
      remarks = nullif(p_shipment->>'remarks', ''),
      advance = 0,
      gate_pass = 0,
      fashah = 0,
      naql = 0,
      updated_by = auth.uid()
    where id = v_shipment_id;
  end if;

  for v_assignment in select value from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  loop
    v_assignment_id := nullif(v_assignment->>'id', '')::uuid;
    v_driver_id := nullif(v_assignment->>'driver_id', '')::uuid;
    v_vehicle_id := nullif(v_assignment->>'vehicle_id', '')::uuid;
    v_truck_type_id := nullif(v_assignment->>'truck_type_id', '')::uuid;
    v_driver_rate := coalesce((v_assignment->>'driver_rate')::numeric, 0);
    v_initial_advance := coalesce(
      nullif(v_assignment->>'initial_advance', '')::numeric,
      nullif(v_assignment->>'advance_paid', '')::numeric,
      0
    );
    if v_driver_rate < 0 or v_initial_advance < 0 then
      raise exception 'Driver rate and advance cannot be negative.';
    end if;
    perform public.assert_org_reference('public.drivers', v_driver_id, p_organization_id, 'Assignment driver');
    perform public.assert_org_reference('public.vehicles', v_vehicle_id, p_organization_id, 'Assignment vehicle');
    perform public.assert_org_reference('public.truck_types', v_truck_type_id, p_organization_id, 'Assignment truck type');

    v_assignment_existed := false;
    if v_assignment_id is not null then
      select exists(
        select 1 from public.shipment_driver_assignments
        where id = v_assignment_id and shipment_id = v_shipment_id and organization_id = p_organization_id
      ) into v_assignment_existed;
    end if;

    if v_assignment_existed then
      update public.shipment_driver_assignments set
        driver_id = v_driver_id,
        vehicle_id = v_vehicle_id,
        truck_type_id = v_truck_type_id,
        leg_order = greatest(coalesce((v_assignment->>'leg_order')::integer, 1), 1),
        from_location = nullif(v_assignment->>'from_location', ''),
        to_location = nullif(v_assignment->>'to_location', ''),
        driver_rate = v_driver_rate,
        advance_paid = 0,
        notes = nullif(v_assignment->>'notes', ''),
        deleted_at = null,
        updated_at = now()
      where id = v_assignment_id;
    else
      insert into public.shipment_driver_assignments (
        organization_id, shipment_id, driver_id, vehicle_id, truck_type_id,
        leg_order, from_location, to_location, driver_rate, advance_paid, notes
      ) values (
        p_organization_id, v_shipment_id, v_driver_id, v_vehicle_id, v_truck_type_id,
        greatest(coalesce((v_assignment->>'leg_order')::integer, 1), 1),
        nullif(v_assignment->>'from_location', ''), nullif(v_assignment->>'to_location', ''),
        v_driver_rate, 0, nullif(v_assignment->>'notes', '')
      ) returning id into v_assignment_id;
    end if;

    v_keep_assignment_ids := array_append(v_keep_assignment_ids, v_assignment_id);

    if not v_assignment_existed and v_initial_advance > 0 then
      if v_driver_id is null then
        raise exception 'An initial advance requires a linked driver.';
      end if;
      if v_initial_advance > v_driver_rate then
        raise exception 'Initial advance cannot exceed the assignment driver rate.';
      end if;
      insert into public.driver_payments (
        organization_id, driver_id, shipment_id, shipment_assignment_id,
        amount, direction, payment_type, payment_date, idempotency_key,
        notes, created_by, updated_by
      ) values (
        p_organization_id, v_driver_id, v_shipment_id, v_assignment_id,
        v_initial_advance, 1, 'advance', (p_shipment->>'shipment_date')::date,
        'initial-advance-' || v_shipment_id::text || '-' || v_assignment_id::text,
        'Initial advance recorded with shipment assignment', auth.uid(), auth.uid()
      ) on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing;
    end if;
  end loop;

  update public.shipment_driver_assignments
  set deleted_at = now(), updated_at = now()
  where shipment_id = v_shipment_id
    and organization_id = p_organization_id
    and deleted_at is null
    and not (id = any(v_keep_assignment_ids));

  select
    coalesce(sum(driver_rate), 0),
    (array_agg(driver_id order by leg_order))[1],
    (array_agg(vehicle_id order by leg_order))[1],
    (array_agg(truck_type_id order by leg_order))[1]
  into v_driver_rate, v_primary_driver_id, v_primary_vehicle_id, v_primary_truck_type_id
  from public.shipment_driver_assignments
  where shipment_id = v_shipment_id and deleted_at is null;

  update public.shipments set
    driver_rate = coalesce(v_driver_rate, 0),
    driver_id = v_primary_driver_id,
    vehicle_id = v_primary_vehicle_id,
    truck_type_id = v_primary_truck_type_id,
    updated_by = auth.uid()
  where id = v_shipment_id;

  insert into public.audit_logs (
    organization_id, user_id, entity_type, entity_id, action, old_values, new_values
  ) values (
    p_organization_id, auth.uid(), 'shipment', v_shipment_id,
    case when p_shipment_id is null then 'create' else 'update' end,
    v_old_values,
    (select to_jsonb(s) from public.shipments s where s.id = v_shipment_id)
  );

  return v_shipment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic invoice number, snapshot, header, and line-item generation.
-- ---------------------------------------------------------------------------

create or replace function public.generate_invoice_for_shipment(
  p_organization_id uuid,
  p_shipment_id uuid,
  p_regenerate_draft boolean default false,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shipment public.shipments%rowtype;
  v_settings public.settings%rowtype;
  v_invoice public.invoices%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_client_snapshot jsonb;
  v_assignment_snapshot jsonb;
  v_shipment_snapshot jsonb;
  v_subtotal numeric(12,2);
  v_expense_total numeric(12,2);
  v_total numeric(12,2);
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'You do not have permission to generate invoices.';
  end if;

  select * into v_shipment
  from public.shipments
  where id = p_shipment_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Shipment not found.'; end if;
  if v_shipment.status = 'cancelled' then raise exception 'A cancelled shipment cannot be invoiced.'; end if;

  select * into v_invoice
  from public.invoices
  where organization_id = p_organization_id
    and shipment_id = p_shipment_id
    and deleted_at is null
    and status <> 'cancelled'
  order by created_at desc
  limit 1
  for update;

  if found and (v_invoice.status <> 'draft' or not p_regenerate_draft) then
    return v_invoice.id;
  end if;

  insert into public.settings(organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select * into v_settings
  from public.settings
  where organization_id = p_organization_id
  for update;

  if v_invoice.id is null then
    loop
      v_invoice_number := case
        when nullif(trim(v_settings.invoice_prefix), '') is null then v_settings.next_invoice_number::text
        else upper(trim(v_settings.invoice_prefix)) || '-' || lpad(v_settings.next_invoice_number::text, 4, '0')
      end;
      exit when not exists (
        select 1 from public.invoices
        where organization_id = p_organization_id and invoice_number = v_invoice_number
      );
      v_settings.next_invoice_number := v_settings.next_invoice_number + 1;
    end loop;
    update public.settings
    set next_invoice_number = v_settings.next_invoice_number + 1
    where id = v_settings.id;
  end if;

  select coalesce(jsonb_build_object(
    'id', c.id, 'name', c.name, 'contactPerson', c.contact_person,
    'phone', c.phone, 'email', c.email, 'address', c.address
  ), '{}'::jsonb)
  into v_client_snapshot
  from public.clients c
  where c.id = v_shipment.client_id and c.organization_id = p_organization_id;
  v_client_snapshot := coalesce(v_client_snapshot, '{}'::jsonb);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'driverId', a.driver_id,
      'driverName', d.name,
      'vehicleId', a.vehicle_id,
      'vehicleNo', v.vehicle_number,
      'vehicleNumber', v.vehicle_number,
      'truckTypeId', a.truck_type_id,
      'truckType', t.name,
      'legOrder', a.leg_order,
      'fromLocation', a.from_location,
      'toLocation', a.to_location,
      'driverRate', a.driver_rate
    ) order by a.leg_order
  ), '[]'::jsonb)
  into v_assignment_snapshot
  from public.shipment_driver_assignments a
  left join public.drivers d on d.id = a.driver_id
  left join public.vehicles v on v.id = a.vehicle_id
  left join public.truck_types t on t.id = a.truck_type_id
  where a.organization_id = p_organization_id
    and a.shipment_id = p_shipment_id
    and a.deleted_at is null;

  v_shipment_snapshot := jsonb_build_object(
    'id', v_shipment.id,
    'shipmentNo', v_shipment.shipment_no,
    'customerReference', v_shipment.invoice_reference,
    'date', v_shipment.shipment_date,
    'loadingPoint', v_shipment.loading_point,
    'destination', v_shipment.destination,
    'companyRate', v_shipment.company_rate,
    'status', v_shipment.status,
    'assignments', v_assignment_snapshot
  );

  if v_invoice.id is null then
    insert into public.invoices (
      organization_id, invoice_number, invoice_prefix, shipment_id, client_id,
      issue_date, due_date, status, client_snapshot, shipment_snapshot,
      subtotal, expense_total, total_amount, notes, idempotency_key,
      created_by, updated_by
    ) values (
      p_organization_id, v_invoice_number, v_settings.invoice_prefix,
      v_shipment.id, v_shipment.client_id, current_date,
      current_date + v_settings.invoice_due_days, 'draft',
      v_client_snapshot, v_shipment_snapshot, 0, 0, 0,
      coalesce(v_settings.invoice_footer_notes, v_shipment.remarks),
      p_idempotency_key, auth.uid(), auth.uid()
    ) returning id into v_invoice_id;
  else
    v_invoice_id := v_invoice.id;
    delete from public.invoice_items where invoice_id = v_invoice_id and organization_id = p_organization_id;
    update public.invoices set
      client_id = v_shipment.client_id,
      issue_date = current_date,
      due_date = current_date + v_settings.invoice_due_days,
      client_snapshot = v_client_snapshot,
      shipment_snapshot = v_shipment_snapshot,
      notes = coalesce(v_settings.invoice_footer_notes, v_shipment.remarks),
      updated_by = auth.uid()
    where id = v_invoice_id;
  end if;

  insert into public.invoice_items (
    organization_id, invoice_id, item_type, description, quantity, unit_price, amount, snapshot
  ) values (
    p_organization_id, v_invoice_id, 'transport',
    'TRIP FROM: ' || v_shipment.loading_point || ' TO ' || v_shipment.destination,
    1, v_shipment.company_rate, v_shipment.company_rate,
    jsonb_build_object('shipmentId', v_shipment.id, 'shipmentNo', v_shipment.shipment_no, 'assignments', v_assignment_snapshot)
  );

  insert into public.invoice_items (
    organization_id, invoice_id, item_type, description, quantity, unit_price, amount, snapshot
  )
  select
    p_organization_id, v_invoice_id, 'expense', replace(e.category, '_', ' '),
    1, coalesce(e.client_bill_amount, e.amount), coalesce(e.client_bill_amount, e.amount),
    jsonb_build_object('expenseId', e.id, 'category', e.category)
  from public.shipment_expenses e
  where e.organization_id = p_organization_id
    and e.shipment_id = p_shipment_id
    and e.deleted_at is null
    and e.approved = true
    and e.client_billable = true
    and e.included_in_invoice = true;

  select
    coalesce(sum(amount) filter (where item_type <> 'expense'), 0),
    coalesce(sum(amount) filter (where item_type = 'expense'), 0),
    coalesce(sum(amount), 0)
  into v_subtotal, v_expense_total, v_total
  from public.invoice_items
  where invoice_id = v_invoice_id and organization_id = p_organization_id;

  update public.invoices set
    subtotal = v_subtotal,
    expense_total = v_expense_total,
    total_amount = v_total,
    updated_by = auth.uid()
  where id = v_invoice_id;

  insert into public.audit_logs (
    organization_id, user_id, entity_type, entity_id, action, old_values, new_values
  ) values (
    p_organization_id, auth.uid(), 'invoice', v_invoice_id, 'invoice_generated',
    case when v_invoice.id is null then null else to_jsonb(v_invoice) end,
    (select to_jsonb(i) from public.invoices i where i.id = v_invoice_id)
  );
  return v_invoice_id;
end;
$$;

create or replace function public.transition_shipment_status(
  p_organization_id uuid,
  p_shipment_id uuid,
  p_status text,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shipment public.shipments%rowtype;
  v_allowed boolean := false;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'manager', 'dispatcher']) then
    raise exception 'You do not have permission to change shipment status.';
  end if;
  select * into v_shipment from public.shipments
  where id = p_shipment_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Shipment not found.'; end if;
  if p_status = v_shipment.status then return p_shipment_id; end if;
  v_allowed :=
    (v_shipment.status = 'pending' and p_status in ('in_transit', 'cancelled')) or
    (v_shipment.status = 'in_transit' and p_status in ('delivered', 'cancelled')) or
    (v_shipment.status = 'delivered' and p_status in ('completed', 'cancelled'));
  if not v_allowed then
    raise exception 'Invalid shipment transition from % to %.', v_shipment.status, p_status;
  end if;
  if p_status = 'cancelled' and nullif(trim(p_reason), '') is null then
    raise exception 'A cancellation reason is required.';
  end if;
  update public.shipments set
    status = p_status,
    remarks = case when p_status = 'cancelled'
      then concat_ws(E'\n', remarks, 'CANCELLED: ' || trim(p_reason))
      else remarks end,
    updated_by = auth.uid()
  where id = p_shipment_id;
  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    p_organization_id, auth.uid(), 'shipment', p_shipment_id, 'shipment_transitioned',
    to_jsonb(v_shipment), (select to_jsonb(s) from public.shipments s where s.id = p_shipment_id)
  );
  return p_shipment_id;
end;
$$;

create or replace function public.transition_invoice_lifecycle(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_total numeric(12,2);
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'You do not have permission to change invoice lifecycle.';
  end if;
  if p_status not in ('draft', 'sent', 'cancelled') then
    raise exception 'Payment and overdue states are derived; allowed lifecycle states are draft, sent, and cancelled.';
  end if;
  select * into v_invoice from public.invoices
  where id = p_invoice_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Invoice not found.'; end if;
  select coalesce(sum(amount * direction), 0) into v_payment_total
  from public.client_payments
  where invoice_id = p_invoice_id and organization_id = p_organization_id and deleted_at is null;
  if p_status = 'cancelled' and v_payment_total <> 0 then
    raise exception 'Reverse allocated payments before cancelling this invoice.';
  end if;
  if v_invoice.status = 'cancelled' and p_status <> 'cancelled' then
    raise exception 'A cancelled invoice cannot be reopened; generate a replacement.';
  end if;
  update public.invoices set
    status = p_status,
    issued_at = case when p_status = 'sent' then coalesce(issued_at, now()) else issued_at end,
    sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
    voided_at = case when p_status = 'cancelled' then coalesce(voided_at, now()) else voided_at end,
    updated_by = auth.uid()
  where id = p_invoice_id;
  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    p_organization_id, auth.uid(), 'invoice', p_invoice_id, 'invoice_transitioned',
    to_jsonb(v_invoice), (select to_jsonb(i) from public.invoices i where i.id = p_invoice_id)
  );
  return p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validated, idempotent payment posting and immutable reversal workflows.
-- ---------------------------------------------------------------------------

create or replace function public.record_client_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_client_id uuid,
  p_shipment_id uuid,
  p_amount numeric,
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
  v_invoice public.invoices%rowtype;
  v_paid numeric(12,2);
  v_payment_id uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'You do not have permission to record client payments.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_idempotency_key is not null then
    select id into v_payment_id from public.client_payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key and deleted_at is null;
    if v_payment_id is not null then return v_payment_id; end if;
  end if;
  select * into v_invoice from public.invoices
  where id = p_invoice_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Cannot post a payment to a cancelled invoice.'; end if;
  if v_invoice.client_id is distinct from p_client_id then raise exception 'Payment client does not match the invoice client.'; end if;
  if p_shipment_id is not null and v_invoice.shipment_id is distinct from p_shipment_id then
    raise exception 'Payment shipment does not match the invoice shipment.';
  end if;
  select coalesce(sum(amount * direction), 0) into v_paid
  from public.client_payments
  where invoice_id = p_invoice_id and organization_id = p_organization_id and deleted_at is null;
  if p_amount > v_invoice.total_amount - v_paid then
    raise exception 'Payment exceeds the outstanding invoice balance of %.', v_invoice.total_amount - v_paid;
  end if;
  insert into public.client_payments (
    organization_id, invoice_id, client_id, shipment_id, amount, direction,
    payment_date, payment_method, reference_no, notes, idempotency_key,
    created_by, updated_by
  ) values (
    p_organization_id, p_invoice_id, p_client_id, coalesce(p_shipment_id, v_invoice.shipment_id),
    p_amount, 1, coalesce(p_payment_date, current_date), nullif(p_payment_method, ''),
    nullif(p_reference_no, ''), nullif(p_notes, ''), p_idempotency_key,
    auth.uid(), auth.uid()
  ) returning id into v_payment_id;
  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, new_values)
  values (
    p_organization_id, auth.uid(), 'client_payment', v_payment_id, 'payment_recorded',
    (select to_jsonb(p) from public.client_payments p where p.id = v_payment_id)
  );
  return v_payment_id;
end;
$$;

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
    select v_payable + coalesce(sum(amount), 0) into v_payable
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
    select v_payable + coalesce(sum(e.amount), 0) into v_payable
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

create or replace function public.reverse_client_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_original public.client_payments%rowtype;
  v_reversal_id uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then raise exception 'Not authorized.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A reversal reason is required.'; end if;
  select * into v_original from public.client_payments
  where id = p_payment_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_original.direction <> 1 then raise exception 'A reversal entry cannot be reversed.'; end if;
  select id into v_reversal_id from public.client_payments where reversal_of_id = p_payment_id and deleted_at is null;
  if v_reversal_id is not null then return v_reversal_id; end if;
  insert into public.client_payments (
    organization_id, invoice_id, client_id, shipment_id, amount, direction,
    reversal_of_id, payment_date, payment_method, reference_no, notes,
    idempotency_key, created_by, updated_by
  ) values (
    p_organization_id, v_original.invoice_id, v_original.client_id, v_original.shipment_id,
    v_original.amount, -1, v_original.id, current_date, v_original.payment_method,
    v_original.reference_no, 'REVERSAL: ' || trim(p_reason),
    'reverse-client-' || v_original.id::text, auth.uid(), auth.uid()
  ) returning id into v_reversal_id;
  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
  values (p_organization_id, auth.uid(), 'client_payment', p_payment_id, 'payment_reversed', to_jsonb(v_original), jsonb_build_object('reversalId', v_reversal_id, 'reason', trim(p_reason)));
  return v_reversal_id;
end;
$$;

create or replace function public.reverse_driver_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_original public.driver_payments%rowtype;
  v_reversal_id uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then raise exception 'Not authorized.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A reversal reason is required.'; end if;
  select * into v_original from public.driver_payments
  where id = p_payment_id and organization_id = p_organization_id and deleted_at is null
  for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_original.direction <> 1 then raise exception 'A reversal entry cannot be reversed.'; end if;
  select id into v_reversal_id from public.driver_payments where reversal_of_id = p_payment_id and deleted_at is null;
  if v_reversal_id is not null then return v_reversal_id; end if;
  insert into public.driver_payments (
    organization_id, driver_id, shipment_id, shipment_assignment_id,
    amount, direction, payment_type, reversal_of_id, payment_date,
    payment_method, reference_no, notes, idempotency_key, created_by, updated_by
  ) values (
    p_organization_id, v_original.driver_id, v_original.shipment_id, v_original.shipment_assignment_id,
    v_original.amount, -1, 'adjustment', v_original.id, current_date,
    v_original.payment_method, v_original.reference_no, 'REVERSAL: ' || trim(p_reason),
    'reverse-driver-' || v_original.id::text, auth.uid(), auth.uid()
  ) returning id into v_reversal_id;
  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
  values (p_organization_id, auth.uid(), 'driver_payment', p_payment_id, 'payment_reversed', to_jsonb(v_original), jsonb_build_object('reversalId', v_reversal_id, 'reason', trim(p_reason)));
  return v_reversal_id;
end;
$$;

revoke all on function public.assert_org_reference(regclass, uuid, uuid, text) from public;
revoke all on function public.save_shipment_with_assignments(uuid, uuid, jsonb, jsonb, text) from public;
revoke all on function public.generate_invoice_for_shipment(uuid, uuid, boolean, text) from public;
revoke all on function public.transition_invoice_lifecycle(uuid, uuid, text) from public;
revoke all on function public.transition_shipment_status(uuid, uuid, text, text) from public;
revoke all on function public.record_client_payment(uuid, uuid, uuid, uuid, numeric, date, text, text, text, text) from public;
revoke all on function public.record_driver_payment(uuid, uuid, uuid, uuid, numeric, text, date, text, text, text, text) from public;
revoke all on function public.reverse_client_payment(uuid, uuid, text) from public;
revoke all on function public.reverse_driver_payment(uuid, uuid, text) from public;

grant execute on function public.save_shipment_with_assignments(uuid, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.generate_invoice_for_shipment(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.transition_invoice_lifecycle(uuid, uuid, text) to authenticated;
grant execute on function public.transition_shipment_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_client_payment(uuid, uuid, uuid, uuid, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.record_driver_payment(uuid, uuid, uuid, uuid, numeric, text, date, text, text, text, text) to authenticated;
grant execute on function public.reverse_client_payment(uuid, uuid, text) to authenticated;
grant execute on function public.reverse_driver_payment(uuid, uuid, text) to authenticated;
