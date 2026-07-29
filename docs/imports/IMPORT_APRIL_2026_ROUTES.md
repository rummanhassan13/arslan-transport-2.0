# April 2026 Route Location Import

This import saves reusable Loading Point and Destination options for the Arslan Transport pilot organization.

Scope:

- `route_locations` with `type = loading_point`
- `route_locations` with `type = destination`

Out of scope:

- Shipments
- Shipment expenses
- Payments
- Invoices
- Attachments
- Frontend import UI

## Source File

Place the CSV at:

```text
import-data/april-2026/loading-and-destination-points.csv
```

Example approved source location before copying:

```text
path/to/approved-source/loading-and-destination-points.csv
```

Expected columns:

```text
Loading Point,Destination
```

## Required Server-Side Env

Create local-only `.env.import.local`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend `.env.local` or any `VITE_` variable.

## Commands

Dry-run:

```bash
npm run import:april-routes -- --dry-run
```

Apply:

```bash
npm run import:april-routes -- --apply
```

Dry-run must be reviewed before apply.

## Deduplication

The script:

- trims extra spaces
- uppercases route values for consistency
- skips blank values
- removes duplicates within the CSV
- skips existing active database records by organization, type, and normalized name

The database also has a unique active index on:

```text
organization_id + type + lower(trim(name))
```

## Verification SQL

Counts:

```sql
select type, count(*)
from route_locations rl
join organizations o on o.id = rl.organization_id
where o.slug = 'arslan-transport'
  and rl.deleted_at is null
group by type
order by type;
```

List values:

```sql
select rl.type, rl.name
from route_locations rl
join organizations o on o.id = rl.organization_id
where o.slug = 'arslan-transport'
  and rl.deleted_at is null
order by rl.type, rl.name;
```

Duplicate check:

```sql
select rl.type, lower(trim(rl.name)) as normalized_name, count(*)
from route_locations rl
join organizations o on o.id = rl.organization_id
where o.slug = 'arslan-transport'
  and rl.deleted_at is null
group by rl.type, lower(trim(rl.name))
having count(*) > 1;
```

## App Verification

After apply:

1. Reload the live app.
2. Log in with Supabase mode.
3. Open Add Shipment.
4. Confirm Loading Point shows imported loading points.
5. Confirm Destination shows imported destinations.
6. Confirm `Add new...` still saves new route options.
