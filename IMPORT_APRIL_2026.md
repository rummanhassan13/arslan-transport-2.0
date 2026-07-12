# April 2026 Master Data Import

This import is for the Arslan Transport pilot organization only.

Scope for Phase 1:

- Clients
- Truck types
- Vehicles
- Drivers

Out of scope:

- Shipments
- Shipment expenses
- Payments
- Invoices
- Attachments
- Frontend import UI

## Source File

Place the driver CSV at:

```text
import-data/april-2026/drivers.csv
```

Expected columns:

```text
driver_name,vehicle_no,truck_type_raw,cell_no
```

The current source file was copied from:

```text
C:/Users/DELL/Downloads/import-dataapril-2026drivers.csv
```

## Required Server-Side Env

Create a local-only file:

```text
.env.import.local
```

Required values:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend env files. `.env.import.local` is ignored by git.

## Commands

Dry-run:

```bash
npm run import:april-master -- --dry-run
```

Apply:

```bash
npm run import:april-master -- --apply
```

Dry-run must be reviewed before apply.

## Clients Imported

Exactly these clients are prepared:

- `NAQEL EXPRESS`
- `MOMIN`
- `GLOBALSHIIPPING`

`GLOBALSHIIPPING` keeps the spelling provided. Notes include:

```text
Original spelling provided: GLOBALSHIIPPING
```

## Deduplication Rules

Vehicles:

- Key: `organization_id + vehicle_number`
- Vehicle numbers are trimmed and uppercased.

Truck types:

- Key: `organization_id + normalized truck type name`
- Known spelling/capitalization variants are normalized.

Drivers:

- Primary matching uses normalized driver name and phone.
- Re-runs also avoid duplicates by normalized driver name.
- Known duplicate cleanup is handled for:
  - `AJAJ MOHAMMED` / `41787 DXB`
  - `ALTAF` and `ALTAF KHAN` / `83513 DXB`
  - `GURBAKSHINDR` and `GURBAKSINDER` / `24547 DXB`
  - `MOHAMMAED IMRAN` and `MOHAMMED IMRAN` / `70080 DXB`
- Alternate phone numbers are stored in notes where needed.
- `ISHAK ALI` and `ISHAQ ALI` remain separate because vehicle numbers differ.

## Rollback Limitation

The script is idempotent but does not create a rollback migration.

Before apply, review dry-run output. If rollback is needed after apply, use Supabase table filters by notes containing:

```text
April 2026 master import.
```

and review rows manually before deleting or soft-deleting.

## Verification SQL

```sql
select count(*) as clients
from clients c
join organizations o on o.id = c.organization_id
where o.slug = 'arslan-transport' and c.deleted_at is null;

select count(*) as truck_types
from truck_types t
join organizations o on o.id = t.organization_id
where o.slug = 'arslan-transport' and t.deleted_at is null;

select count(*) as vehicles
from vehicles v
join organizations o on o.id = v.organization_id
where o.slug = 'arslan-transport' and v.deleted_at is null;

select count(*) as drivers
from drivers d
join organizations o on o.id = d.organization_id
where o.slug = 'arslan-transport' and d.deleted_at is null;

select vehicle_number, count(*)
from vehicles v
join organizations o on o.id = v.organization_id
where o.slug = 'arslan-transport' and v.deleted_at is null
group by vehicle_number
having count(*) > 1;

select upper(trim(name)) as driver_name, count(*)
from drivers d
join organizations o on o.id = d.organization_id
where o.slug = 'arslan-transport' and d.deleted_at is null
group by upper(trim(name))
having count(*) > 1;
```
