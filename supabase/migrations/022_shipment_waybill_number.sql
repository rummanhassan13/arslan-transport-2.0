-- Optional waybill number per shipment, printed under the driver details on its invoice.
alter table public.shipments
  add column if not exists waybill_number text;
