CREATE TABLE public.shipment_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  leg_order integer not null default 1,
  from_location text,
  to_location text,
  driver_rate numeric(12,2) not null default 0 check (driver_rate >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

CREATE INDEX idx_shipment_driver_assignments_shipment_id ON public.shipment_driver_assignments(shipment_id);
