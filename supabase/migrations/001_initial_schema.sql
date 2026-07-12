-- TransportFlow initial SaaS schema
-- Phase 3 only: schema planning/migration. No frontend integration is included here.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core SaaS identity and tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active'
    check (status in ('active', 'trialing', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('owner', 'admin', 'manager', 'accountant', 'dispatcher', 'viewer')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'disabled', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_org_user_unique unique (organization_id, user_id)
);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- Master records
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  phone text,
  cnic text,
  license_number text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create table public.truck_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_number text not null,
  truck_type_id uuid references public.truck_types(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'maintenance', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  constraint vehicles_org_vehicle_number_unique unique (organization_id, vehicle_number)
);

-- ---------------------------------------------------------------------------
-- Shipments and expenses
-- ---------------------------------------------------------------------------

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_no text,
  invoice_reference text,
  shipment_date date not null,
  client_id uuid references public.clients(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  truck_type_id uuid references public.truck_types(id) on delete set null,
  loading_point text not null,
  destination text not null,
  company_rate numeric(12,2) not null default 0 check (company_rate >= 0),
  driver_rate numeric(12,2) not null default 0 check (driver_rate >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'in_transit', 'delivered', 'completed', 'cancelled')),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create table public.shipment_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  category text not null
    check (category in ('gate_pass', 'fashah', 'naql', 'fuel', 'toll', 'loading_unloading', 'repair', 'parking', 'food', 'waiting_charges', 'other')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid_by text not null default 'company'
    check (paid_by in ('company', 'driver', 'client', 'other')),
  client_billable boolean not null default true,
  driver_reimbursable boolean not null default false,
  approved boolean not null default false,
  included_in_invoice boolean not null default true,
  expense_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create table public.expense_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  expense_id uuid references public.shipment_expenses(id) on delete set null,
  storage_provider text not null default 'r2'
    check (storage_provider in ('r2')),
  bucket_name text not null,
  object_key text not null,
  file_name text not null,
  file_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  compressed boolean not null default true,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint expense_attachments_object_unique unique (organization_id, storage_provider, bucket_name, object_key)
);

-- Do not store public file URLs as source of truth. Store object_key and generate signed URLs later.

-- ---------------------------------------------------------------------------
-- Invoices and ledger payments
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_number text not null,
  invoice_prefix text,
  shipment_id uuid references public.shipments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled')),
  client_snapshot jsonb not null default '{}'::jsonb,
  shipment_snapshot jsonb not null default '{}'::jsonb,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  expense_total numeric(12,2) not null default 0 check (expense_total >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  constraint invoices_org_invoice_number_unique unique (organization_id, invoice_number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_type text not null default 'transport'
    check (item_type in ('transport', 'expense', 'adjustment', 'other')),
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.client_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  shipment_id uuid references public.shipments(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_date date not null default current_date,
  payment_method text,
  reference_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create table public.driver_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  shipment_id uuid references public.shipments(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_type text not null
    check (payment_type in ('advance', 'settlement', 'reimbursement', 'adjustment')),
  payment_date date not null default current_date,
  payment_method text,
  reference_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Settings and audit
-- ---------------------------------------------------------------------------

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_prefix text not null default 'TF',
  next_invoice_number integer not null default 1 check (next_invoice_number > 0),
  default_currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_organization_unique unique (organization_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null
    check (action in ('create', 'update', 'delete', 'restore', 'login', 'export', 'invoice_generated', 'payment_recorded')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_organization_members_updated_at before update on public.organization_members for each row execute function public.set_updated_at();
create trigger set_clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger set_drivers_updated_at before update on public.drivers for each row execute function public.set_updated_at();
create trigger set_vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger set_truck_types_updated_at before update on public.truck_types for each row execute function public.set_updated_at();
create trigger set_shipments_updated_at before update on public.shipments for each row execute function public.set_updated_at();
create trigger set_shipment_expenses_updated_at before update on public.shipment_expenses for each row execute function public.set_updated_at();
create trigger set_invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger set_client_payments_updated_at before update on public.client_payments for each row execute function public.set_updated_at();
create trigger set_driver_payments_updated_at before update on public.driver_payments for each row execute function public.set_updated_at();
create trigger set_settings_updated_at before update on public.settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes for common SaaS query paths
-- ---------------------------------------------------------------------------

create index organizations_deleted_at_idx on public.organizations(deleted_at);
create index organization_members_organization_id_idx on public.organization_members(organization_id);
create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_members_role_idx on public.organization_members(role);
create index organization_members_status_idx on public.organization_members(status);

create index clients_organization_id_idx on public.clients(organization_id);
create index clients_deleted_at_idx on public.clients(deleted_at);
create index clients_status_idx on public.clients(status);

create index drivers_organization_id_idx on public.drivers(organization_id);
create index drivers_deleted_at_idx on public.drivers(deleted_at);
create index drivers_status_idx on public.drivers(status);

create index vehicles_organization_id_idx on public.vehicles(organization_id);
create index vehicles_driver_id_idx on public.vehicles(driver_id);
create index vehicles_truck_type_id_idx on public.vehicles(truck_type_id);
create index vehicles_deleted_at_idx on public.vehicles(deleted_at);
create index vehicles_status_idx on public.vehicles(status);

create index truck_types_organization_id_idx on public.truck_types(organization_id);
create index truck_types_deleted_at_idx on public.truck_types(deleted_at);
create index truck_types_status_idx on public.truck_types(status);

create index shipments_organization_id_idx on public.shipments(organization_id);
create index shipments_shipment_date_idx on public.shipments(shipment_date);
create index shipments_client_id_idx on public.shipments(client_id);
create index shipments_driver_id_idx on public.shipments(driver_id);
create index shipments_vehicle_id_idx on public.shipments(vehicle_id);
create index shipments_status_idx on public.shipments(status);
create index shipments_invoice_reference_idx on public.shipments(invoice_reference);
create index shipments_deleted_at_idx on public.shipments(deleted_at);

create index shipment_expenses_organization_id_idx on public.shipment_expenses(organization_id);
create index shipment_expenses_shipment_id_idx on public.shipment_expenses(shipment_id);
create index shipment_expenses_category_idx on public.shipment_expenses(category);
create index shipment_expenses_deleted_at_idx on public.shipment_expenses(deleted_at);

create index expense_attachments_organization_id_idx on public.expense_attachments(organization_id);
create index expense_attachments_shipment_id_idx on public.expense_attachments(shipment_id);
create index expense_attachments_expense_id_idx on public.expense_attachments(expense_id);
create index expense_attachments_deleted_at_idx on public.expense_attachments(deleted_at);

create index invoices_organization_id_idx on public.invoices(organization_id);
create index invoices_invoice_number_idx on public.invoices(invoice_number);
create index invoices_shipment_id_idx on public.invoices(shipment_id);
create index invoices_client_id_idx on public.invoices(client_id);
create index invoices_status_idx on public.invoices(status);
create index invoices_deleted_at_idx on public.invoices(deleted_at);

create index invoice_items_organization_id_idx on public.invoice_items(organization_id);
create index invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

create index client_payments_organization_id_idx on public.client_payments(organization_id);
create index client_payments_invoice_id_idx on public.client_payments(invoice_id);
create index client_payments_client_id_idx on public.client_payments(client_id);
create index client_payments_shipment_id_idx on public.client_payments(shipment_id);
create index client_payments_deleted_at_idx on public.client_payments(deleted_at);

create index driver_payments_organization_id_idx on public.driver_payments(organization_id);
create index driver_payments_driver_id_idx on public.driver_payments(driver_id);
create index driver_payments_shipment_id_idx on public.driver_payments(shipment_id);
create index driver_payments_deleted_at_idx on public.driver_payments(deleted_at);

create index settings_organization_id_idx on public.settings(organization_id);

create index audit_logs_organization_id_idx on public.audit_logs(organization_id);
create index audit_logs_user_id_idx on public.audit_logs(user_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.truck_types enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_expenses enable row level security;
alter table public.expense_attachments enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.client_payments enable row level security;
alter table public.driver_payments enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users can manage their own profile. Broader profile lookup can be added later.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Organizations: authenticated users may create an organization. Membership creation
-- for first owner should be handled by a trusted onboarding function or service role.
create policy "organizations_select_member" on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy "organizations_insert_authenticated" on public.organizations
  for insert to authenticated
  with check (true);

create policy "organizations_update_owner_admin" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']))
  with check (public.has_org_role(id, array['owner', 'admin']));

-- Organization members: helper functions are SECURITY DEFINER to avoid recursive
-- policy checks while still enforcing active membership and role rules.
create policy "organization_members_select_member" on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));

create policy "organization_members_insert_owner_admin" on public.organization_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "organization_members_update_owner_admin" on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

-- Master records: active members can read. Viewers are read-only.
create policy "clients_select_member" on public.clients
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "clients_insert_business_roles" on public.clients
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant']));

create policy "clients_update_business_roles" on public.clients
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant']));

create policy "drivers_select_member" on public.drivers
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "drivers_insert_ops_roles" on public.drivers
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "drivers_update_ops_roles" on public.drivers
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "vehicles_select_member" on public.vehicles
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "vehicles_insert_ops_roles" on public.vehicles
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "vehicles_update_ops_roles" on public.vehicles
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "truck_types_select_member" on public.truck_types
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "truck_types_insert_ops_roles" on public.truck_types
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "truck_types_update_ops_roles" on public.truck_types
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

-- Shipments, expenses, and attachments: dispatcher roles can manage operational
-- data; accountants can also manage expense records for billing reconciliation.
create policy "shipments_select_member" on public.shipments
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "shipments_insert_ops_roles" on public.shipments
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "shipments_update_ops_roles" on public.shipments
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher']));

create policy "shipment_expenses_select_member" on public.shipment_expenses
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "shipment_expenses_insert_ops_accounting_roles" on public.shipment_expenses
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant']));

create policy "shipment_expenses_update_ops_accounting_roles" on public.shipment_expenses
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant']));

create policy "expense_attachments_select_member" on public.expense_attachments
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "expense_attachments_insert_ops_accounting_roles" on public.expense_attachments
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant']));

create policy "expense_attachments_update_ops_accounting_roles" on public.expense_attachments
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant']));

-- Invoices and payments: dispatchers are intentionally excluded.
create policy "invoices_select_finance_roles" on public.invoices
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant', 'viewer']));

create policy "invoices_insert_finance_roles" on public.invoices
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

create policy "invoices_update_finance_roles" on public.invoices
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

create policy "invoice_items_select_finance_roles" on public.invoice_items
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant', 'viewer']));

create policy "invoice_items_insert_finance_roles" on public.invoice_items
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

create policy "client_payments_select_finance_roles" on public.client_payments
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant', 'viewer']));

create policy "client_payments_insert_finance_roles" on public.client_payments
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

create policy "client_payments_update_finance_roles" on public.client_payments
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

create policy "driver_payments_select_finance_roles" on public.driver_payments
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant', 'viewer']));

create policy "driver_payments_insert_finance_roles" on public.driver_payments
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

create policy "driver_payments_update_finance_roles" on public.driver_payments
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accountant']));

-- Settings: members can read, owner/admin can update. App onboarding should
-- create the initial row.
create policy "settings_select_member" on public.settings
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "settings_insert_owner_admin" on public.settings
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "settings_update_owner_admin" on public.settings
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

-- Audit logs are append-only for application users. Owner/admin can read.
create policy "audit_logs_select_owner_admin" on public.audit_logs
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "audit_logs_insert_non_viewer_member" on public.audit_logs
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'accountant', 'dispatcher'])
    and (user_id is null or user_id = auth.uid())
  );

-- No delete policies are created for important operational/financial tables.
-- Application deletes should be modeled as updates to deleted_at.
