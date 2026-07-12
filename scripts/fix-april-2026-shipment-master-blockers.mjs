#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultCsvPath = path.join(projectRoot, "import-data", "april-2026", "shipments-import.csv");
const orgSlug = "arslan-transport";
const targetVehicleNo = "14575 DXB";

const truckTypeAliases = new Map([
  ["12 MTR FLAT BED", "12 MTR FLATBED"],
  ["12MTR FLATBED", "12 MTR FLATBED"],
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

function normalizeTruckType(value) {
  const cleaned = norm(value);
  return truckTypeAliases.get(cleaned) ?? cleaned;
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
  return rows.map((cells, index) => {
    const entry = { _rowNumber: index + 2 };
    headers.forEach((header, cellIndex) => {
      entry[header] = clean(cells[cellIndex]);
    });
    return entry;
  });
}

function requireSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.import.local.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function getOrganization(supabase) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();
  if (error) throw new Error(`Unable to find organization '${orgSlug}': ${error.message}`);
  return data;
}

function summarizeRows(rows) {
  const targetRows = rows.filter((row) => norm(row.vehicle_no) === targetVehicleNo);
  const truckTypeCounts = new Map();
  for (const row of targetRows) {
    const truckType = normalizeTruckType(row.truck_type);
    truckTypeCounts.set(truckType, (truckTypeCounts.get(truckType) ?? 0) + 1);
  }
  const selectedTruckType = [...truckTypeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { targetRows, truckTypeCounts, selectedTruckType };
}

async function loadMaster(supabase, organizationId, selectedTruckType) {
  const [vehicles, driver, truckType] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, vehicle_number, driver_id, truck_type_id, notes, status")
      .eq("organization_id", organizationId)
      .ilike("vehicle_number", "%14575%"),
    supabase
      .from("drivers")
      .select("id, name, phone, notes, status")
      .eq("organization_id", organizationId)
      .ilike("name", "JATINDER SINGH")
      .maybeSingle(),
    supabase
      .from("truck_types")
      .select("id, name, status")
      .eq("organization_id", organizationId)
      .eq("name", selectedTruckType)
      .maybeSingle(),
  ]);
  for (const result of [vehicles, driver, truckType]) {
    if (result.error) throw new Error(`Unable to load master data: ${result.error.message}`);
  }
  return { vehicles: vehicles.data ?? [], driver: driver.data, truckType: truckType.data };
}

function printSummary({ organization, csvPath, targetRows, truckTypeCounts, selectedTruckType, master, mode }) {
  console.log(`April 2026 shipment master blocker fix ${mode}`);
  console.log("-------------------------------------------");
  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`CSV path: ${csvPath}`);
  console.log(`Target vehicle: ${targetVehicleNo}`);
  console.log(`CSV rows found: ${targetRows.length}`);
  targetRows.forEach((row) => {
    console.log(
      `- ${row.shipment_ref}: driver=${row.driver_name}; vehicle=${row.vehicle_no}; truck_type=${row.truck_type}; cell=${row.cell_no}`,
    );
  });
  console.log(`Existing vehicles containing 14575: ${master.vehicles.length}`);
  master.vehicles.forEach((vehicle) => console.log(`- ${vehicle.vehicle_number} (${vehicle.id})`));
  console.log("Truck types in CSV for this vehicle:");
  [...truckTypeCounts.entries()].forEach(([truckType, count]) => console.log(`- ${truckType}: ${count}`));
  console.log(`Selected vehicle default truck type: ${selectedTruckType ?? "none"}`);
  console.log(`Matching driver found: ${master.driver ? `${master.driver.name} (${master.driver.id})` : "no"}`);
  console.log(`Matching truck type found: ${master.truckType ? `${master.truckType.name} (${master.truckType.id})` : "no"}`);
}

async function main() {
  const args = parseArgs();
  if (args.dryRun === args.apply) throw new Error("Choose exactly one mode: --dry-run or --apply.");
  if (!fs.existsSync(args.csvPath)) throw new Error(`CSV not found: ${args.csvPath}`);

  const rows = parseCsv(fs.readFileSync(args.csvPath, "utf8"));
  const { targetRows, truckTypeCounts, selectedTruckType } = summarizeRows(rows);
  if (!targetRows.length) throw new Error(`No CSV rows found for vehicle ${targetVehicleNo}.`);
  if (!selectedTruckType) throw new Error(`No truck type found for vehicle ${targetVehicleNo}.`);

  const supabase = requireSupabase();
  const organization = await getOrganization(supabase);
  const master = await loadMaster(supabase, organization.id, selectedTruckType);
  printSummary({ organization, csvPath: args.csvPath, targetRows, truckTypeCounts, selectedTruckType, master, mode: args.dryRun ? "dry-run" : "apply" });

  if (master.vehicles.some((vehicle) => norm(vehicle.vehicle_number) === targetVehicleNo)) {
    console.log("Exact vehicle already exists. No insert needed.");
    return;
  }
  if (!master.driver) throw new Error("Apply blocked: JATINDER SINGH was not found in drivers.");
  if (!master.truckType) throw new Error(`Apply blocked: ${selectedTruckType} was not found in truck_types.`);
  if (args.dryRun) {
    console.log("Dry-run only. Vehicle would be inserted.");
    return;
  }

  const notes = [
    "Controlled April 2026 shipment import master-data fix.",
    `Source shipment refs: ${targetRows.map((row) => row.shipment_ref).join(", ")}.`,
    `CSV truck types observed: ${[...truckTypeCounts.keys()].join(", ")}.`,
    `CSV cell numbers observed: ${[...new Set(targetRows.map((row) => clean(row.cell_no)).filter(Boolean))].join(", ")}.`,
  ].join(" ");
  const { error } = await supabase.from("vehicles").insert({
    organization_id: organization.id,
    vehicle_number: targetVehicleNo,
    driver_id: master.driver.id,
    truck_type_id: master.truckType.id,
    notes,
    status: "active",
  });
  if (error) throw new Error(`Unable to insert vehicle ${targetVehicleNo}: ${error.message}`);
  console.log(`Inserted vehicle ${targetVehicleNo}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
