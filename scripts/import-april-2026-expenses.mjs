#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultCsvPath = path.join(projectRoot, "import-data", "april-2026", "april-shipment-expenses.csv");
const orgSlug = "arslan-transport";
const requiredColumns = [
  "invoice_number",
  "gate_pass_amount",
  "fashah_amount",
  "naql_amount",
  "invoice_status",
  "payment_status",
];
const expenseColumns = [
  ["gate_pass_amount", "gate_pass"],
  ["fashah_amount", "fashah"],
  ["naql_amount", "naql"],
];

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

function parseMoney(value) {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
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
    .is("deleted_at", null)
    .single();
  if (error) throw new Error(`Unable to find organization '${orgSlug}': ${error.message}`);
  return data;
}

async function hasShipmentColumn(supabase, column) {
  const { error } = await supabase.from("shipments").select(column).limit(1);
  return !error;
}

async function fetchMasterData(supabase, organizationId) {
  const [shipments, expenses, hasInvoiceStatus, hasPaymentStatus] = await Promise.all([
    supabase
      .from("shipments")
      .select("id, import_ref, shipment_no, invoice_reference, shipment_date, remarks")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase
      .from("shipment_expenses")
      .select("id, shipment_id, category, amount, notes")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    hasShipmentColumn(supabase, "invoice_status"),
    hasShipmentColumn(supabase, "payment_status"),
  ]);
  if (shipments.error) throw new Error(`Unable to load shipments: ${shipments.error.message}`);
  if (expenses.error) throw new Error(`Unable to load shipment expenses: ${expenses.error.message}`);
  return {
    shipments: shipments.data ?? [],
    expenses: expenses.data ?? [],
    safeStatusColumns: { invoice_status: hasInvoiceStatus, payment_status: hasPaymentStatus },
  };
}

function buildShipmentIndex(shipments) {
  const map = new Map();
  for (const shipment of shipments) {
    [shipment.import_ref, shipment.shipment_no, shipment.invoice_reference]
      .map(norm)
      .filter(Boolean)
      .forEach((key) => {
        if (!map.has(key)) map.set(key, []);
        const matches = map.get(key);
        if (!matches.some((match) => match.id === shipment.id)) matches.push(shipment);
      });
  }
  return map;
}

