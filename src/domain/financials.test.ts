import { describe, expect, it } from "vitest";
import type { ClientPayment, DriverPayment, Invoice, Shipment, ShipmentExpense } from "../types/domain";
import {
  calculateInvoiceBalance,
  calculateShipmentProjection,
  moneyToMinor,
  roundMoney,
  signedClientPaymentAmount,
  sumMoney,
} from "./financials";

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "shipment-1",
    organizationId: "org-1",
    sr: 1,
    shipmentNo: "SHP-001",
    date: "2026-07-01",
    invoice: "SHP-001",
    invoiceReference: null,
    clientId: "client-1",
    driverId: "driver-1",
    vehicleId: "vehicle-1",
    truckTypeId: "type-1",
    status: "delivered",
    loadingPoint: "Karachi",
    destination: "Lahore",
    customer: "Acme",
    driverName: "Driver One",
    vehicleNo: "ABC-123",
    truckType: "Container",
    cellNo: "",
    companyRate: 1000,
    driverRate: 600,
    advance: 0,
    gatePass: 0,
    fashah: 0,
    naql: 0,
    companyTotal: 1000,
    driverTotal: 600,
    pending: 600,
    netProfit: 400,
    driverPaymentStatus: "Pending",
    invoiceStatus: "Draft",
    clientPaymentStatus: "Pending",
    remarks: "",
    billImages: [],
    assignments: [{
      id: "assignment-1",
      driverId: "driver-1",
      driverName: "Driver One",
      legOrder: 1,
      fromLocation: "Karachi",
      toLocation: "Lahore",
      driverRate: 600,
      notes: "",
    }],
    ...overrides,
  };
}

