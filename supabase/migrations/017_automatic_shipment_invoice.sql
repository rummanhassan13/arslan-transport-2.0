-- Every newly created shipment must have an invoice. This workflow creates the
-- shipment, assignments, initial advances, invoice header, and transport line
-- in one database transaction. Any failure rolls the entire operation back.

create or replace function public.create_shipment_with_invoice(
  p_organization_id uuid,
  p_shipment jsonb,
  p_assignments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shipment_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_shipment public.shipments%rowtype;
  v_settings public.settings%rowtype;
  v_client_snapshot jsonb;
  v_assignment_snapshot jsonb;
  v_shipment_snapshot jsonb;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'manager', 'dispatcher']) then
    raise exception 'You do not have permission to create shipments for this organization.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'A shipment creation idempotency key is required.';
  end if;

  v_shipment_id := public.save_shipment_with_assignments(
    p_organization_id,
    null,
    p_shipment,
    p_assignments,
    p_idempotency_key
  );

  select id into v_invoice_id
  from public.invoices
  where organization_id = p_organization_id
    and shipment_id = v_shipment_id
    and deleted_at is null
    and status <> 'cancelled'
  order by created_at desc
  limit 1
  for update;

  if v_invoice_id is not null then
    return jsonb_build_object('shipment_id', v_shipment_id, 'invoice_id', v_invoice_id);
  end if;

  select * into v_shipment
  from public.shipments
  where id = v_shipment_id
    and organization_id = p_organization_id
    and deleted_at is null
  for update;
  if not found then raise exception 'Shipment could not be reloaded for invoice generation.'; end if;
  if v_shipment.status = 'cancelled' then raise exception 'A cancelled shipment cannot be invoiced.'; end if;

  insert into public.settings(organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select * into v_settings
  from public.settings
  where organization_id = p_organization_id
  for update;

  loop
    v_invoice_number := case
      when nullif(trim(v_settings.invoice_prefix), '') is null then v_settings.next_invoice_number::text
      else upper(trim(v_settings.invoice_prefix)) || '-' || lpad(v_settings.next_invoice_number::text, 4, '0')
    end;
    exit when not exists (
      select 1 from public.invoices
      where organization_id = p_organization_id
        and invoice_number = v_invoice_number
    );
    v_settings.next_invoice_number := v_settings.next_invoice_number + 1;
  end loop;

  update public.settings
  set next_invoice_number = v_settings.next_invoice_number + 1
  where id = v_settings.id;

  select coalesce(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'contactPerson', c.contact_person,
    'phone', c.phone,
    'email', c.email,
    'address', c.address
  ), '{}'::jsonb)
  into v_client_snapshot
  from public.clients c
  where c.id = v_shipment.client_id
    and c.organization_id = p_organization_id;
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
    and a.shipment_id = v_shipment_id
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

  insert into public.invoices (
    organization_id, invoice_number, invoice_prefix, shipment_id, client_id,
    issue_date, due_date, status, client_snapshot, shipment_snapshot,
    subtotal, expense_total, total_amount, notes, idempotency_key,
    created_by, updated_by
  ) values (
    p_organization_id,
    v_invoice_number,
    v_settings.invoice_prefix,
    v_shipment_id,
    v_shipment.client_id,
    current_date,
    current_date + v_settings.invoice_due_days,
    'draft',
    v_client_snapshot,
    v_shipment_snapshot,
    v_shipment.company_rate,
    0,
    v_shipment.company_rate,
    coalesce(v_settings.invoice_footer_notes, v_shipment.remarks),
    'invoice-' || v_shipment_id::text,
    auth.uid(),
    auth.uid()
  ) returning id into v_invoice_id;

  insert into public.invoice_items (
    organization_id, invoice_id, item_type, description,
    quantity, unit_price, amount, snapshot
  ) values (
    p_organization_id,
    v_invoice_id,
    'transport',
    'TRIP FROM: ' || v_shipment.loading_point || ' TO ' || v_shipment.destination,
    1,
    v_shipment.company_rate,
    v_shipment.company_rate,
    jsonb_build_object(
      'shipmentId', v_shipment.id,
      'shipmentNo', v_shipment.shipment_no,
      'assignments', v_assignment_snapshot
    )
  );

  insert into public.audit_logs(
    organization_id, user_id, entity_type, entity_id, action, new_values
  ) values (
    p_organization_id,
    auth.uid(),
    'invoice',
    v_invoice_id,
    'invoice_generated',
    jsonb_build_object(
      'invoice', (select to_jsonb(i) from public.invoices i where i.id = v_invoice_id),
      'automatic', true,
      'shipmentId', v_shipment_id
    )
  );

  return jsonb_build_object('shipment_id', v_shipment_id, 'invoice_id', v_invoice_id);
end;
$$;

revoke all on function public.create_shipment_with_invoice(uuid, jsonb, jsonb, text) from public;
grant execute on function public.create_shipment_with_invoice(uuid, jsonb, jsonb, text) to authenticated;
