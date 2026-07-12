#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultCsvPath = path.join(projectRoot, "import-data", "april-2026", "shipments-import.csv");
const orgSlug = "arslan-transport";
const requiredColumns = [
  "shipment_ref",
  "shipment_date",
  "client_name",
  "loading_point",
  "destination",
  "driver_name",
  "vehicle_no",
  "truck_type",
  "cell_no",
  "company_rate",
  "driver_rate",
  "status",
  "remarks",
];

const truckTypeAliases = new Map([
  ["13.5 REEFRER BOX", "13.5 REEFER BOX"],
  ["13.5 REEFER BOX", "13.5 REEFER BOX"],
  ["13.5 REFER", "13.5 REEFER"],
  ["13.5 METR REEFER", "13.5 REEFER"],
  ["14.5 REFER BOX", "14.5 REEFER BOX"],
  ["15 MTR BOX", "15 MTR BOX"],
  ["12MTR FLATBED", "12 MTR FLATBED"],
  ["12 MTR FLAT BED", "12 MTR FLATBED"],
  ["13.5 METR BOX", "13.5 BOX"],
]);

const clientNameAliases = new Map([
  ["GLOBALSHIIPPING", "GLOBALSHIPPING"],
]);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(projectRoot, ".env.import.local"));
loadEnvFile(path.join(projectRoot, ".env.local"));

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const getValue = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  return {
    dryRun: flags.has("--dry-run"),
    apply: flags.has("--apply"),
    csvPath: path.resolve(projectRoot, getValue("--csv", defaultCsvPath)),
  };
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function norm(value) {
  return clean(value).toUpperCase();
}

function normalizeClientName(value) {
  const cleaned = norm(value);
  return clientNameAliases.get(cleaned) ?? cleaned;
}

function normalizePhone(value) {
  return clean(value).replace(/[^\d+]/g, "");
}

function normalizeTruckType(value) {
  const cleaned = norm(value);
  return truckTypeAliases.get(cleaned) ?? cleaned;
}

function canonicalDriverName(value) {
  const name = norm(value);
  if (name === "ALTAF") return "ALTAF KHAN";
  if (name === "GURBAKSHINDR") return "GURBAKSINDER";
  if (name === "MOHAMMAED IMRAN") return "MOHAMMED IMRAN";
  return name;
}

function parseDate(value) {
  const cleaned = clean(value);
  const match = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseMoney(value) {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value) {
  const cleaned = norm(value).replace(/[\s-]+/g, "_");
  if (!cleaned) return { status: "pending", warning: "Blank status normalized to pending." };
  if (["DELIVERED", "COMPLETE", "COMPLETED", "DONE"].includes(cleaned)) return { status: "delivered" };
  if (["PENDING"].includes(cleaned)) return { status: "pending" };
  if (["IN_PROGRESS", "IN_TRANSIT", "TRANSIT"].includes(cleaned)) return { status: "in_transit" };
  if (["CANCELLED", "CANCELED"].includes(cleaned)) return { status: "cancelled" };
  return { status: null, warning: `Unknown status '${value}'.` };
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  const headers = rows.shift()?.map((header) => clean(header)).filter(Boolean) ?? [];
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  return rows.map((cells, index) => {
    const entry = { _rowNumber: index + 2 };
    headers.forEach((header, cellIndex) => {
      entry[header] = clean(cells[cellIndex]);
    });
    return entry;
  });
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceRoleKey };
}

function requireSupabase() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.import.local.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function getOrganization(supabase) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .is("deleted_at", null)
    .single();
  if (error) throw new Error(`Unable to find organization '${orgSlug}': ${error.message}`);
  return data;
}

