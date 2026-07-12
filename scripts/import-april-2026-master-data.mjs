#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultCsvPath = path.join(projectRoot, "import-data", "april-2026", "drivers.csv");
const orgSlug = "arslan-transport";
const requiredColumns = ["driver_name", "vehicle_no", "truck_type_raw", "cell_no"];
const clientSeeds = [
  { name: "NAQEL EXPRESS", notes: null },
  { name: "MOMIN", notes: null },
  { name: "GLOBALSHIPPING", notes: "Original April CSV spelling: GLOBALSHIIPPING" },
];

const knownTruckTypes = new Set([
  "7 TON DRY BOX",
  "10 TON PICK UP",
  "10 TON DRY",
  "10 TON BOX",
  "10 TON BOX TRUCK",
  "12 MTR FLATBED",
  "13.5 BOX",
  "13.5 BOX TRAILER",
  "13.5 CURTAIN",
  "13.5 REEFER",
  "13.5 REEFER BOX",
  "13.5 REEFER DRY",
  "14.5 REEFER BOX",
  "15 MTR BOX",
  "15 MTR CURTAIN",
  "BOX TRAILER",
  "FLAT BED",
  "FROZEN -2",
  "REEFER -2",
  "18+",
]);

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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
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

function normalizeComparable(value) {
  return clean(value).toUpperCase();
}

function normalizePhone(value) {
  return clean(value).replace(/[^\d+]/g, "");
}

function normalizeTruckType(value) {
  const compact = normalizeComparable(value).replace(/\s+/g, " ");
  const normalized = truckTypeAliases.get(compact) ?? compact;
  return normalized;
}

function canonicalDriverName(row) {
  const name = normalizeComparable(row.driver_name);
  const vehicle = normalizeComparable(row.vehicle_no);
  const phone = normalizePhone(row.cell_no);
  if (vehicle === "83513 DXB" && phone === "0527474935" && ["ALTAF", "ALTAF KHAN"].includes(name)) return "ALTAF KHAN";
  if (vehicle === "24547 DXB" && phone === "0501954407" && ["GURBAKSHINDR", "GURBAKSINDER"].includes(name)) return "GURBAKSINDER";
  if (vehicle === "70080 DXB" && ["MOHAMMAED IMRAN", "MOHAMMED IMRAN"].includes(name)) return "MOHAMMED IMRAN";
  return name;
}

