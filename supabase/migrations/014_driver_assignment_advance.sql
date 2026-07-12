ALTER TABLE public.shipment_driver_assignments
ADD COLUMN advance_paid numeric(12,2) not null default 0 check (advance_paid >= 0);
