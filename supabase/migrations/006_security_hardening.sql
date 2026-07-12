-- Security Hardening Migration
-- 1. Protect owner role from privilege escalation / unauthorized demotion or removal.
-- 2. Ensure each organization always retains at least one active owner.

create or replace function public.check_organization_owner_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid;
  owner_count int;
begin
  -- Get the ID of the user performing the action from the auth context
  acting_user := auth.uid();

  -- 1. If it's a DELETE operation
  if TG_OP = 'DELETE' then
    -- If the user being deleted is an owner
    if OLD.role = 'owner' then
      -- If acting user is not the owner themselves, block it
      if acting_user is null or acting_user <> OLD.user_id then
        raise exception 'Unauthorized: Only the owner themselves can remove their ownership role.';
      end if;

      -- Check how many active owners remain in the organization
      select count(*) into owner_count
      from public.organization_members
      where organization_id = OLD.organization_id and role = 'owner' and status = 'active';

      if owner_count <= 1 then
        raise exception 'Forbidden: An organization must have at least one active owner.';
      end if;
    end if;
    return OLD;

  -- 2. If it's an UPDATE operation
  elsif TG_OP = 'UPDATE' then
    -- If the current role is owner, and they are being demoted or made inactive
    if OLD.role = 'owner' and (NEW.role <> 'owner' or NEW.status <> 'active') then
      -- If acting user is not the owner themselves, block demotion
      if acting_user is null or acting_user <> OLD.user_id then
        raise exception 'Unauthorized: Only the owner themselves can modify or demote their ownership role.';
      end if;

      -- Ensure another active owner exists if this owner is demoting themselves or going inactive
      select count(*) into owner_count
      from public.organization_members
      where organization_id = OLD.organization_id and role = 'owner' and status = 'active' and user_id <> OLD.user_id;

      if owner_count = 0 then
        raise exception 'Forbidden: An organization must have at least one active owner. Please appoint another owner first.';
      end if;
    end if;

    -- If the record is for an owner, prevent any other changes to their record by non-owners
    if OLD.role = 'owner' and (acting_user is null or acting_user <> OLD.user_id) then
      raise exception 'Unauthorized: Only the owner themselves can modify their member record.';
    end if;

    return NEW;
  end if;

  return null;
end;
$$;

-- Create the trigger on organization_members
drop trigger if exists check_organization_owner_modification_trigger on public.organization_members;
create trigger check_organization_owner_modification_trigger
before update or delete on public.organization_members
for each row execute function public.check_organization_owner_modification();