function mergeKeyForRow(row) {
  const vehicle = normalizeComparable(row.vehicle_no);
  const canonicalName = canonicalDriverName(row);
  if (vehicle === "41787 DXB" && canonicalName === "AJAJ MOHAMMED") return `${vehicle}|AJAJ MOHAMMED`;
  if (vehicle === "83513 DXB" && canonicalName === "ALTAF KHAN") return `${vehicle}|ALTAF KHAN`;
  if (vehicle === "24547 DXB" && canonicalName === "GURBAKSINDER") return `${vehicle}|GURBAKSINDER`;
  if (vehicle === "70080 DXB" && canonicalName === "MOHAMMED IMRAN") return `${vehicle}|MOHAMMED IMRAN`;
  return `${vehicle}|${canonicalName}|${normalizePhone(row.cell_no)}`;
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
  const headers = rows.shift()?.map((header) => clean(header)) ?? [];
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

function buildImportPlan(csvRows) {
  const warnings = [];
  const unknownTruckTypes = new Map();
  const rawTruckTypeMappings = new Map();
  const driverGroups = new Map();

  csvRows.forEach((row) => {
    const truckType = normalizeTruckType(row.truck_type_raw);
    rawTruckTypeMappings.set(clean(row.truck_type_raw), truckType);
    if (!knownTruckTypes.has(truckType)) {
      unknownTruckTypes.set(clean(row.truck_type_raw), truckType);
    }
    const key = mergeKeyForRow(row);
    if (!driverGroups.has(key)) driverGroups.set(key, []);
    driverGroups.get(key).push(row);
  });

  const mergedRecords = [];
  const drivers = [];
  const vehicles = new Map();

  for (const [key, rows] of driverGroups.entries()) {
    const canonicalName = canonicalDriverName(rows.find((row) => canonicalDriverName(row) === normalizeComparable(row.driver_name)) ?? rows[0]);
    const vehicleNumber = normalizeComparable(rows[0].vehicle_no);
    const phones = [...new Set(rows.map((row) => clean(row.cell_no)).filter(Boolean))];
    const phoneDigits = [...new Set(rows.map((row) => normalizePhone(row.cell_no)).filter(Boolean))];
    const truckTypes = [...new Set(rows.map((row) => normalizeTruckType(row.truck_type_raw)).filter(Boolean))];
    const chosenRow = [...rows].reverse().find((row) => canonicalDriverName(row) === normalizeComparable(row.driver_name)) ?? rows[0];
    const chosenTruckType = normalizeTruckType(chosenRow.truck_type_raw);
    const primaryPhone = clean(chosenRow.cell_no) || phones[0] || null;

    if (rows.length > 1) {
      mergedRecords.push({
        key,
        driverName: canonicalName,
        vehicleNumber,
        rows: rows.map((row) => row._rowNumber),
        phones,
        truckTypes,
      });
    }
    if (truckTypes.length > 1) {
      warnings.push(`Vehicle ${vehicleNumber} has multiple truck types in merged rows: ${truckTypes.join(", ")}. Using ${chosenTruckType}.`);
    }

    const notes = [
      "April 2026 master import.",
      `Source rows: ${rows.map((row) => row._rowNumber).join(", ")}`,
      `Raw driver names: ${[...new Set(rows.map((row) => clean(row.driver_name)))].join(" / ")}`,
      `Raw vehicle values: ${[...new Set(rows.map((row) => clean(row.vehicle_no)))].join(" / ")}`,
      `Raw truck types: ${[...new Set(rows.map((row) => clean(row.truck_type_raw)))].join(" / ")}`,
      phones.length > 1 ? `Alternate phones: ${phones.filter((phone) => phone !== primaryPhone).join(", ")}` : null,
    ].filter(Boolean).join("\n");

    drivers.push({
      importKey: key,
      name: canonicalName,
      phone: primaryPhone,
      phoneDigits,
      vehicleNumber,
      truckTypeName: chosenTruckType,
      notes,
      sourceRows: rows,
    });

    if (!vehicles.has(vehicleNumber)) {
      vehicles.set(vehicleNumber, {
        vehicleNumber,
        truckTypeName: chosenTruckType,
        driverImportKey: key,
        notes: [
          "April 2026 master import.",
          `Raw vehicle values: ${[...new Set(rows.map((row) => clean(row.vehicle_no)))].join(" / ")}`,
          `Raw truck types: ${[...new Set(rows.map((row) => clean(row.truck_type_raw)))].join(" / ")}`,
        ].join("\n"),
      });
    } else {
      warnings.push(`Vehicle ${vehicleNumber} appears under more than one driver group. Review before apply.`);
    }
  }

  const duplicateRows = mergedRecords.map((record) => `${record.driverName} / ${record.vehicleNumber} from rows ${record.rows.join(", ")}`);
  const truckTypes = [...new Set([...rawTruckTypeMappings.values()])].sort();

  return {
    clients: clientSeeds,
    truckTypes,
    vehicles: [...vehicles.values()].sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber)),
    drivers: drivers.sort((a, b) => a.name.localeCompare(b.name)),
    rawTruckTypeMappings,
    unknownTruckTypes,
    duplicateRows,
    mergedRecords,
    warnings,
  };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceRoleKey };
}

function requireSupabase() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    throw new Error("Missing server-side import env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.import.local.");
  }
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

function byNormalizedName(rows) {
  return new Map(rows.map((row) => [normalizeComparable(row.name), row]));
}

async function fetchExisting(supabase, organizationId) {
  const [clients, truckTypes, vehicles, drivers] = await Promise.all([
    supabase.from("clients").select("id, name, notes, status").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("truck_types").select("id, name, description, status").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("vehicles").select("id, vehicle_number, truck_type_id, driver_id, notes, status").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("drivers").select("id, name, phone, notes, status").eq("organization_id", organizationId).is("deleted_at", null),
  ]);
  for (const result of [clients, truckTypes, vehicles, drivers]) {
    if (result.error) throw new Error(`Unable to load existing data: ${result.error.message}`);
  }
  return {
    clients: clients.data ?? [],
    truckTypes: truckTypes.data ?? [],
    vehicles: vehicles.data ?? [],
    drivers: drivers.data ?? [],
  };
}