async function fetchMasterData(supabase, organizationId) {
  const [clients, drivers, vehicles, truckTypes, routeLocations, shipments] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("drivers").select("id, name, phone").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("vehicles").select("id, vehicle_number, driver_id, truck_type_id").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("truck_types").select("id, name").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("route_locations").select("id, type, name").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("shipments").select("id, import_ref, shipment_no, invoice_reference").eq("organization_id", organizationId).is("deleted_at", null),
  ]);
  for (const result of [clients, drivers, vehicles, truckTypes, routeLocations, shipments]) {
    if (result.error) throw new Error(`Unable to load master data: ${result.error.message}`);
  }
  return {
    clients: clients.data ?? [],
    drivers: drivers.data ?? [],
    vehicles: vehicles.data ?? [],
    truckTypes: truckTypes.data ?? [],
    routeLocations: routeLocations.data ?? [],
    shipments: shipments.data ?? [],
  };
}

function indexBy(rows, getKey) {
  const map = new Map();
  rows.forEach((row) => map.set(getKey(row), row));
  return map;
}

function buildIndexes(master) {
  const truckTypeById = indexBy(master.truckTypes, (row) => row.id);
  const driverById = indexBy(master.drivers, (row) => row.id);
  return {
    clientByName: indexBy(master.clients, (row) => normalizeClientName(row.name)),
    driverByName: indexBy(master.drivers, (row) => norm(row.name)),
    vehicleByNo: indexBy(master.vehicles, (row) => norm(row.vehicle_number)),
    truckTypeByName: indexBy(master.truckTypes, (row) => norm(row.name)),
    routeLoading: new Set(master.routeLocations.filter((row) => row.type === "loading_point").map((row) => norm(row.name))),
    routeDestination: new Set(master.routeLocations.filter((row) => row.type === "destination").map((row) => norm(row.name))),
    shipmentImportRefs: new Set(master.shipments.map((row) => row.import_ref || row.shipment_no || row.invoice_reference).filter(Boolean).map(norm)),
    truckTypeById,
    driverById,
  };
}

