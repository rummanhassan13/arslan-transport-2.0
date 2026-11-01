import { describe, expect, it } from "vitest";
import type { Shipment, ShipmentExpense } from "../types/domain";
import { calculateShipmentProjection } from "../domain/financials";
import { getDriverRateRows, isCountedInCompanyTotal, selectPayDriverExpenses } from "./shipmentBreakdown";

const expense = (overrides: Partial<ShipmentExpense>) =>
  ({
    id: "e1",
    category: "toll",
    amount: 100,
    actualCostAmount: 100,
    clientBillAmount: 100,
    paidBy: "company",
    clientBillable: true,
    driverReimbursable: false,
    approved: true,
    includedInInvoice: true,
    expenseDate: "2026-07-01",
    notes: null,
    deletedAt: null,
    ...overrides,
  }) as ShipmentExpense;

describe("selectPayDriverExpenses", () => {
  it("lists only expenses with a Pay driver amount above zero, oldest first", () => {
    const rows = selectPayDriverExpenses([
      expense({ id: "late", driverPayAmount: 30, expenseDate: "2026-07-05" }),
      expense({ id: "none", driverPayAmount: null }),
      expense({ id: "zero", driverPayAmount: 0 }),
      expense({ id: "early", driverPayAmount: 80, expenseDate: "2026-07-02" }),
      expense({ id: "gone", driverPayAmount: 50, deletedAt: "2026-07-03T00:00:00Z" }),
    ]);
    expect(rows.map((row) => [row.id, row.amount])).toEqual([["early", 80], ["late", 30]]);
  });

  it("shows an older driver-reimbursable expense at what it adds to the driver's total", () => {
    const rows = selectPayDriverExpenses([
      expense({ id: "legacy", driverReimbursable: true, driverPayAmount: null, actualCostAmount: 120, amount: 120 }),
      expense({ id: "custom", driverReimbursable: true, driverPayAmount: 90 }),
    ]);
    expect(rows.map((row) => [row.id, row.amount])).toEqual([["legacy", 120], ["custom", 90]]);
  });
});

describe("getDriverRateRows", () => {
  it("returns one row per assignment", () => {
    const rows = getDriverRateRows({
      driverName: "Ignored",
      driverRate: 0,
      assignments: [
        { id: "a1", driverId: "d1", driverName: "One", driverRate: 600 },
        { driverId: "d2", driverName: "Two", driverRate: 250.5 },
      ],
    } as Pick<Shipment, "assignments" | "driverName" | "driverRate">);
    expect(rows.map((row) => [row.driverName, row.amount])).toEqual([["One", 600], ["Two", 250.5]]);
  });

  it("falls back to the shipment's own driver and rate, and is empty without a rate", () => {
    expect(getDriverRateRows({ driverName: "Solo", driverRate: 400 } as Pick<Shipment, "assignments" | "driverName" | "driverRate">))
      .toEqual([{ key: "driver-rate", driverName: "Solo", amount: 400 }]);
    expect(getDriverRateRows({ driverName: "Solo", driverRate: 0 } as Pick<Shipment, "assignments" | "driverName" | "driverRate">)).toEqual([]);
  });
});

describe("Company expenses total", () => {
  it("company rate plus counted company bills equals the projection's company total", () => {
    const shipment = { companyRate: 1000, driverRate: 600, assignments: [] } as unknown as Shipment;
    const expenses = [
      expense({ id: "billed", clientBillAmount: 150 }),
      expense({ id: "not-billable", clientBillable: false, clientBillAmount: 70 }),
      expense({ id: "unapproved", approved: false, clientBillAmount: 40 }),
    ];
    const counted = expenses.filter(isCountedInCompanyTotal).reduce((sum, item) => sum + (item.clientBillAmount ?? 0), 0);
    expect(isCountedInCompanyTotal(expenses[1])).toBe(false);
    expect(isCountedInCompanyTotal(expenses[2])).toBe(false);
    expect(1000 + counted).toBe(calculateShipmentProjection(shipment, expenses).estimatedClientRevenue);
  });
});