function findDriver(existingDrivers, driver) {
  const normalizedName = normalizeComparable(driver.name);
  const phones = new Set(driver.phoneDigits);
  return existingDrivers.find((row) => normalizeComparable(row.name) === normalizedName && phones.has(normalizePhone(row.phone))) ??
    existingDrivers.find((row) => normalizeComparable(row.name) === normalizedName);
}

async function applyPlan(supabase, organizationId, plan, existing) {
  const results = {
    clients: { inserted: 0, updated: 0, skipped: 0 },
    truckTypes: { inserted: 0, updated: 0, skipped: 0 },
    drivers: { inserted: 0, updated: 0, skipped: 0 },
    vehicles: { inserted: 0, updated: 0, skipped: 0 },
    failed: [],
  };
  const clientMap = byNormalizedName(existing.clients);
  const truckTypeMap = byNormalizedName(existing.truckTypes);
  const vehicleMap = new Map(existing.vehicles.map((row) => [normalizeComparable(row.vehicle_number), row]));
  const driversByImportKey = new Map();

  for (const client of plan.clients) {
    const existingClient = clientMap.get(normalizeComparable(client.name));
    if (!existingClient) {
      const { error } = await supabase.from("clients").insert({ organization_id: organizationId, name: client.name, notes: client.notes, status: "active" });
      error ? results.failed.push(`Client ${client.name}: ${error.message}`) : results.clients.inserted++;
    } else if (client.notes && !String(existingClient.notes ?? "").includes(client.notes)) {
      const notes = [existingClient.notes, client.notes].filter(Boolean).join("\n");
      const { error } = await supabase.from("clients").update({ notes }).eq("id", existingClient.id);
      error ? results.failed.push(`Client ${client.name}: ${error.message}`) : results.clients.updated++;
    } else {
      results.clients.skipped++;
    }
  }

  for (const truckType of plan.truckTypes) {
    const existingTruckType = truckTypeMap.get(normalizeComparable(truckType));
    if (!existingTruckType) {
      const { data, error } = await supabase.from("truck_types").insert({ organization_id: organizationId, name: truckType, status: "active" }).select("id, name").single();
      if (error) results.failed.push(`Truck type ${truckType}: ${error.message}`);
      else {
        truckTypeMap.set(normalizeComparable(truckType), data);
        results.truckTypes.inserted++;
      }
    } else {
      results.truckTypes.skipped++;
    }
  }

  for (const driver of plan.drivers) {
    const existingDriver = findDriver(existing.drivers, driver);
    if (!existingDriver) {
      const { data, error } = await supabase
        .from("drivers")
        .insert({ organization_id: organizationId, name: driver.name, phone: driver.phone, notes: driver.notes, status: "active" })
        .select("id, name, phone, notes")
        .single();
      if (error) results.failed.push(`Driver ${driver.name}: ${error.message}`);
      else {
        driversByImportKey.set(driver.importKey, data);
        existing.drivers.push(data);
        results.drivers.inserted++;
      }
    } else {
      driversByImportKey.set(driver.importKey, existingDriver);
      if (driver.notes && !String(existingDriver.notes ?? "").includes("April 2026 master import.")) {
        const notes = [existingDriver.notes, driver.notes].filter(Boolean).join("\n");
        const { error } = await supabase.from("drivers").update({ notes }).eq("id", existingDriver.id);
        error ? results.failed.push(`Driver ${driver.name}: ${error.message}`) : results.drivers.updated++;
      } else {
        results.drivers.skipped++;
      }
    }
  }

  for (const vehicle of plan.vehicles) {
    const truckTypeId = truckTypeMap.get(normalizeComparable(vehicle.truckTypeName))?.id ?? null;
    const driverId = driversByImportKey.get(vehicle.driverImportKey)?.id ?? null;
    const existingVehicle = vehicleMap.get(normalizeComparable(vehicle.vehicleNumber));
    const payload = { truck_type_id: truckTypeId, driver_id: driverId, notes: vehicle.notes, status: "active" };
    if (!existingVehicle) {
      const { error } = await supabase.from("vehicles").insert({ organization_id: organizationId, vehicle_number: vehicle.vehicleNumber, ...payload });
      error ? results.failed.push(`Vehicle ${vehicle.vehicleNumber}: ${error.message}`) : results.vehicles.inserted++;
    } else {
      const needsUpdate = existingVehicle.truck_type_id !== truckTypeId || existingVehicle.driver_id !== driverId;
      if (needsUpdate) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", existingVehicle.id);
        error ? results.failed.push(`Vehicle ${vehicle.vehicleNumber}: ${error.message}`) : results.vehicles.updated++;
      } else {
        results.vehicles.skipped++;
      }
    }
  }

  return results;
}

