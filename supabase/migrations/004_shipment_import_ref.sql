-- ---------------------------------------------------------------------------
-- TransportFlow: idempotent shipment imports
-- ---------------------------------------------------------------------------
-- Stores the source import reference from operational CSV files. This is kept
-- separate from shipment_no and invoice_reference so imports can be re-run
-- safely without changing user-facing shipment references.

alter table public.shipments
  add column if not exists import_ref text;

create unique index if not exists shipments_org_import_ref_unique
  on public.shipments (organization_id, import_ref)
  where import_ref is not null and deleted_at is null;

create index if not exists shipments_import_ref_idx on public.shipments(import_ref);

comment on column public.shipments.import_ref is
  'External source reference used for idempotent shipment imports.';
