import type { Shipment, ShipmentExpense } from "../types/domain";
import { getExpenseDriverPayAmount, roundMoney } from "../domain/financials";

export type PayDriverExpenseRow = {
  id: string;
  category: ShipmentExpense["category"];
  amount: number;
  date: string;
  notes: string | null;
};

/**
 * Expenses that carry an amount for the driver, oldest first. A new expense's Pay driver amount is for reference only;
 * an older driver-reimbursable expense is listed at what it adds to the driver's total.
 */
export function selectPayDriverExpenses(expenses: ShipmentExpense[]): PayDriverExpenseRow[] {
  return expenses
    .filter((expense) => !expense.deletedAt)
    .map((expense) => ({
      id: expense.id,
      category: expense.category,
      amount: expense.driverReimbursable ? getExpenseDriverPayAmount(expense) : roundMoney(expense.driverPayAmount ?? 0),
      date: expense.expenseDate,
      notes: expense.notes,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type DriverRateRow = { key: string; driverName: string; amount: number };

/** The agreed rate per driver: one row per assignment, or the shipment's own driver and rate when there are none. */
export function getDriverRateRows(shipment: Pick<Shipment, "assignments" | "driverName" | "driverRate">): DriverRateRow[] {
  if (shipment.assignments?.length) {
    return shipment.assignments.map((assignment, index) => ({
      key: assignment.id ?? `${assignment.driverId ?? "driver"}-${index}`,
      driverName: assignment.driverName,
      amount: roundMoney(assignment.driverRate),
    }));
  }
  return shipment.driverRate > 0
    ? [{ key: "driver-rate", driverName: shipment.driverName, amount: roundMoney(shipment.driverRate) }]
    : [];
}

/** True when the expense's company bill amount is part of the Company total (approved, billable, not deleted). */
export function isCountedInCompanyTotal(expense: ShipmentExpense): boolean {
  return !expense.deletedAt && expense.approved && expense.clientBillable;
}
