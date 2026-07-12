# April 2026 Shipments Import

This import loads April 2026 shipment rows for Arslan Transport only.

Scope:

- `shipments`

Out of scope:

- Shipment expenses
- Payments
- Invoices
- Attachments
- Frontend import UI

## Source File

Place the CSV at:

```text
import-data/april-2026/shipments-import.csv
```

Expected columns:

```text
shipment_ref,shipment_date,client_name,loading_point,destination,driver_name,vehicle_no,truck_type,cell_no,company_rate,driver_rate,status,remarks
```

## Required Env

Use local-only `.env.import.local`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Never put the service role key in frontend `.env.local` or `VITE_` variables.

## Commands

Dry-run:

```bash
npm run import:april-shipments -- --dry-run
```

Apply:

```bash
npm run import:april-shipments -- --apply
```

Apply is blocked if any critical master-data mismatch exists.

One controlled master-data fix helper exists for the known missing vehicle
`14575 DXB`:

```bash
npm run fix:april-shipment-master -- --dry-run
npm run fix:april-shipment-master -- --apply
```

It only checks/inserts that vehicle for Arslan Transport and links it to the
matching existing driver/truck type when those master records exist.

## Idempotency

The migration `004_shipment_import_ref.sql` adds:

```text
shipments.import_ref
```

and a unique active index:

```text
organization_id + import_ref
```

The import uses `shipment_ref` as `import_ref`, `shipment_no`, and `invoice_reference`.

## Validation

Dry-run checks:

- required fields
- unique `shipment_ref`
- valid shipment date
- date is April 2026, with warning if outside
- client exists
- driver exists
- vehicle exists
- truck type exists
- loading point exists in `route_locations`
- destination exists in `route_locations`
- vehicle-driver match
- vehicle-truck-type mismatch is reported as a warning only; the CSV truck type
  is used on the shipment because vehicle truck type is a default/reference
- numeric company and driver rates
- normalized status
- duplicate already-imported refs

## Verification SQL

Total April shipments:

```sql
select count(*)
from shipments s
join organizations o on o.id = s.organization_id
where o.slug = 'arslan-transport'
  and s.shipment_date between date '2026-04-01' and date '2026-04-30'
  and s.deleted_at is null;
```

Shipments by client:

```sql
select c.name, count(*)
from shipments s
join organizations o on o.id = s.organization_id
left join clients c on c.id = s.client_id
where o.slug = 'arslan-transport'
  and s.shipment_date between date '2026-04-01' and date '2026-04-30'
  and s.deleted_at is null
group by c.name
order by count(*) desc;
```

Shipments with missing links:

```sql
select import_ref, shipment_no, client_id, driver_id, vehicle_id, truck_type_id
from shipments s
join organizations o on o.id = s.organization_id
where o.slug = 'arslan-transport'
  and s.shipment_date between date '2026-04-01' and date '2026-04-30'
  and s.deleted_at is null
  and (client_id is null or driver_id is null or vehicle_id is null or truck_type_id is null);
```

Missing rates:

```sql
select import_ref, company_rate, driver_rate
from shipments s
join organizations o on o.id = s.organization_id
where o.slug = 'arslan-transport'
  and s.shipment_date between date '2026-04-01' and date '2026-04-30'
  and s.deleted_at is null
  and (company_rate is null or driver_rate is null);
```
