-- ---------------------------------------------------------------------------
-- TransportFlow Phase 1: Shipment-owned attachment metadata
-- ---------------------------------------------------------------------------
-- Attachments are always owned by a shipment. They may optionally be linked to
-- one shipment_expense for bill/receipt workflows. Keep expense_attachments for
-- backward compatibility while new upload work moves to shipment_attachments.

create table if not exists public.shipment_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  shipment_expense_id uuid references public.shipment_expenses(id) on delete set null,
  category text not null default 'other'
    check (
      category in (
        'bill',
        'receipt',
        'gate_pass',
        'fashah',
        'naql',
        'loading_slip',
        'unloading_slip',
        'proof_of_delivery',
        'invoice_support',
        'driver_document',
        'client_document',
        'other'
      )
    ),
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size > 0),
  storage_key text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shipment_attachments_storage_key_unique unique (organization_id, storage_key)
);

create index if not exists shipment_attachments_organization_id_idx on public.shipment_attachments(organization_id);
create index if not exists shipment_attachments_shipment_id_idx on public.shipment_attachments(shipment_id);
create index if not exists shipment_attachments_expense_id_idx on public.shipment_attachments(shipment_expense_id);
create index if not exists shipment_attachments_category_idx on public.shipment_attachments(category);
create index if not exists shipment_attachments_deleted_at_idx on public.shipment_attachments(deleted_at);
create index if not exists shipment_attachments_created_at_idx on public.shipment_attachments(created_at);

drop trigger if exists set_shipment_attachments_updated_at on public.shipment_attachments;
create trigger set_shipment_attachments_updated_at
  before update on public.shipment_attachments
  for each row
  execute function public.set_updated_at();

create or replace function public.validate_shipment_attachment_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.shipments s
    where s.id = new.shipment_id
      and s.organization_id = new.organization_id
      and s.deleted_at is null
  ) then
    raise exception 'Shipment attachment shipment_id must belong to organization_id';
  end if;

  if new.shipment_expense_id is not null and not exists (
    select 1
    from public.shipment_expenses e
    where e.id = new.shipment_expense_id
      and e.shipment_id = new.shipment_id
      and e.organization_id = new.organization_id
      and e.deleted_at is null
  ) then
    raise exception 'Shipment attachment expense must belong to the same shipment and organization';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_shipment_attachments_scope on public.shipment_attachments;
create trigger validate_shipment_attachments_scope
  before insert or update of organization_id, shipment_id, shipment_expense_id
  on public.shipment_attachments
  for each row
  execute function public.validate_shipment_attachment_scope();

alter table public.shipment_attachments enable row level security;

create policy "shipment_attachments_select_member" on public.shipment_attachments
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "shipment_attachments_insert_ops_accounting_roles" on public.shipment_attachments
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant'])
    and (uploaded_by is null or uploaded_by = auth.uid())
  );

create policy "shipment_attachments_update_ops_accounting_roles" on public.shipment_attachments
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant'])
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant'])
  );

comment on table public.shipment_attachments is
  'Shipment-owned private attachment metadata. R2 object URLs are not stored; storage_key is used for signed URL generation.';