function buildExpenseIndex(expenses) {
  const map = new Map();
  for (const expense of expenses) {
    const key = `${expense.shipment_id}:${expense.category}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(expense);
  }
  return map;
}

function statusNote(invoiceNumber, invoiceStatus, paymentStatus) {
  const parts = [];
  if (invoiceStatus) parts.push(`invoice_status=${invoiceStatus}`);
  if (paymentStatus) parts.push(`payment_status=${paymentStatus}`);
  return parts.length ? `[april-expense-status:${invoiceNumber}] ${parts.join("; ")}` : "";
}

function expenseNote(invoiceNumber, category) {
  return `[april-expense-import:${invoiceNumber}:${category}]`;
}

function appendNote(existing, note) {
  if (!note) return existing || null;
  if (existing?.includes(note)) return existing;
  return [existing, note].filter(Boolean).join("\n");
}

function validateRows(rows, master) {
  const shipmentIndex = buildShipmentIndex(master.shipments);
  const expenseIndex = buildExpenseIndex(master.expenses);
  const unmatched = [];
  const invalid = [];
  const duplicateInvoiceNumbers = new Set();
  const seenInvoiceNumbers = new Set();
  const plannedExpenses = [];
  const plannedShipmentStatusUpdates = [];
  let zeroAmountRows = 0;

  for (const row of rows) {
    const errors = [];
    const invoiceNumber = norm(row.invoice_number);
    if (!invoiceNumber) errors.push("invoice_number is required.");
    if (seenInvoiceNumbers.has(invoiceNumber)) duplicateInvoiceNumbers.add(invoiceNumber);
    seenInvoiceNumbers.add(invoiceNumber);

    const matches = shipmentIndex.get(invoiceNumber) ?? [];
    if (matches.length === 0) {
      unmatched.push(clean(row.invoice_number));
      errors.push(`Shipment not found for invoice_number ${row.invoice_number}.`);
    } else if (matches.length > 1) {
      errors.push(`Multiple shipments matched invoice_number ${row.invoice_number}.`);
    }

    const amounts = [];
    for (const [column, category] of expenseColumns) {
      const amount = parseMoney(row[column]);
      if (amount === null) errors.push(`Invalid ${column}: ${row[column]}`);
      else if (amount > 0) amounts.push({ column, category, amount });
    }
    if (!amounts.length) zeroAmountRows += 1;

    if (errors.length) {
      invalid.push({ rowNumber: row._rowNumber, invoiceNumber, errors });
      continue;
    }

    const shipment = matches[0];
    for (const item of amounts) {
      const key = `${shipment.id}:${item.category}`;
      const existing = expenseIndex.get(key)?.[0];
      const note = expenseNote(invoiceNumber, item.category);
      plannedExpenses.push({
        action: existing ? "update" : "insert",
        invoiceNumber,
        shipment,
        existing,
        category: item.category,
        amount: item.amount,
        note,
      });
    }

    const note = statusNote(invoiceNumber, clean(row.invoice_status), clean(row.payment_status));
    if (note) {
      plannedShipmentStatusUpdates.push({
        invoiceNumber,
        shipment,
        invoiceStatus: clean(row.invoice_status),
        paymentStatus: clean(row.payment_status),
        note,
      });
    }
  }

  if (duplicateInvoiceNumbers.size) {
    duplicateInvoiceNumbers.forEach((invoiceNumber) =>
      invalid.push({ rowNumber: "multiple", invoiceNumber, errors: ["Duplicate invoice_number in CSV."] }),
    );
  }

  return { unmatched, invalid, duplicateInvoiceNumbers, plannedExpenses, plannedShipmentStatusUpdates, zeroAmountRows };
}

async function applyImport(supabase, organizationId, validation, safeStatusColumns) {
  const inserted = [];
  const updated = [];
  const failed = [];

  for (const item of validation.plannedExpenses) {
    const basePayload = {
      amount: item.amount,
      paid_by: "company",
      client_billable: true,
      driver_reimbursable: false,
      included_in_invoice: true,
      expense_date: item.shipment.shipment_date,
      notes: appendNote(item.existing?.notes, item.note),
    };

    if (item.existing) {
      const { error } = await supabase.from("shipment_expenses").update(basePayload).eq("id", item.existing.id);
      if (error) failed.push(`${item.invoiceNumber} ${item.category}: ${error.message}`);
      else updated.push(item);
    } else {
      const { error } = await supabase.from("shipment_expenses").insert({
        organization_id: organizationId,
        shipment_id: item.shipment.id,
        category: item.category,
        ...basePayload,
      });
      if (error) failed.push(`${item.invoiceNumber} ${item.category}: ${error.message}`);
      else inserted.push(item);
    }
  }

  let statusUpdated = 0;
  for (const item of validation.plannedShipmentStatusUpdates) {
    const payload = {};
    if (safeStatusColumns.invoice_status && item.invoiceStatus) payload.invoice_status = item.invoiceStatus;
    if (safeStatusColumns.payment_status && item.paymentStatus) payload.payment_status = item.paymentStatus;
    if (!safeStatusColumns.invoice_status || !safeStatusColumns.payment_status) {
      payload.remarks = appendNote(item.shipment.remarks, item.note);
    }
    if (!Object.keys(payload).length) continue;
    const { error } = await supabase.from("shipments").update(payload).eq("id", item.shipment.id);
    if (error) failed.push(`${item.invoiceNumber} shipment status: ${error.message}`);
    else statusUpdated += 1;
  }

  return { inserted: inserted.length, updated: updated.length, statusUpdated, failed };
}

function printReport({ mode, csvPath, organization, rows, validation, safeStatusColumns, applyResult }) {
  const insertCount = validation.plannedExpenses.filter((item) => item.action === "insert").length;
  const updateCount = validation.plannedExpenses.filter((item) => item.action === "update").length;
  console.log(`April 2026 shipment expenses/status import ${mode}`);
  console.log("------------------------------------------------");
  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`CSV path: ${csvPath}`);
  console.log(`Rows found: ${rows.length}`);
  console.log(`Matched invoice numbers: ${rows.length - validation.unmatched.length - validation.invalid.length}`);
  console.log(`Unmatched invoice numbers: ${validation.unmatched.length}`);
  validation.unmatched.slice(0, 40).forEach((invoiceNumber) => console.log(`- ${invoiceNumber}`));
  if (validation.unmatched.length > 40) console.log(`...and ${validation.unmatched.length - 40} more unmatched invoices`);
  console.log(`Invalid rows: ${validation.invalid.length}`);
  validation.invalid.slice(0, 20).forEach((row) => console.log(`- Row ${row.rowNumber} ${row.invoiceNumber}: ${row.errors.join("; ")}`));
  if (validation.invalid.length > 20) console.log(`...and ${validation.invalid.length - 20} more invalid rows`);
  console.log(`Rows with no positive expense amount: ${validation.zeroAmountRows}`);
  console.log(`Expense rows to insert: ${insertCount}`);
  console.log(`Expense rows to update: ${updateCount}`);
  console.log(`Shipment status rows to update: ${validation.plannedShipmentStatusUpdates.length}`);
  console.log(`Safe status columns: invoice_status=${safeStatusColumns.invoice_status}; payment_status=${safeStatusColumns.payment_status}`);
  if (!safeStatusColumns.invoice_status || !safeStatusColumns.payment_status) {
    console.log("Status values will be appended to shipment remarks where status columns are unavailable.");
  }
  if (applyResult) {
    console.log("Apply result:");
    console.log(JSON.stringify(applyResult, null, 2));
  } else {
    console.log("Dry-run only. No expenses or shipment notes/statuses were written.");
  }
}

async function main() {
  const args = parseArgs();
  if (args.dryRun === args.apply) throw new Error("Choose exactly one mode: --dry-run or --apply.");
  if (!fs.existsSync(args.csvPath)) throw new Error(`CSV not found: ${args.csvPath}`);

  const supabase = requireSupabase();
  const organization = await getOrganization(supabase);
  const master = await fetchMasterData(supabase, organization.id);
  const rows = parseCsv(fs.readFileSync(args.csvPath, "utf8"));
  const validation = validateRows(rows, master);

  if (args.dryRun) {
    printReport({ mode: "dry-run", csvPath: args.csvPath, organization, rows, validation, safeStatusColumns: master.safeStatusColumns });
    return;
  }

  if (validation.invalid.length || validation.unmatched.length) {
    printReport({ mode: "apply blocked", csvPath: args.csvPath, organization, rows, validation, safeStatusColumns: master.safeStatusColumns });
    throw new Error("Apply blocked because validation found unmatched or invalid invoice numbers.");
  }

  const applyResult = await applyImport(supabase, organization.id, validation, master.safeStatusColumns);
  printReport({ mode: "apply", csvPath: args.csvPath, organization, rows, validation, safeStatusColumns: master.safeStatusColumns, applyResult });
  if (applyResult.failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
