-- TransportFlow pilot onboarding example
-- Do not run this file without replacing every placeholder.
-- This is intentionally not wired into an automatic seed command.

-- Step 1:
-- Create the pilot user in Supabase Auth first.
-- Then copy the user's UUID from auth.users.
--
-- Replace AUTH_USER_ID with the UUID from Supabase Auth user.
-- Replace ORG_ID with a generated organization UUID.
-- Replace values such as email/name/phone with the real pilot details.

-- Optional helper while preparing values manually:
-- select gen_random_uuid() as org_id;

begin;

-- Replace ORG_ID with created organization ID.
insert into public.organizations (
  id,
  name,
  slug,
  status
) values (
  'ORG_ID',
  'Arslan Transport',
  'arslan-transport',
  'active'
);

-- Replace AUTH_USER_ID with the UUID from Supabase Auth user.
insert into public.profiles (
  id,
  full_name,
  email,
  phone
) values (
  'AUTH_USER_ID',
  'Pilot Owner',
  'owner@example.com',
  null
);

-- Replace ORG_ID and AUTH_USER_ID with real UUID values.
insert into public.organization_members (
  organization_id,
  user_id,
  role,
  status,
  joined_at
) values (
  'ORG_ID',
  'AUTH_USER_ID',
  'owner',
  'active',
  now()
);

-- Replace ORG_ID with the created organization ID.
insert into public.settings (
  organization_id,
  invoice_prefix,
  next_invoice_number,
  default_currency,
  timezone
) values (
  'ORG_ID',
  'AT',
  1001,
  'PKR',
  'Asia/Karachi'
);

commit;
