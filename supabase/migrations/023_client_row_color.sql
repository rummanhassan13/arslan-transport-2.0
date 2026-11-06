-- Colour used to tint a company's rows in the shipment register.
-- NULL means "automatic": the app picks a colour from a fixed palette.
alter table public.clients
  add column if not exists row_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_row_color_hex' and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_row_color_hex check (row_color is null or row_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