function validateRows(rows, indexes) {
  const duplicateRefs = new Set();
  const seenRefs = new Set();
  const invalid = [];
  const warnings = [];
  const validRows = [];
  const unmatched = {
    clients: new Set(),
    drivers: new Set(),
    vehicles: new Set(),
    truckTypes: new Set(),
    loadingPoints: new Set(),
    destinations: new Set(),
  };

  for (const row of rows) {
    const errors = [];
    const rowWarnings = [];
    const shipmentRef = norm(row.shipment_ref);
    if (!shipmentRef) errors.push("shipment_ref is required.");
    if (seenRefs.has(shipmentRef)) duplicateRefs.add(shipmentRef);
    seenRefs.add(shipmentRef);

    const shipmentDate = parseDate(row.shipment_date);
    if (!shipmentDate) errors.push(`Invalid shipment_date '${row.shipment_date}'.`);
    else if (!shipmentDate.startsWith("2026-04-")) rowWarnings.push(`Shipment date ${shipmentDate} is outside April 2026.`);

    const client = indexes.clientByName.get(normalizeClientName(row.client_name));
    if (!client) {
      unmatched.clients.add(clean(row.client_name));
      errors.push(`Client not found: ${row.client_name}`);
    }

    const driver = indexes.driverByName.get(canonicalDriverName(row.driver_name));
    if (!driver) {
      unmatched.drivers.add(clean(row.driver_name));
      errors.push(`Driver not found: ${row.driver_name}`);
    } else if (row.cell_no && normalizePhone(driver.phone) && normalizePhone(driver.phone) !== normalizePhone(row.cell_no)) {
      rowWarnings.push(`Driver phone differs for ${row.driver_name}: CSV ${row.cell_no}, master ${driver.phone}.`);
    }

    const vehicle = indexes.vehicleByNo.get(norm(row.vehicle_no));
    if (!vehicle) {
      unmatched.vehicles.add(clean(row.vehicle_no));
      errors.push(`Vehicle not found: ${row.vehicle_no}`);
    }

    const normalizedTruckType = normalizeTruckType(row.truck_type);
    const truckType = indexes.truckTypeByName.get(normalizedTruckType);
    if (!truckType) {
      unmatched.truckTypes.add(`${row.truck_type} -> ${normalizedTruckType}`);
      errors.push(`Truck type not found: ${row.truck_type}`);
    }

    const loadingPoint = norm(row.loading_point);
    if (!indexes.routeLoading.has(loadingPoint)) {
      unmatched.loadingPoints.add(clean(row.loading_point));
      errors.push(`Loading point not found: ${row.loading_point}`);
    }

    const destination = norm(row.destination);
    if (!indexes.routeDestination.has(destination)) {
      unmatched.destinations.add(clean(row.destination));
      errors.push(`Destination not found: ${row.destination}`);
    }

    const companyRate = parseMoney(row.company_rate);
    const driverRate = parseMoney(row.driver_rate);
    if (companyRate === null) errors.push(`Invalid company_rate '${row.company_rate}'.`);
    if (driverRate === null) errors.push(`Invalid driver_rate '${row.driver_rate}'.`);

    const statusResult = normalizeStatus(row.status);
    if (!statusResult.status) errors.push(statusResult.warning);
    else if (statusResult.warning) rowWarnings.push(statusResult.warning);

    if (vehicle && driver && vehicle.driver_id && vehicle.driver_id !== driver.id) {
      const linkedDriver = indexes.driverById.get(vehicle.driver_id);
      errors.push(`Vehicle ${row.vehicle_no} is linked to ${linkedDriver?.name ?? "another driver"}, not ${row.driver_name}.`);
    }

    if (vehicle && truckType && vehicle.truck_type_id && vehicle.truck_type_id !== truckType.id) {
      const linkedTruckType = indexes.truckTypeById.get(vehicle.truck_type_id);
      rowWarnings.push(
        `Vehicle ${row.vehicle_no} default truck type is ${linkedTruckType?.name ?? "another type"}; shipment CSV uses ${normalizedTruckType}.`,
      );
    }

    const alreadyImported = indexes.shipmentImportRefs.has(shipmentRef);
    const normalized = {
      rowNumber: row._rowNumber,
      importRef: shipmentRef,
      shipmentDate,
      client,
      driver,
      vehicle,
      truckType,
      loadingPoint,
      destination,
      companyRate,
      driverRate,
      status: statusResult.status,
      remarks: clean(row.remarks) || null,
      alreadyImported,
    };

    if (errors.length) invalid.push({ rowNumber: row._rowNumber, shipmentRef, errors });
    else validRows.push(normalized);
    warnings.push(...rowWarnings.map((warning) => `Row ${row._rowNumber} ${shipmentRef}: ${warning}`));
  }

  if (duplicateRefs.size) {
    duplicateRefs.forEach((ref) => invalid.push({ rowNumber: "multiple", shipmentRef: ref, errors: ["Duplicate shipment_ref in CSV."] }));
  }

  return { validRows, invalid, warnings, unmatched, duplicateRefs: [...duplicateRefs] };
}

async function applyRows(supabase, organizationId, validRows) {
  const rowsToInsert = validRows.filter((row) => !row.alreadyImported);
  const payload = rowsToInsert.map((row) => ({
    organization_id: organizationId,
    import_ref: row.importRef,
    shipment_no: row.importRef,
    invoice_reference: row.importRef,
    shipment_date: row.shipmentDate,
    client_id: row.client.id,
    driver_id: row.driver.id,
    vehicle_id: row.vehicle.id,
    truck_type_id: row.truckType.id,
    loading_point: row.loadingPoint,
    destination: row.destination,
    company_rate: row.companyRate,
    driver_rate: row.driverRate,
    status: row.status,
    remarks: row.remarks,
  }));

  if (!payload.length) return { inserted: 0, skippedExisting: validRows.filter((row) => row.alreadyImported).length, failedRows: [] };

  const { error } = await supabase.from("shipments").insert(payload);
  if (error) return { inserted: 0, skippedExisting: validRows.filter((row) => row.alreadyImported).length, failedRows: [error.message] };
  return { inserted: payload.length, skippedExisting: validRows.filter((row) => row.alreadyImported).length, failedRows: [] };
}