function expense(overrides: Partial<ShipmentExpense> = {}): ShipmentExpense {
  return {
    id: "expense-1",
    organizationId: "org-1",
    shipmentId: "shipment-1",
    shipmentAssignmentId: null,
    category: "toll",
    amount: 100,
    actualCostAmount: 100,
    clientBillAmount: 100,
    paidBy: "company",
    clientBillable: false,
    driverReimbursable: false,
    approved: true,
    includedInInvoice: false,
    expenseDate: "2026-07-01",
    notes: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function driverPayment(overrides: Partial<DriverPayment> = {}): DriverPayment {
  return {
    id: "driver-payment-1",
    organizationId: "org-1",
    driverId: "driver-1",
    shipmentId: "shipment-1",
    shipmentAssignmentId: "assignment-1",
    amount: 200,
    direction: 1,
    reversalOfId: null,
    paymentType: "advance",
    paymentDate: "2026-07-01",
    paymentMethod: null,
    referenceNo: null,
    notes: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "invoice-1",
    organizationId: "org-1",
    invoiceNumber: "AT-0001",
    invoicePrefix: "AT",
    shipmentId: "shipment-1",
    clientId: "client-1",
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    status: "sent",
    clientSnapshot: { name: "Acme" },
    shipmentSnapshot: { destination: "Lahore" },
    subtotal: 1000,
    expenseTotal: 150,
    totalAmount: 1150,
    notes: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function clientPayment(overrides: Partial<ClientPayment> = {}): ClientPayment {
  return {
    id: "client-payment-1",
    organizationId: "org-1",
    invoiceId: "invoice-1",
    clientId: "client-1",
    shipmentId: "shipment-1",
    amount: 400,
    direction: 1,
    reversalOfId: null,
    paymentDate: "2026-07-05",
    paymentMethod: null,
    referenceNo: null,
    notes: null,
    createdAt: "2026-07-05T00:00:00Z",
    updatedAt: "2026-07-05T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("canonical money arithmetic", () => {
  it("rounds at the minor-unit boundary", () => {
    expect(moneyToMinor(0.1 + 0.2)).toBe(30);
    expect(roundMoney(10.005)).toBe(10.01);
    expect(sumMoney([0.1, 0.2, 10.005])).toBe(10.31);
  });
});

describe("shipment golden scenarios", () => {
  it("calculates a base shipment with no expenses or payments", () => {
    const result = calculateShipmentProjection(shipment());
    expect(result.estimatedClientRevenue).toBe(1000);
    expect(result.baseDriverPayable).toBe(600);
    expect(result.totalCost).toBe(600);
    expect(result.estimatedProfit).toBe(400);
    expect(result.driverBalance).toBe(600);
    expect(result.driverStatus).toBe("Pending");
  });

  it("counts a company-paid billable expense once and preserves markup", () => {
    const result = calculateShipmentProjection(shipment(), [expense({
      clientBillable: true,
      includedInInvoice: true,
      clientBillAmount: 150,
    })]);
    expect(result.estimatedClientRevenue).toBe(1150);
    expect(result.invoiceReadyRevenue).toBe(1150);
    expect(result.companyOperationalCost).toBe(100);
    expect(result.totalCost).toBe(700);
    expect(result.expenseMarkupProfit).toBe(50);
    expect(result.estimatedProfit).toBe(450);
  });

  it("adds a driver-paid reimbursable expense to the correct assignment payable", () => {
    const result = calculateShipmentProjection(shipment(), [expense({
      shipmentAssignmentId: "assignment-1",
      paidBy: "driver",
      driverReimbursable: true,
    })]);
    expect(result.driverReimbursementsPayable).toBe(100);
    expect(result.companyOperationalCost).toBe(100);
    expect(result.assignmentSettlements[0].payable).toBe(700);
    expect(result.driverBalance).toBe(700);
    expect(result.totalCost).toBe(700);
  });

  it("does not authorize unapproved expenses", () => {
    const result = calculateShipmentProjection(shipment(), [expense({ approved: false, clientBillable: true })]);
    expect(result.estimatedClientRevenue).toBe(1000);
    expect(result.companyOperationalCost).toBe(0);
    expect(result.approvedExpenses).toBe(0);
  });

  it("keeps approved excluded charges out of invoice-ready revenue", () => {
    const result = calculateShipmentProjection(shipment(), [expense({
      clientBillable: true,
      includedInInvoice: false,
      clientBillAmount: 150,
    })]);
    expect(result.estimatedClientRevenue).toBe(1150);
    expect(result.invoiceReadyRevenue).toBe(1000);
  });

  it("allocates advances per assignment without double counting", () => {
    const multi = shipment({
      driverRate: 1000,
      assignments: [
        { id: "assignment-1", driverId: "driver-1", driverName: "One", legOrder: 1, fromLocation: "A", toLocation: "B", driverRate: 600, notes: "" },
        { id: "assignment-2", driverId: "driver-2", driverName: "Two", legOrder: 2, fromLocation: "B", toLocation: "C", driverRate: 400, notes: "" },
      ],
    });
    const result = calculateShipmentProjection(multi, [], [
      driverPayment(),
      driverPayment({ id: "driver-payment-2", driverId: "driver-2", shipmentAssignmentId: "assignment-2", amount: 100, paymentType: "settlement" }),
    ]);
    expect(result.baseDriverPayable).toBe(1000);
    expect(result.driverPaid).toBe(300);
    expect(result.driverBalance).toBe(700);
    expect(result.assignmentSettlements[0].totalPaid).toBe(200);
    expect(result.assignmentSettlements[0].advancePaid).toBe(200);
    expect(result.assignmentSettlements[0].balance).toBe(400);
    expect(result.assignmentSettlements[1].totalPaid).toBe(100);
    expect(result.assignmentSettlements[1].advancePaid).toBe(0);
    expect(result.assignmentSettlements[1].balance).toBe(300);
  });

  it("does not count a backend-voided payment in assignment or shipment balances", () => {
    const voided = driverPayment({ deletedAt: "2026-07-02T00:00:00Z" });
    const result = calculateShipmentProjection(shipment(), [], [voided]);
    expect(result.driverPaid).toBe(0);
    expect(result.driverBalance).toBe(600);
    expect(result.assignmentSettlements[0].totalPaid).toBe(0);
    expect(result.assignmentSettlements[0].advancePaid).toBe(0);
    expect(result.assignmentSettlements[0].balance).toBe(600);
  });

  it("flags ambiguous multi-driver reimbursement allocation", () => {
    const multi = shipment({
      assignments: [
        { id: "assignment-1", driverId: "driver-1", driverName: "One", legOrder: 1, fromLocation: "A", toLocation: "B", driverRate: 600, notes: "" },
        { id: "assignment-2", driverId: "driver-2", driverName: "Two", legOrder: 2, fromLocation: "B", toLocation: "C", driverRate: 400, notes: "" },
      ],
    });
    const result = calculateShipmentProjection(multi, [expense({ paidBy: "driver", driverReimbursable: true })]);
    expect(result.warnings.some((warning) => warning.code === "UNALLOCATED_DRIVER_EXPENSE")).toBe(true);
  });

  it("nets a reversal instead of deleting ledger history", () => {
    const original = driverPayment();
    const reversal = driverPayment({
      id: "driver-payment-reversal",
      direction: -1,
      reversalOfId: original.id,
      paymentType: "adjustment",
    });
    const result = calculateShipmentProjection(shipment(), [], [original, reversal]);
    expect(result.driverPaid).toBe(0);
    expect(result.driverBalance).toBe(600);
  });
});

describe("invoice balance golden scenarios", () => {
  it("derives an exact partial balance", () => {
    const result = calculateInvoiceBalance(invoice(), [clientPayment()], new Date("2026-07-10T00:00:00Z"));
    expect(result.paid).toBe(400);
    expect(result.balance).toBe(750);
    expect(result.status).toBe("Partially Paid");
    expect(result.overdue).toBe(false);
  });

  it("derives overdue from due date and open balance", () => {
    const result = calculateInvoiceBalance(invoice(), [], new Date("2026-07-20T00:00:00Z"));
    expect(result.balance).toBe(1150);
    expect(result.status).toBe("Overdue");
    expect(result.overdue).toBe(true);
  });

  it("shows a credit balance rather than clamping an overpayment", () => {
    const result = calculateInvoiceBalance(invoice(), [clientPayment({ amount: 1200 })], new Date("2026-07-10T00:00:00Z"));
    expect(result.balance).toBe(-50);
    expect(result.status).toBe("Credit Balance");
  });

  it("nets client payment reversal entries", () => {
    const original = clientPayment();
    const reversal = clientPayment({ id: "client-reversal", direction: -1, reversalOfId: original.id });
    expect(signedClientPaymentAmount(reversal)).toBe(-400);
    const result = calculateInvoiceBalance(invoice(), [original, reversal], new Date("2026-07-10T00:00:00Z"));
    expect(result.paid).toBe(0);
    expect(result.balance).toBe(1150);
    expect(result.status).toBe("Pending");
  });
});
