#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultImportPath = path.join(projectRoot, "import-data", "previous-shipments", "Import_Template.csv");
const defaultOrgSlug = "arslan-transport";
const requiredColumns = [
  "shipment_date",
  "invoice_number",
  "client_name",
  "driver_name",
  "vehicle_no",
  "company_rate",
  "driver_rate",
];
const legacyStatusColumns = [
  "status",
  "shipment_status",
  "invoice_status",
  "payment_status",
  "client_payment_status",
  "driver_payment_status",
];
const standardExpenseTemplates = [
  { key: "gate_pass", category: "gate_pass", label: "Gate Pass" },
  { key: "fashah", category: "fashah", label: "Fashah" },
  { key: "naql", category: "naql", label: "NAQL" },
];
const allowedExpenseCategories = new Set([
  "gate_pass",
  "fashah",
  "naql",
  "fuel",
  "toll",
  "loading_unloading",
  "repair",
  "parking",
  "food",
  "waiting_charges",
  "other",
]);
const categoryAliases = new Map([
  ["gate pass", "gate_pass"],
  ["gate_pass", "gate_pass"],
  ["fashah", "fashah"],
  ["naql", "naql"],
  ["fuel", "fuel"],
  ["toll", "toll"],
  ["loading unloading", "loading_unloading"],
  ["loading_unloading", "loading_unloading"],
  ["repair", "repair"],
  ["parking", "parking"],
  ["food", "food"],
  ["waiting charges", "waiting_charges"],
  ["waiting_charges", "waiting_charges"],
  ["other", "other"],
]);
const truthyValues = new Set(["1", "true", "yes", "y"]);
const falseyValues = new Set(["0", "false", "no", "n"]);

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
    preview: flags.has("--preview") || flags.has("--dry-run"),
    apply: flags.has("--apply"),
    json: flags.has("--json"),
    inputPath: path.resolve(projectRoot, getValue("--file", getValue("--csv", defaultImportPath))),
    orgSlug: getValue("--org", defaultOrgSlug),
  };
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function norm(value) {
  return clean(value).toUpperCase();
}

function normalizePhone(value) {
  return clean(value).replace(/[^\d+]/g, "");
}

function parseDate(value) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    return validDate(year, Number(dmy[2]), Number(dmy[1]));
  }
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  return validDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseMoney(value, { required = false } = {}) {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned) return required ? null : 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseBoolean(value, fallback) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return fallback;
  if (truthyValues.has(normalized)) return true;
  if (falseyValues.has(normalized)) return false;
  return fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function nearlyEqual(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) <= 0.01;
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
  return rows;
}

function rowsFromMatrix(matrix) {
  const headers = matrix.shift()?.map(normalizeHeader) ?? [];
  const filteredHeaders = headers.filter(Boolean);
  const rows = matrix
    .map((cells, index) => {
      const entry = { _rowNumber: index + 2 };
      headers.forEach((header, cellIndex) => {
        if (header) entry[header] = clean(cells[cellIndex]);
      });
      return entry;
    })
    .filter((row) => filteredHeaders.some((header) => clean(row[header])) && (clean(row['invoice_number']) || clean(row['shipment_date'])));
  return { headers: new Set(filteredHeaders), rows };
}

async function parseImportFile(inputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`Import file not found: ${inputPath}`);
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".csv" || ext === ".txt") {
    return rowsFromMatrix(parseCsv(fs.readFileSync(inputPath, "utf8")));
  }
  if (ext === ".xlsx") {
    let excelReader;
    try {
      excelReader = await import("read-excel-file/node");
    } catch {
      throw new Error("Excel import requires the 'read-excel-file' package. Save the Import_Template sheet as CSV if it is unavailable.");
    }
    const sheetNames = await excelReader.readSheetNames(inputPath);
    const sheetName = sheetNames.find((name) => normalizeHeader(name) === "import_template") ?? sheetNames[0];
    if (!sheetName) throw new Error("Workbook does not contain any worksheets.");
    const matrix = await excelReader.default(inputPath, { sheet: sheetName });
    return rowsFromMatrix(matrix);
  }
  if (ext === ".xls") throw new Error("Legacy .xls files are not accepted. Save the workbook as .xlsx or CSV before importing.");
  throw new Error(`Unsupported import file type '${ext}'. Use CSV or XLSX.`);
}

function requireSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getOrganization(supabase, slug) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .is("deleted_at", null)
    .single();
  if (error) throw new Error(`Unable to find organization '${slug}': ${error.message}`);
  return data;
}

async function fetchMasterData(supabase, organizationId) {
  const [clients, drivers, vehicles, truckTypes, shipments, invoices] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("drivers").select("id, name, phone").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("vehicles").select("id, vehicle_number, driver_id, truck_type_id").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("truck_types").select("id, name").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("shipments").select("id, import_ref, shipment_no, invoice_reference").eq("organization_id", organizationId).is("deleted_at", null),
    supabase.from("invoices").select("id, invoice_number").eq("organization_id", organizationId).is("deleted_at", null),
  ]);
  for (const result of [clients, drivers, vehicles, truckTypes, shipments, invoices]) {
    if (result.error) throw new Error(`Unable to load master data: ${result.error.message}`);
  }
  return {
    clients: clients.data ?? [],
    drivers: drivers.data ?? [],
    vehicles: vehicles.data ?? [],
    truckTypes: truckTypes.data ?? [],
    shipments: shipments.data ?? [],
    invoices: invoices.data ?? [],
  };
}

function buildIndexes(master) {
  const shipmentRefs = new Set();
  master.shipments.forEach((shipment) => {
    [shipment.import_ref, shipment.shipment_no, shipment.invoice_reference].map(norm).filter(Boolean).forEach((key) => shipmentRefs.add(key));
  });
  return {
    clientByName: new Map(master.clients.map((row) => [norm(row.name), row])),
    driverByName: new Map(master.drivers.map((row) => [norm(row.name), row])),
    vehicleByNo: new Map(master.vehicles.map((row) => [norm(row.vehicle_number), row])),
    truckTypeByName: new Map(master.truckTypes.map((row) => [norm(row.name), row])),
    shipmentRefs,
    invoiceNumbers: new Set(master.invoices.map((row) => norm(row.invoice_number))),
  };
}

function findColumn(headers, candidates) {
  return candidates.find((candidate) => headers.has(candidate)) ?? null;
}

function getColumnValue(row, headers, candidates) {
  const column = findColumn(headers, candidates);
  return { column, value: column ? row[column] : "" };
}

function moneyFromColumns(row, headers, candidates, options) {
  const { column, value } = getColumnValue(row, headers, candidates);
  return { column, value: parseMoney(value, options) };
}

function normalizeExpenseCategory(value) {
  const cleaned = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  const spaced = clean(value).toLowerCase().replace(/[_-]+/g, " ");
  const normalized = categoryAliases.get(cleaned) ?? categoryAliases.get(spaced) ?? cleaned;
  return allowedExpenseCategories.has(normalized) ? normalized : "other";
}

