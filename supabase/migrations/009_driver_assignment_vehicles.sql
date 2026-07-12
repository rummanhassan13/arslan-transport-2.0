-- Migration: Add vehicle and truck type columns and configure RLS policies for shipment_driver_assignments

ALTER TABLE public.shipment_driver_assignments
ADD COLUMN IF NOT EXISTS vehicle_id uuid references public.vehicles(id) on delete set null,
ADD COLUMN IF NOT EXISTS truck_type_id uuid references public.truck_types(id) on delete set null;

-- Enable Row Level Security
ALTER TABLE public.shipment_driver_assignments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- 1. Select Policy: active members can read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_driver_assignments' AND policyname = 'shipment_driver_assignments_select_member') THEN
    CREATE POLICY "shipment_driver_assignments_select_member" ON public.shipment_driver_assignments
      FOR SELECT TO authenticated
      USING (public.is_org_member(organization_id));
  END IF;

  -- 2. Insert Policy: owner, admin, manager, dispatcher roles can insert
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_driver_assignments' AND policyname = 'shipment_driver_assignments_insert_ops_roles') THEN
    CREATE POLICY "shipment_driver_assignments_insert_ops_roles" ON public.shipment_driver_assignments
      FOR INSERT TO authenticated
      WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'dispatcher']));
  END IF;

  -- 3. Update Policy: owner, admin, manager, dispatcher roles can update
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_driver_assignments' AND policyname = 'shipment_driver_assignments_update_ops_roles') THEN
    CREATE POLICY "shipment_driver_assignments_update_ops_roles" ON public.shipment_driver_assignments
      FOR UPDATE TO authenticated
      USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'dispatcher']))
      WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'dispatcher']));
  END IF;

  -- 4. Delete Policy: owner, admin, manager, dispatcher roles can delete (required for re-syncing driver legs on update)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_driver_assignments' AND policyname = 'shipment_driver_assignments_delete_ops_roles') THEN
    CREATE POLICY "shipment_driver_assignments_delete_ops_roles" ON public.shipment_driver_assignments
      FOR DELETE TO authenticated
      USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'dispatcher']));
  END IF;
END $$;
