-- Migration: Add remarks column to shipments if not exists
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS remarks text;
