#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultCsvPath = path.join(projectRoot, "import-data", "april-2026", "loading-and-destination-points.csv");
const orgSlug = "arslan-transport";
const requiredColumns = ["Loading Point", "Destination"];

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

function normalizeLocation(value) {
  return clean(value).toUpperCase();
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

function uniqueValues(rows, column) {
  const values = new Map();
  let blanks = 0;
  let duplicates = 0;
  rows.forEach((row) => {
    const normalized = normalizeLocation(row[column]);
    if (!normalized) {
      blanks += 1;
      return;
    }
    if (values.has(normalized)) duplicates += 1;
    values.set(normalized, normalized);
  });
  return { values: [...values.values()].sort(), blanks, duplicates };
}

function buildPlan(rows) {
  const loading = uniqueValues(rows, "Loading Point");
  const destinations = uniqueValues(rows, "Destination");
  return {
    loadingPoints: loading.values,
    destinations: destinations.values,
    blankRowsSkipped: {
      loading_point: loading.blanks,
      destination: destinations.blanks,
    },
    duplicatesRemoved: {
      loading_point: loading.duplicates,
      destination: destinations.duplicates,
    },
    warnings: [],
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

async function fetchExistingRouteLocations(supabase, organizationId) {
  const { data, error } = await supabase
    .from("route_locations")
    .select("id, type, name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (error) throw new Error(`Unable to load route locations: ${error.message}`);
  return data ?? [];
}

function splitExisting(existing) {
  const loading = new Set();
  const destinations = new Set();
  existing.forEach((row) => {
    const set = row.type === "loading_point" ? loading : destinations;
    set.add(normalizeLocation(row.name));
  });
  return { loading, destinations };
}

function comparePlan(plan, existing = []) {
  const existingSets = splitExisting(existing);
  const loadingToInsert = plan.loadingPoints.filter((name) => !existingSets.loading.has(name));
  const destinationsToInsert = plan.destinations.filter((name) => !existingSets.destinations.has(name));
  return {
    loadingToInsert,
    destinationsToInsert,
    loadingSkipped: plan.loadingPoints.length - loadingToInsert.length,
    destinationsSkipped: plan.destinations.length - destinationsToInsert.length,
  };
}

async function applyPlan(supabase, organizationId, plan, existing) {
  const comparison = comparePlan(plan, existing);
  const rows = [
    ...comparison.loadingToInsert.map((name) => ({ organization_id: organizationId, type: "loading_point", name })),
    ...comparison.destinationsToInsert.map((name) => ({ organization_id: organizationId, type: "destination", name })),
  ];
  const result = {
    loadingPointsInserted: 0,
    loadingPointsSkippedExisting: comparison.loadingSkipped,
    destinationsInserted: 0,
    destinationsSkippedExisting: comparison.destinationsSkipped,
    failedRows: [],
  };

  if (rows.length) {
    const { error } = await supabase.from("route_locations").insert(rows);
    if (error) {
      result.failedRows.push(error.message);
      return result;
    }
    result.loadingPointsInserted = comparison.loadingToInsert.length;
    result.destinationsInserted = comparison.destinationsToInsert.length;
  }

  const finalRows = await fetchExistingRouteLocations(supabase, organizationId);
  const finalSets = splitExisting(finalRows);
  return {
    ...result,
    finalLoadingPointCount: finalSets.loading.size,
    finalDestinationCount: finalSets.destinations.size,
  };
}

function printDryRun({ csvPath, rows, plan, organization, existing }) {
  const comparison = comparePlan(plan, existing ?? []);
  console.log("April 2026 route-location import dry-run");
  console.log("------------------------------------------");
  console.log(`Organization: ${organization ? `${organization.name} (${organization.id})` : "not loaded - missing server-side env"}`);
  console.log(`CSV path: ${csvPath}`);
  console.log(`CSV rows found: ${rows.length}`);
  console.log(`Unique loading points found: ${plan.loadingPoints.length}`);
  console.log(`Unique destinations found: ${plan.destinations.length}`);
  console.log(`Blank loading point rows skipped: ${plan.blankRowsSkipped.loading_point}`);
  console.log(`Blank destination rows skipped: ${plan.blankRowsSkipped.destination}`);
  console.log(`Duplicate loading points removed from CSV: ${plan.duplicatesRemoved.loading_point}`);
  console.log(`Duplicate destinations removed from CSV: ${plan.duplicatesRemoved.destination}`);
  if (existing) {
    console.log(`Existing loading points that would be skipped: ${comparison.loadingSkipped}`);
    console.log(`Existing destinations that would be skipped: ${comparison.destinationsSkipped}`);
  } else {
    console.log("Existing database comparison skipped because server-side env is missing.");
  }
  console.log(`New loading points that would be inserted: ${comparison.loadingToInsert.length}`);
  comparison.loadingToInsert.forEach((name) => console.log(`- loading_point: ${name}`));
  console.log(`New destinations that would be inserted: ${comparison.destinationsToInsert.length}`);
  comparison.destinationsToInsert.forEach((name) => console.log(`- destination: ${name}`));
  if (plan.warnings.length) {
    console.log("Warnings:");
    plan.warnings.forEach((warning) => console.log(`- ${warning}`));
  }
  console.log("Dry-run only. No records were written.");
}

async function main() {
  const args = parseArgs();
  if (args.dryRun === args.apply) throw new Error("Choose exactly one mode: --dry-run or --apply.");
  if (!fs.existsSync(args.csvPath)) throw new Error(`CSV not found: ${args.csvPath}`);

  const rows = parseCsv(fs.readFileSync(args.csvPath, "utf8"));
  const plan = buildPlan(rows);
  const { url, serviceRoleKey } = getSupabaseConfig();
  let organization = null;
  let existing = null;

  if (url && serviceRoleKey) {
    const supabase = requireSupabase();
    organization = await getOrganization(supabase);
    existing = await fetchExistingRouteLocations(supabase, organization.id);
    if (args.apply) {
      const result = await applyPlan(supabase, organization.id, plan, existing);
      console.log("April 2026 route-location import apply result");
      console.log("--------------------------------------------");
      console.log(`Organization: ${organization.name} (${organization.id})`);
      console.log(JSON.stringify(result, null, 2));
      if (result.failedRows.length) process.exitCode = 1;
      return;
    }
  } else if (args.apply) {
    throw new Error("Apply mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server-side env.");
  } else {
    console.log("Server-side Supabase env not found. Running CSV-only dry-run; live existing-record comparisons are skipped.");
  }

  printDryRun({ csvPath: args.csvPath, rows, plan, organization, existing });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