function collectExpenses(row, headers, rowWarnings, rowErrors) {
  const expenses = [];
  for (const template of standardExpenseTemplates) {
    const actual = moneyFromColumns(row, headers, [
      `${template.key}_actual_cost_amount`,
      `${template.key}_actual_cost`,
      `${template.key}_amount`,
    ]);
    const clientBill = moneyFromColumns(row, headers, [
      `${template.key}_client_bill_amount`,
      `${template.key}_client_bill`,
      `${template.key}_bill_amount`,
    ]);
    if (actual.value === null) rowErrors.push(`${template.label} actual cost is invalid.`);
    if (clientBill.value === null) rowErrors.push(`${template.label} client bill amount is invalid.`);
    if (actual.value === null || clientBill.value === null) continue;
    const clientBillAmount = clientBill.column ? clientBill.value : actual.value;
    if (!clientBill.column && actual.value > 0) {
      rowWarnings.push(`${template.label} client bill column missing; using actual cost as client bill amount.`);
    }
    if (actual.value > 0 || clientBillAmount > 0) {
      expenses.push({
        category: template.category,
        description: template.label,
        actualCostAmount: actual.value,
        clientBillAmount,
        paidBy: "company",
        clientBillable: clientBillAmount > 0,
        driverReimbursable: false,
      });
    }
  }

  for (const prefix of detectOtherExpensePrefixes(headers)) {
    const categoryRaw = getColumnValue(row, headers, [`${prefix}_category`, `${prefix}_type`]).value;
    const description = getColumnValue(row, headers, [`${prefix}_description`, `${prefix}_notes`, `${prefix}_note`]).value;
    const actual = moneyFromColumns(row, headers, [`${prefix}_actual_cost_amount`, `${prefix}_actual_cost`, `${prefix}_amount`]);
    const clientBill = moneyFromColumns(row, headers, [`${prefix}_client_bill_amount`, `${prefix}_client_bill`, `${prefix}_bill_amount`]);
    if (actual.value === null) rowErrors.push(`${prefix} actual cost is invalid.`);
    if (clientBill.value === null) rowErrors.push(`${prefix} client bill amount is invalid.`);
    if (actual.value === null || clientBill.value === null) continue;
    const clientBillAmount = clientBill.column ? clientBill.value : actual.value;
    if (!actual.value && !clientBillAmount && !categoryRaw && !description) continue;
    const category = normalizeExpenseCategory(categoryRaw || "other");
    if (categoryRaw && category === "other" && !["other", "OTHER"].includes(clean(categoryRaw))) {
      rowWarnings.push(`Other expense category '${categoryRaw}' stored as 'other'.`);
    }
    const paidBy = clean(getColumnValue(row, headers, [`${prefix}_paid_by`]).value).toLowerCase();
    const safePaidBy = ["company", "driver", "client", "other"].includes(paidBy) ? paidBy : "company";
    expenses.push({
      category,
      description: description || categoryRaw || "Other expense",
      actualCostAmount: actual.value,
      clientBillAmount,
      paidBy: safePaidBy,
      clientBillable: parseBoolean(getColumnValue(row, headers, [`${prefix}_client_billable`]).value, clientBillAmount > 0),
      driverReimbursable: parseBoolean(getColumnValue(row, headers, [`${prefix}_driver_reimbursable`]).value, false),
    });
  }

  return expenses;
}

function detectOtherExpensePrefixes(headers) {
  const prefixes = new Set();
  for (const header of headers) {
    const match = header.match(/^(other_expense(?:_\d+)?|expense_\d+)_(category|type|description|notes|note|actual_cost_amount|actual_cost|amount|client_bill_amount|client_bill|bill_amount|paid_by|client_billable|driver_reimbursable)$/);
    if (match) prefixes.add(match[1]);
  }
  return [...prefixes].sort();
}

function legacyStatusNote(row, headers, invoiceNumber) {
  const parts = legacyStatusColumns
    .filter((column) => headers.has(column) && clean(row[column]))
    .map((column) => `${column}=${clean(row[column])}`);
  return parts.length ? `[legacy-status:${invoiceNumber}] ${parts.join("; ")}` : "";
}

function calculateFinancials(companyRate, driverRate, expenses, driverAdvance, driverSettlementPaid) {
  const clientBillable = expenses
    .filter((expense) => expense.clientBillable)
    .reduce((total, expense) => total + expense.clientBillAmount, 0);
  const costExpenses = expenses
    .filter((expense) => expense.driverReimbursable || expense.paidBy === "company")
    .reduce((total, expense) => total + expense.actualCostAmount, 0);
  const clientRevenue = roundMoney(companyRate + clientBillable);
  const totalCost = roundMoney(driverRate + costExpenses);
  const driverPending = roundMoney(totalCost - driverAdvance - driverSettlementPaid);
  const netProfit = roundMoney(clientRevenue - totalCost);
  return { clientRevenue, totalCost, driverPending, netProfit };
}

