import type { Shipment, ShipmentExpense, ShipmentFilters, ShipmentInput } from "../types/domain";
import { groupBy } from "./formatters";
import {
  calculateShipmentProjection,
  getExpenseActualCost,
  getExpenseClientBillAmount,
  getExpenseMarkupProfit,
  roundMoney,
  sumMoney,
} from "../domain/financials";

export { getExpenseActualCost, getExpenseClientBillAmount, getExpenseMarkupProfit } from "../domain/financials";

export type DashboardPeriod = "7D" | "30D" | "QTD" | "YTD";

export type DateRange = {
  start: Date;
  end: Date;
};

export function calculate(input: ShipmentInput) {
  const companyTotal = roundMoney(input.companyRate);
  const driverTotal = input.assignments?.length
    ? sumMoney(input.assignments.map((assignment) => assignment.driverRate))
    : roundMoney(input.driverRate);
  // Legacy input fields remain accepted during migration but are not financial
  // authorities. Expenses and advances are normalized in their ledger tables.
  const pending = roundMoney(driverTotal - roundMoney(input.advance));
  const netProfit = roundMoney(companyTotal - driverTotal);
  return { companyTotal, driverTotal, pending, netProfit };
}

export function buildStats(shipments: Shipment[]) {
  const revenue = sum(shipments, "companyTotal");
  const driverCost = sum(shipments, "driverTotal");
  const expenses = Math.max(driverCost - sum(shipments, "driverRate"), 0);
  const netProfit = sum(shipments, "netProfit");
  return {
    revenue,
    driverCost,
    expenses,
    netProfit,
    margin: revenue ? Math.round((netProfit / revenue) * 100) : 0,
    active: shipments.filter((row) => !["completed", "cancelled"].includes(row.status ?? "pending")).length,
    pendingDrivers: shipments.filter((row) => row.driverPaymentStatus !== "Paid").reduce((total, row) => total + row.pending, 0),
    pendingClients: shipments.reduce((total, row) => total + (row.clientBalance ?? (row.clientPaymentStatus === "Paid" ? 0 : row.companyTotal)), 0),
    invoicesSent: shipments.filter((row) => row.invoiceStatus === "Sent").length,
  };
}

export function monthlyData(shipments: Shipment[]) {
  const buckets = new Map<string, { date: Date; rows: Shipment[] }>();

  shipments.forEach((shipment) => {
    const date = parseShipmentMonth(shipment.date);
    if (!date) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const current = buckets.get(key) ?? { date, rows: [] };
    current.rows.push(shipment);
    buckets.set(key, current);
  });

  return [...buckets.entries()]
    .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
    .map(([key, bucket]) => ({
      key,
      month: bucket.date.toLocaleString("en", { month: "short", year: "numeric" }),
      revenue: sum(bucket.rows, "companyTotal"),
      driverCost: sum(bucket.rows, "driverTotal"),
      netProfit: sum(bucket.rows, "netProfit"),
      shipmentCount: bucket.rows.length,
    }));
}

export function getDateRangeForPeriod(period: DashboardPeriod, today = new Date()): DateRange {
  const end = startOfDay(today);
  let start: Date;

  if (period === "7D") {
    start = addDays(end, -6);
  } else if (period === "30D") {
    start = addDays(end, -29);
  } else if (period === "QTD") {
    start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
  } else {
    start = new Date(end.getFullYear(), 0, 1);
  }

  return { start, end };
}

export function isDateInRange(value: string | null | undefined, range: DateRange) {
  const date = parseBusinessDate(value);
  if (!date) return false;

  return date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime();
}

function parseShipmentMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    return new Date(year, month, 1);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function parseBusinessDate(value: string | null | undefined) {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function statusData(shipments: Shipment[]) {
  return groupBy(shipments, "clientPaymentStatus").map(([name, rows]) => ({ name, value: rows.length }));
}

export function profitBy(shipments: Shipment[], key: "customer" | "destination") {
  return groupBy(shipments, key).map(([name, rows]) => ({ name, profit: sum(rows, "netProfit") }));
}

export function filterShipments(shipments: Shipment[], query: string, filters: ShipmentFilters) {
  const normalized = query.toLowerCase();
  return shipments.filter((row) => {
    const searchable = [row.invoice, row.customer, row.driverName, row.vehicleNo, row.destination].join(" ").toLowerCase();
    const matchesClient = !filters.clientId || row.clientId === filters.clientId;
    return (
      searchable.includes(normalized) &&
      matchesClient &&
      (!filters.driver || row.driverName === filters.driver) &&
      (!filters.destination || row.destination === filters.destination) &&
      (!filters.invoiceStatus || row.invoiceStatus === filters.invoiceStatus) &&
      (!filters.clientPaymentStatus || row.clientPaymentStatus === filters.clientPaymentStatus) &&
      (!filters.driverPaymentStatus || row.driverPaymentStatus === filters.driverPaymentStatus)
    );
  });
}

export function sum(items: Shipment[], key: keyof Pick<Shipment, "companyTotal" | "driverTotal" | "driverRate" | "netProfit" | "gatePass" | "fashah" | "naql" | "advance" | "pending">) {
  return items.reduce((total, item) => total + Number(item[key]), 0);
}

export function getApprovedExpensesTotal(expenses: ShipmentExpense[]) {
  return sumMoney(expenses.filter((expense) => expense.approved).map(getExpenseActualCost));
}

export function getClientBillableExpensesTotal(expenses: ShipmentExpense[]) {
  return expenses
    .filter((expense) => expense.approved && expense.clientBillable && expense.includedInInvoice)
    .map(getExpenseClientBillAmount)
    .reduce((total, value) => roundMoney(total + value), 0);
}

export function getDriverReimbursableExpensesTotal(expenses: ShipmentExpense[]) {
  return expenses
    .filter((expense) => expense.approved && expense.driverReimbursable)
    .map(getExpenseActualCost)
    .reduce((total, value) => roundMoney(total + value), 0);
}

export function getCompanyPaidExpensesTotal(expenses: ShipmentExpense[]) {
  return expenses
    .filter((expense) => expense.approved && expense.paidBy === "company")
    .map(getExpenseActualCost)
    .reduce((total, value) => roundMoney(total + value), 0);
}

export function calculateShipmentFinancials(shipment: Shipment, expenses: ShipmentExpense[]) {
  const projection = calculateShipmentProjection(shipment, expenses);

  return {
    companyTotal: projection.estimatedClientRevenue,
    driverTotal: projection.baseDriverPayable + projection.driverReimbursementsPayable,
    estimatedProfit: projection.estimatedProfit,
    clientRevenue: projection.estimatedClientRevenue,
    totalCost: projection.totalCost,
    clientBillable: projection.invoiceReadyExpenseCharge,
    driverReimbursable: projection.driverReimbursementsPayable,
    companyPaidCost: projection.companyPaidCost,
    companyPaidNonBillable: projection.companyPaidNonBillable,
    expenseActualCost: projection.companyOperationalCost,
    expenseMarkupProfit: projection.expenseMarkupProfit,
    approvedExpenses: projection.approvedExpenses,
    warnings: projection.warnings,
  };
}
