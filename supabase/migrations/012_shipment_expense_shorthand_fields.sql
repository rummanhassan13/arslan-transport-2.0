-- Migration: Add expense shorthand fields to shipments table

ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS advance numeric(12,2) not null default 0 check (advance >= 0),
ADD COLUMN IF NOT EXISTS gate_pass numeric(12,2) not null default 0 check (gate_pass >= 0),
ADD COLUMN IF NOT EXISTS fashah numeric(12,2) not null default 0 check (fashah >= 0),
ADD COLUMN IF NOT EXISTS naql numeric(12,2) not null default 0 check (naql >= 0);