function validateRows(rows, headers, master) {
  const indexes = buildIndexes(master);
  const seenInvoiceNumbers = new Set();
  const duplicateInvoiceNumbers = new Set();
  const errors = [];
  const warnings = [];
  const plans = [];
  const createSets = {
    clients: new Map(),
    drivers: new Map(),
    truckTypes: new Map(),
    vehicles: new Map(),
  };
  const matchedSets = {
    clients: new Map(),
    drivers: new Map(),
    truckTypes: new Map(),
    vehicles: new Map(),
  };

  for (const column of requiredColumns) {
    if (!headers.has(column)) {
      errors.push({ rowNumber: "header", invoiceNumber: "", message: `Missing required column '${column}'.` });
    }
  }
  if (errors.length) return { errors, warnings, plans, createSets, matchedSets };

  for (const row of rows) {
    const rowErrors = [];
    const rowWarnings = [];
    const invoiceNumber = clean(row.invoice_number);
    const invoiceKey = norm(invoiceNumber);
    if (!invoiceNumber) rowErrors.push("invoice_number is required.");
    if (seenInvoiceNumbers.has(invoiceKey)) duplicateInvoiceNumbers.add(invoiceKey);
    seenInvoiceNumbers.add(invoiceKey);
    if (indexes.shipmentRefs.has(invoiceKey)) rowErrors.push(`invoice_number '${invoiceNumber}' already exists as a shipment reference in this organization.`);
    if (indexes.invoiceNumbers.has(invoiceKey)) rowErrors.push(`invoice_number '${invoiceNumber}' already exists as an invoice in this organization.`);

    const shipmentDate = parseDate(row.shipment_date);
    if (!shipmentDate) rowErrors.push("shipment_date is required and must be a valid date.");
    const companyRate = parseMoney(row.company_rate, { required: true });
    const driverRate = parseMoney(row.driver_rate, { required: true });
    if (companyRate === null) rowErrors.push("company_rate is required and must be a non-negative number.");
    if (driverRate === null) rowErrors.push("driver_rate is required and must be a non-negative number.");

    const clientName = clean(row.client_name);
    const driverName = clean(row.driver_name);
    const vehicleNo = clean(row.vehicle_no).toUpperCase();
    if (!clientName) rowErrors.push("client_name is required.");
    if (!driverName) rowErrors.push("driver_name is required.");
    if (!vehicleNo) rowErrors.push("vehicle_no is required.");

    const truckTypeName = clean(row.truck_type || row.truck_type_name).toUpperCase();
    const loadingPoint = clean(row.loading_point) || "Unknown";
    const destination = clean(row.destination) || "Unknown";
    if (!clean(row.loading_point)) rowWarnings.push("loading_point missing; using 'Unknown'.");
    if (!clean(row.destination)) rowWarnings.push("destination missing; using 'Unknown'.");

    const clientKey = norm(clientName);
    const driverKey = norm(driverName);
    const vehicleKey = norm(vehicleNo);
    const truckTypeKey = norm(truckTypeName);
    const matchedClient = indexes.clientByName.get(clientKey);
    const matchedDriver = indexes.driverByName.get(driverKey);
    const matchedTruckType = truckTypeKey ? indexes.truckTypeByName.get(truckTypeKey) : null;
    const matchedVehicle = indexes.vehicleByNo.get(vehicleKey);

    if (matchedClient) matchedSets.clients.set(clientKey, clientName);
    else createSets.clients.set(clientKey, clientName);
    if (matchedDriver) matchedSets.drivers.set(driverKey, driverName);
    else createSets.drivers.set(driverKey, { name: driverName, phone: normalizePhone(row.cell_no || row.driver_phone) || null });
    if (truckTypeKey) {
      if (matchedTruckType) matchedSets.truckTypes.set(truckTypeKey, truckTypeName);
      else createSets.truckTypes.set(truckTypeKey, truckTypeName);
    }
    if (matchedVehicle) {
      matchedSets.vehicles.set(vehicleKey, vehicleNo);
      if (matchedDriver && matchedVehicle.driver_id && matchedVehicle.driver_id !== matchedDriver.id) {
        rowWarnings.push(`Vehicle '${vehicleNo}' is linked to another driver; importer will not overwrite that link.`);
      }
      if (matchedTruckType && matchedVehicle.truck_type_id && matchedVehicle.truck_type_id !== matchedTruckType.id) {
        rowWarnings.push(`Vehicle '${vehicleNo}' has a different truck type; shipment truck type will use the import row.`);
      }
    } else {
      createSets.vehicles.set(vehicleKey, { vehicleNumber: vehicleNo, driverKey, truckTypeKey });
    }

    const expenses = collectExpenses(row, headers, rowWarnings, rowErrors);
    const driverAdvance = parseMoney(row.driver_advance_amount);
    let driverSettlementPaid = parseMoney(row.driver_settlement_paid_amount);
    if (!headers.has("driver_settlement_paid_amount") && headers.has("source_driver_pending")) {
      const sourceDriverPending = parseMoney(row.source_driver_pending);
      if (companyRate !== null && driverRate !== null && driverAdvance !== null && sourceDriverPending !== null) {
        const costExpenses = expenses
          .filter((expense) => expense.driverReimbursable || expense.paidBy === "company")
          .reduce((total, expense) => total + expense.actualCostAmount, 0);
        const totalCost = roundMoney(driverRate + costExpenses);
        driverSettlementPaid = roundMoney(totalCost - driverAdvance - sourceDriverPending);
        if (driverSettlementPaid < 0) driverSettlementPaid = 0;
      }
    }
    const clientPaymentReceived = parseMoney(row.client_payment_received_amount);
    if (driverAdvance === null) rowErrors.push("driver_advance_amount must be non-negative when provided.");
    if (driverSettlementPaid === null) rowErrors.push("driver_settlement_paid_amount must be non-negative when provided.");
    if (clientPaymentReceived === null) rowErrors.push("client_payment_received_amount must be non-negative when provided.");

    const financials =
      companyRate !== null && driverRate !== null && driverAdvance !== null && driverSettlementPaid !== null
        ? calculateFinancials(companyRate, driverRate, expenses, driverAdvance, driverSettlementPaid)
        : null;
    if (financials) {
      for (const { column, label, value } of [
        { column: "source_company_total", label: "source_company_total", value: financials.clientRevenue },
        { column: "source_driver_total", label: "source_driver_total", value: financials.totalCost },
        { column: "source_driver_pending", label: "source_driver_pending", value: financials.driverPending },
        { column: "source_net_profit", label: "source_net_profit", value: financials.netProfit },
      ]) {
        const source = headers.has(column) ? parseMoney(row[column]) : 0;
        if (headers.has(column) && source === null) rowErrors.push(`${label} must be non-negative when provided.`);
        if (headers.has(column) && source !== null && clean(row[column]) && !nearlyEqual(source, value)) {
          rowErrors.push(`${label} mismatch: source ${source}, calculated ${value}.`);
        }
      }
    }

    const legacyNote = legacyStatusNote(row, headers, invoiceNumber);
    if (legacyNote) rowWarnings.push("Legacy status columns will be written to shipment remarks only.");
    rowWarnings.forEach((message) => warnings.push({ rowNumber: row._rowNumber, invoiceNumber, message }));
    if (rowErrors.length) {
      rowErrors.forEach((message) => errors.push({ rowNumber: row._rowNumber, invoiceNumber, message }));
      continue;
    }

    plans.push({
      rowNumber: row._rowNumber,
      invoiceNumber,
      shipmentDate,
      clientKey,
      clientName,
      driverKey,
      driverName,
      vehicleKey,
      vehicleNo,
      truckTypeKey,
      truckTypeName,
      loadingPoint,
      destination,
      companyRate,
      driverRate,
      cellNo: clean(row.cell_no || row.driver_phone),
      remarks: clean(row.remarks) || null,
      shipmentStatus: ["pending", "in_transit", "delivered", "completed", "cancelled"].includes(clean(row.shipment_status || row.status).toLowerCase())
        ? clean(row.shipment_status || row.status).toLowerCase()
        : "completed",
      expenses,
      driverAdvance,
      driverSettlementPaid,
      clientPaymentReceived,
      financials,
    });
  }

  duplicateInvoiceNumbers.forEach((invoiceNumber) => {
    errors.push({ rowNumber: "multiple", invoiceNumber, message: "Duplicate invoice_number in import file." });
  });

  return { errors, warnings, plans, createSets, matchedSets };
}

