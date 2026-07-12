-- Make the UI "Delete payment" operation consistent across active ledgers.
-- Payment rows remain soft-deleted for auditability; they no longer participate
-- in balances or appear in active payment queries.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (action in (
    'create', 'update', 'delete', 'restore', 'login', 'export',
    'invoice_generated', 'invoice_transitioned', 'payment_recorded',
    'payment_reversed', 'payment_voided', 'shipment_transitioned'
  ));

-- Normalize reversal pairs previously created by the payment-ledger delete UI.
-- Both rows already net to zero; soft-deleting the pair removes the stale UI
-- entries while preserving the complete database and audit history.
update public.client_payments original
set deleted_at = coalesce(reversal.created_at, now()),
    updated_at = now()
from public.client_payments reversal
where reversal.reversal_of_id = original.id
  and reversal.deleted_at is null
  and original.deleted_at is null
  and reversal.notes = 'REVERSAL: Correction requested from the payment ledger UI';

update public.client_payments reversal
set deleted_at = original.deleted_at,
    updated_at = now()
from public.client_payments original
where reversal.reversal_of_id = original.id
  and reversal.deleted_at is null
  and original.deleted_at is not null
  and reversal.notes = 'REVERSAL: Correction requested from the payment ledger UI';

update public.driver_payments original
set deleted_at = coalesce(reversal.created_at, now()),
    updated_at = now()
from public.driver_payments reversal
where reversal.reversal_of_id = original.id
  and reversal.deleted_at is null
  and original.deleted_at is null
  and reversal.notes = 'REVERSAL: Correction requested from the payment ledger UI';

update public.driver_payments reversal
set deleted_at = original.deleted_at,
    updated_at = now()
from public.driver_payments original
where reversal.reversal_of_id = original.id
  and reversal.deleted_at is null
  and original.deleted_at is not null
  and reversal.notes = 'REVERSAL: Correction requested from the payment ledger UI';

create or replace function public.void_client_payment(
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
  v_reversal_ids jsonb;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'You do not have permission to delete client payments.';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A deletion reason is required.'; end if;

  select * into v_original
  from public.client_payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'Payment not found.'; end if;
  if v_original.deleted_at is not null then return v_original.id; end if;
  if v_original.direction <> 1 then raise exception 'Delete the original payment, not its reversal entry.'; end if;

  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_reversal_ids
  from public.client_payments
  where reversal_of_id = p_payment_id
    and organization_id = p_organization_id
    and deleted_at is null;

  update public.client_payments
  set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  where organization_id = p_organization_id
    and deleted_at is null
    and (id = p_payment_id or reversal_of_id = p_payment_id);

  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    p_organization_id,
    auth.uid(),
    'client_payment',
    p_payment_id,
    'payment_voided',
    to_jsonb(v_original),
    jsonb_build_object('reason', trim(p_reason), 'voidedReversalIds', v_reversal_ids)
  );

  return p_payment_id;
end;
$$;

create or replace function public.void_driver_payment(
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
  v_reversal_ids jsonb;
begin
  if not public.has_org_role(p_organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'You do not have permission to delete driver payments.';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A deletion reason is required.'; end if;

  select * into v_original
  from public.driver_payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'Payment not found.'; end if;
  if v_original.deleted_at is not null then return v_original.id; end if;
  if v_original.direction <> 1 then raise exception 'Delete the original payment, not its reversal entry.'; end if;

  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_reversal_ids
  from public.driver_payments
  where reversal_of_id = p_payment_id
    and organization_id = p_organization_id
    and deleted_at is null;

  update public.driver_payments
  set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  where organization_id = p_organization_id
    and deleted_at is null
    and (id = p_payment_id or reversal_of_id = p_payment_id);

  insert into public.audit_logs(organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    p_organization_id,
    auth.uid(),
    'driver_payment',
    p_payment_id,
    'payment_voided',
    to_jsonb(v_original),
    jsonb_build_object(
      'reason', trim(p_reason),
      'shipmentAssignmentId', v_original.shipment_assignment_id,
      'voidedReversalIds', v_reversal_ids
    )
  );

  return p_payment_id;
end;
$$;

revoke all on function public.void_client_payment(uuid, uuid, text) from public;
revoke all on function public.void_driver_payment(uuid, uuid, text) from public;
grant execute on function public.void_client_payment(uuid, uuid, text) to authenticated;
grant execute on function public.void_driver_payment(uuid, uuid, text) to authenticated;
