-- ---------------------------------------------------------------------------
-- TransportFlow: reusable shipment route/location options
-- ---------------------------------------------------------------------------
-- Stores organization-scoped loading points and destinations selected from the
-- Add Shipment form. Shipment rows still store their own text snapshot.

create table if not exists public.route_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  type text not null check (type in ('loading_point', 'destination')),
  name text not null check (length(trim(name)) > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists route_locations_org_type_name_unique
  on public.route_locations (organization_id, type, lower(trim(name)))
  where deleted_at is null;

create index if not exists route_locations_organization_id_idx on public.route_locations(organization_id);
create index if not exists route_locations_type_idx on public.route_locations(type);
create index if not exists route_locations_deleted_at_idx on public.route_locations(deleted_at);
create index if not exists route_locations_name_idx on public.route_locations(name);

drop trigger if exists set_route_locations_updated_at on public.route_locations;
create trigger set_route_locations_updated_at
  before update on public.route_locations
  for each row
  execute function public.set_updated_at();

alter table public.route_locations enable row level security;

create policy "route_locations_select_member" on public.route_locations
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "route_locations_insert_write_roles" on public.route_locations
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant'])
    and (created_by is null or created_by = auth.uid())
  );

create policy "route_locations_update_write_roles" on public.route_locations
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant'])
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'manager', 'dispatcher', 'accountant'])
  );

comment on table public.route_locations is
  'Organization-scoped reusable loading point and destination options for shipment entry.';