function printSet(title, set) {
  const values = [...set].filter(Boolean).sort();
  console.log(`${title}: ${values.length}`);
  values.slice(0, 30).forEach((value) => console.log(`- ${value}`));
  if (values.length > 30) console.log(`...and ${values.length - 30} more`);
}

function printDryRun({ csvPath, rows, organization, validation }) {
  const rowsToInsert = validation.validRows.filter((row) => !row.alreadyImported);
  const skipped = validation.validRows.filter((row) => row.alreadyImported);
  console.log("April 2026 shipments import dry-run");
  console.log("------------------------------------");
  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`CSV path: ${csvPath}`);
  console.log(`Total rows found: ${rows.length}`);
  console.log(`Valid rows: ${validation.validRows.length}`);
  console.log(`Invalid rows: ${validation.invalid.length}`);
  console.log(`Duplicate shipment_ref values: ${validation.duplicateRefs.length}`);
  printSet("Unmatched clients", validation.unmatched.clients);
  printSet("Unmatched drivers", validation.unmatched.drivers);
  printSet("Unmatched vehicles", validation.unmatched.vehicles);
  printSet("Unmatched truck types", validation.unmatched.truckTypes);
  printSet("Unmatched loading points", validation.unmatched.loadingPoints);
  printSet("Unmatched destinations", validation.unmatched.destinations);
  console.log(`Rows that would be inserted: ${rowsToInsert.length}`);
  console.log(`Rows skipped because already imported: ${skipped.length}`);
  if (validation.warnings.length) {
    console.log("Warnings:");
    validation.warnings.slice(0, 40).forEach((warning) => console.log(`- ${warning}`));
    if (validation.warnings.length > 40) console.log(`...and ${validation.warnings.length - 40} more warnings`);
  }
  if (validation.invalid.length) {
    console.log("Invalid row samples:");
    validation.invalid.slice(0, 20).forEach((row) => console.log(`- Row ${row.rowNumber} ${row.shipmentRef}: ${row.errors.join("; ")}`));
    if (validation.invalid.length > 20) console.log(`...and ${validation.invalid.length - 20} more invalid rows`);
  }
  console.log("Dry-run only. No shipments were written.");
}

async function aprilShipmentCount(supabase, organizationId) {
  const { count, error } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("shipment_date", "2026-04-01")
    .lte("shipment_date", "2026-04-30")
    .is("deleted_at", null);
  if (error) throw new Error(`Unable to count April shipments: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const args = parseArgs();
  if (args.dryRun === args.apply) throw new Error("Choose exactly one mode: --dry-run or --apply.");
  if (!fs.existsSync(args.csvPath)) throw new Error(`CSV not found: ${args.csvPath}`);

  const supabase = requireSupabase();
  const organization = await getOrganization(supabase);
  const master = await fetchMasterData(supabase, organization.id);
  const indexes = buildIndexes(master);
  const rows = parseCsv(fs.readFileSync(args.csvPath, "utf8"));
  const validation = validateRows(rows, indexes);

  if (args.dryRun) {
    printDryRun({ csvPath: args.csvPath, rows, organization, validation });
    return;
  }

  if (validation.invalid.length) {
    printDryRun({ csvPath: args.csvPath, rows, organization, validation });
    throw new Error("Apply blocked because validation found critical mismatches.");
  }

  const result = await applyRows(supabase, organization.id, validation.validRows);
  const finalAprilCount = await aprilShipmentCount(supabase, organization.id);
  console.log("April 2026 shipments import apply result");
  console.log("----------------------------------------");
  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(JSON.stringify({ ...result, warnings: validation.warnings, finalAprilShipmentCount: finalAprilCount }, null, 2));
  if (result.failedRows.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