function printPlan(plan, rows, organization, existing) {
  console.log("April 2026 master-data import dry-run");
  console.log("--------------------------------------");
  console.log(`Organization: ${organization ? `${organization.name} (${organization.id})` : "not loaded - missing server-side env"}`);
  console.log(`CSV rows found: ${rows.length}`);
  console.log(`Clients to import: ${plan.clients.length}`);
  console.log(`Unique truck types after normalization: ${plan.truckTypes.length}`);
  console.log(`Vehicle rows found: ${rows.length}`);
  console.log(`Unique vehicles: ${plan.vehicles.length}`);
  console.log(`Driver rows found: ${rows.length}`);
  console.log(`Unique drivers after cleanup: ${plan.drivers.length}`);
  console.log(`Duplicate/merged groups: ${plan.mergedRecords.length}`);
  console.log(`Unknown truck type mappings: ${plan.unknownTruckTypes.size}`);
  if (existing) {
    console.log(`Existing active clients/truck types/vehicles/drivers: ${existing.clients.length}/${existing.truckTypes.length}/${existing.vehicles.length}/${existing.drivers.length}`);
  }
  if (plan.mergedRecords.length) {
    console.log("\nMerged records:");
    plan.mergedRecords.forEach((record) => console.log(`- ${record.driverName} / ${record.vehicleNumber}: rows ${record.rows.join(", ")}; phones ${record.phones.join(", ")}`));
  }
  if (plan.unknownTruckTypes.size) {
    console.log("\nUnknown truck type mappings requiring review:");
    for (const [raw, suggested] of plan.unknownTruckTypes.entries()) console.log(`- '${raw}' -> '${suggested}'`);
  }
  if (plan.warnings.length) {
    console.log("\nWarnings:");
    plan.warnings.forEach((warning) => console.log(`- ${warning}`));
  }
  console.log("\nRecords prepared:");
  console.log(`- Clients: ${plan.clients.map((client) => client.name).join(", ")}`);
  console.log(`- Truck types: ${plan.truckTypes.join(", ")}`);
  console.log(`- Vehicles: ${plan.vehicles.length}`);
  console.log(`- Drivers: ${plan.drivers.length}`);
  console.log("\nDry-run only. No records were written.");
}

async function main() {
  const args = parseArgs();
  if (args.dryRun === args.apply) {
    throw new Error("Choose exactly one mode: --dry-run or --apply.");
  }
  if (!fs.existsSync(args.csvPath)) throw new Error(`CSV not found: ${args.csvPath}`);

  const rows = parseCsv(fs.readFileSync(args.csvPath, "utf8"));
  const plan = buildImportPlan(rows);
  const { url, serviceRoleKey } = getSupabaseConfig();
  let organization = null;
  let existing = null;

  if (url && serviceRoleKey) {
    const supabase = requireSupabase();
    organization = await getOrganization(supabase);
    existing = await fetchExisting(supabase, organization.id);
    if (args.apply) {
      const results = await applyPlan(supabase, organization.id, plan, existing);
      console.log("April 2026 master-data import apply result");
      console.log("------------------------------------------");
      console.log(`Organization: ${organization.name} (${organization.id})`);
      console.log(JSON.stringify(results, null, 2));
      if (results.failed.length) process.exitCode = 1;
      return;
    }
  } else if (args.apply) {
    throw new Error("Apply mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server-side env.");
  } else {
    console.log("Server-side Supabase env not found. Running CSV-only dry-run; live existing-record comparisons are skipped.");
  }

  printPlan(plan, rows, organization, existing);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