function summarizePreview({ organization, inputPath, rows, validation }) {
  const created = Object.fromEntries(Object.entries(validation.createSets).map(([key, map]) => [key, [...map.values()]]));
  const matched = Object.fromEntries(Object.entries(validation.matchedSets).map(([key, map]) => [key, [...map.values()]]));
  return {
    mode: "preview",
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    inputPath,
    summary: {
      rowsFound: rows.length,
      validRows: validation.plans.length,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      shipmentsToCreate: validation.plans.length,
      expensesToCreate: validation.plans.reduce((total, plan) => total + plan.expenses.length, 0),
      driverPaymentsToCreate: validation.plans.reduce((total, plan) => total + (plan.driverAdvance > 0 ? 1 : 0) + (plan.driverSettlementPaid > 0 ? 1 : 0), 0),
      clientPaymentsToCreate: validation.plans.filter((plan) => plan.clientPaymentReceived > 0).length,
      invoicesToCreateForClientPayments: validation.plans.filter((plan) => plan.clientPaymentReceived > 0).length,
      previewPasses: validation.errors.length === 0,
    },
    matchedRecords: matched,
    recordsToCreate: created,
    calculatedTotals: validation.plans.map((plan) => ({
      rowNumber: plan.rowNumber,
      invoiceNumber: plan.invoiceNumber,
      clientRevenue: plan.financials.clientRevenue,
      totalCost: plan.financials.totalCost,
      driverPending: plan.financials.driverPending,
      netProfit: plan.financials.netProfit,
      expenseCount: plan.expenses.length,
    })),
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

async function insertOne(supabase, table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw new Error(`Insert ${table} failed: ${error.message}`);
  return data;
}

async function applyImport(supabase, organizationId, validation) {
  const created = { clients: 0, drivers: 0, truckTypes: 0, vehicles: 0, shipments: 0, expenses: 0, invoices: 0, clientPayments: 0, driverPayments: 0 };
  const clientIds = new Map();
  const driverIds = new Map();
  const truckTypeIds = new Map();
  const vehicleIds = new Map();
  const shipmentIds = new Map();

  for (const plan of validation.plans) {
    if (!clientIds.has(plan.clientKey) && !validation.createSets.clients.has(plan.clientKey)) clientIds.set(plan.clientKey, null);
    if (!driverIds.has(plan.driverKey) && !validation.createSets.drivers.has(plan.driverKey)) driverIds.set(plan.driverKey, null);
    if (plan.truckTypeKey && !truckTypeIds.has(plan.truckTypeKey) && !validation.createSets.truckTypes.has(plan.truckTypeKey)) truckTypeIds.set(plan.truckTypeKey, null);
    if (!vehicleIds.has(plan.vehicleKey) && !validation.createSets.vehicles.has(plan.vehicleKey)) vehicleIds.set(plan.vehicleKey, null);
  }

  const master = await fetchMasterData(supabase, organizationId);
  const indexes = buildIndexes(master);
  for (const [key, row] of indexes.clientByName) clientIds.set(key, row.id);
  for (const [key, row] of indexes.driverByName) driverIds.set(key, row.id);
  for (const [key, row] of indexes.truckTypeByName) truckTypeIds.set(key, row.id);
  for (const [key, row] of indexes.vehicleByNo) vehicleIds.set(key, row.id);

  for (const [key, name] of validation.createSets.clients) {
    if (clientIds.get(key)) continue;
    const row = await insertOne(supabase, "clients", { organization_id: organizationId, name, status: "active", notes: "Created by previous shipment import." });
    clientIds.set(key, row.id);
    created.clients += 1;
  }
  for (const [key, name] of validation.createSets.truckTypes) {
    if (truckTypeIds.get(key)) continue;
    const row = await insertOne(supabase, "truck_types", { organization_id: organizationId, name, status: "active", description: "Created by previous shipment import." });
    truckTypeIds.set(key, row.id);
    created.truckTypes += 1;
  }
  for (const [key, driver] of validation.createSets.drivers) {
    if (driverIds.get(key)) continue;
    const row = await insertOne(supabase, "drivers", { organization_id: organizationId, name: driver.name, phone: driver.phone, status: "active", notes: "Created by previous shipment import." });
    driverIds.set(key, row.id);
    created.drivers += 1;
  }
  for (const [key, vehicle] of validation.createSets.vehicles) {
    if (vehicleIds.get(key)) continue;
    const row = await insertOne(supabase, "vehicles", {
      organization_id: organizationId,
      vehicle_number: vehicle.vehicleNumber,
      driver_id: driverIds.get(vehicle.driverKey) ?? null,
      truck_type_id: truckTypeIds.get(vehicle.truckTypeKey) ?? null,
      status: "active",
      notes: "Created by previous shipment import.",
    });
    vehicleIds.set(key, row.id);
    created.vehicles += 1;
  }

  for (const plan of validation.plans) {
    const shipment = await insertOne(supabase, "shipments", {
      organization_id: organizationId,
      import_ref: plan.invoiceNumber,
      shipment_no: plan.invoiceNumber,
      invoice_reference: plan.invoiceNumber,
      shipment_date: plan.shipmentDate,
      client_id: clientIds.get(plan.clientKey) ?? null,
      driver_id: driverIds.get(plan.driverKey) ?? null,
      vehicle_id: vehicleIds.get(plan.vehicleKey) ?? null,
      truck_type_id: truckTypeIds.get(plan.truckTypeKey) ?? null,
      loading_point: plan.loadingPoint,
      destination: plan.destination,
      company_rate: plan.companyRate,
      driver_rate: plan.driverRate,
      status: plan.shipmentStatus,
      remarks: plan.remarks,
    });
    shipmentIds.set(plan.invoiceNumber, shipment.id);
    created.shipments += 1;

    for (const expense of plan.expenses) {
      await insertOne(supabase, "shipment_expenses", {
        organization_id: organizationId,
        shipment_id: shipment.id,
        category: expense.category,
        amount: expense.actualCostAmount,
        client_bill_amount: expense.clientBillAmount,
        paid_by: expense.paidBy,
        client_billable: expense.clientBillable,
        driver_reimbursable: expense.driverReimbursable,
        approved: true,
        included_in_invoice: expense.clientBillable,
        expense_date: plan.shipmentDate,
        notes: `[previous-import:${plan.invoiceNumber}] ${expense.description}`,
      });
      created.expenses += 1;
    }

    if (plan.driverAdvance > 0) {
      await insertOne(supabase, "driver_payments", {
        organization_id: organizationId,
        driver_id: driverIds.get(plan.driverKey),
        shipment_id: shipment.id,
        amount: plan.driverAdvance,
        payment_type: "advance",
        payment_date: plan.shipmentDate,
        payment_method: "Legacy Import",
        reference_no: plan.invoiceNumber,
        notes: `[previous-import:${plan.invoiceNumber}] driver_advance_amount`,
      });
      created.driverPayments += 1;
    }
    if (plan.driverSettlementPaid > 0) {
      await insertOne(supabase, "driver_payments", {
        organization_id: organizationId,
        driver_id: driverIds.get(plan.driverKey),
        shipment_id: shipment.id,
        amount: plan.driverSettlementPaid,
        payment_type: "settlement",
        payment_date: plan.shipmentDate,
        payment_method: "Legacy Import",
        reference_no: plan.invoiceNumber,
        notes: `[previous-import:${plan.invoiceNumber}] driver_settlement_paid_amount`,
      });
      created.driverPayments += 1;
    }
    if (plan.clientPaymentReceived > 0) {
      const invoice = await insertOne(supabase, "invoices", {
        organization_id: organizationId,
        invoice_number: plan.invoiceNumber,
        shipment_id: shipment.id,
        client_id: clientIds.get(plan.clientKey) ?? null,
        issue_date: plan.shipmentDate,
        status: "draft",
        client_snapshot: { name: plan.clientName },
        shipment_snapshot: { invoice: plan.invoiceNumber, destination: plan.destination },
        subtotal: plan.companyRate,
        expense_total: roundMoney(plan.financials.clientRevenue - plan.companyRate),
        total_amount: plan.financials.clientRevenue,
        notes: `[previous-import:${plan.invoiceNumber}] Created to link imported client payment.`,
      });
      created.invoices += 1;
      await insertOne(supabase, "client_payments", {
        organization_id: organizationId,
        invoice_id: invoice.id,
        client_id: clientIds.get(plan.clientKey),
        shipment_id: shipment.id,
        amount: plan.clientPaymentReceived,
        payment_date: plan.shipmentDate,
        payment_method: "Legacy Import",
        reference_no: plan.invoiceNumber,
        notes: `[previous-import:${plan.invoiceNumber}] client_payment_received_amount`,
      });
      created.clientPayments += 1;
    }
  }

  return { created, shipmentIds: [...shipmentIds.keys()] };
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Previous shipment import ${report.mode}`);
  console.log("--------------------------------");
  console.log(`Organization: ${report.organization.name} (${report.organization.slug})`);
  console.log(`File: ${report.inputPath}`);
  Object.entries(report.summary).forEach(([key, value]) => console.log(`${key}: ${value}`));
  if (report.errors.length) {
    console.log("Errors:");
    report.errors.slice(0, 50).forEach((error) => console.log(`- Row ${error.rowNumber} ${error.invoiceNumber}: ${error.message}`));
  }
  if (report.warnings.length) {
    console.log("Warnings:");
    report.warnings.slice(0, 50).forEach((warning) => console.log(`- Row ${warning.rowNumber} ${warning.invoiceNumber}: ${warning.message}`));
  }
  console.log("Matched records:");
  console.log(JSON.stringify(report.matchedRecords, null, 2));
  console.log("Records to create:");
  console.log(JSON.stringify(report.recordsToCreate, null, 2));
  console.log("Calculated totals:");
  console.log(JSON.stringify(report.calculatedTotals, null, 2));
  if (report.applyResult) {
    console.log("Apply result:");
    console.log(JSON.stringify(report.applyResult, null, 2));
  }
}

async function main() {
  const args = parseArgs();
  if (args.preview === args.apply) throw new Error("Choose exactly one mode: --preview or --apply.");
  const { headers, rows } = await parseImportFile(args.inputPath);
  const supabase = requireSupabase();
  const organization = await getOrganization(supabase, args.orgSlug);
  const master = await fetchMasterData(supabase, organization.id);
  const validation = validateRows(rows, headers, master);
  const report = summarizePreview({ organization, inputPath: args.inputPath, rows, validation });

  if (args.preview) {
    printReport(report, args.json);
    if (validation.errors.length) process.exitCode = 1;
    return;
  }

  if (validation.errors.length) {
    report.mode = "apply-blocked";
    printReport(report, args.json);
    throw new Error("Apply blocked because preview has errors.");
  }

  report.mode = "apply";
  report.applyResult = await applyImport(supabase, organization.id, validation);
  printReport(report, args.json);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
