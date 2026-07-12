DO $$ 
DECLARE
  constraint_name text;
BEGIN
  -- For shipment_expenses
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.shipment_expenses'::regclass
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%category%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.shipment_expenses DROP CONSTRAINT ' || constraint_name;
  END IF;

  -- For expense_attachments
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.expense_attachments'::regclass
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%category%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.expense_attachments DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;
