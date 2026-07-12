import type {
  ClientPayment,
  DriverPayment,
  Invoice,
  PaymentStatus,
  Shipment,
  ShipmentDriverAssignment,
  ShipmentExpense,
} from "../types/domain";

export type FinancialWarning = {
  code: "UNALLOCATED_DRIVER_EXPENSE" | "UNALLOCATED_DRIVER_PAYMENT" | "DUPLICATE_ASSIGNMENT_DRIVER";
  message: string;
};

export type AssignmentSettlementProjection = {
  assignmentId: string | null;
  driverId: string | null;
  basePayable: number;
  reimbursableExpenses: number;
  payable: number;
  advancePaid: number;
  totalPaid: number;
  balance: number;
  status: PaymentStatus;
};

export type ShipmentFinancialProjection = {
  baseClientCharge: number;
  approvedClientCharge: number;
  invoiceReadyExpenseCharge: number;
  estimatedClientRevenue: number;
  invoiceReadyRevenue: number;
  baseDriverPayable: number;
  driverReimbursementsPayable: number;
  companyOperationalCost: number;
  totalCost: number;
  estimatedProfit: number;
  expenseMarkupProfit: number;
  approvedExpenses: number;
  companyPaidCost: number;
  companyPaidNonBillable: number;
  assignmentSettlements: AssignmentSettlementProjection[];
  driverPaid: number;
  driverBalance: number;
  driverStatus: PaymentStatus;
  warnings: FinancialWarning[];
};

export type InvoiceBalanceProjection = {
  total: number;
  paid: number;
  balance: number;
  status: PaymentStatus;
  overdue: boolean;
};

/** Convert at the domain boundary so binary floating-point drift cannot leak. */
export function moneyToMinor(value: number | string | null | undefined): number {
  const numeric = typeof value === "string" ? Number(value) : value ?? 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100);
}

export function minorToMoney(value: number): number {
  return value / 100;
}

export function roundMoney(value: number | string | null | undefined): number {
  return minorToMoney(moneyToMinor(value));
}

export function sumMoney(values: Array<number | string | null | undefined>): number {
  return minorToMoney(values.reduce<number>((total, value) => total + moneyToMinor(value), 0));
}

export function signedClientPaymentAmount(payment: ClientPayment): number {
  return roundMoney(payment.amount * (payment.direction ?? 1));
}

export function signedDriverPaymentAmount(payment: DriverPayment): number {
  return roundMoney(payment.amount * (payment.direction ?? 1));
}

export function getExpenseActualCost(expense: ShipmentExpense): number {
  return roundMoney(expense.actualCostAmount ?? expense.amount ?? 0);
}

export function getExpenseClientBillAmount(expense: ShipmentExpense): number {
  return roundMoney(expense.clientBillAmount ?? expense.amount ?? 0);
}

export function getExpenseMarkupProfit(expense: ShipmentExpense): number {
  return roundMoney(getExpenseClientBillAmount(expense) - getExpenseActualCost(expense));
}

export function deriveBalanceStatus(
  originalTotal: number,
  paid: number,
  options: { overdue?: boolean; hasAdvance?: boolean } = {},
): PaymentStatus {
  const totalMinor = moneyToMinor(originalTotal);
  const paidMinor = moneyToMinor(paid);
  const balanceMinor = totalMinor - paidMinor;
  if (balanceMinor < 0) return "Credit Balance";
  if (totalMinor > 0 && balanceMinor === 0) return "Paid";
  if (paidMinor > 0 && paidMinor < totalMinor) return options.hasAdvance ? "Advance Paid" : "Partially Paid";
  if (options.overdue && balanceMinor > 0) return "Overdue";
  return "Pending";
}

function assignmentKey(assignment: ShipmentDriverAssignment, index: number) {
  return assignment.id ?? `unpersisted-${index}`;
}

function activeExpenses(expenses: ShipmentExpense[]) {
  return expenses.filter((expense) => !expense.deletedAt && expense.approved);
}

function baseDriverAssignments(shipment: Shipment): ShipmentDriverAssignment[] {
  if (shipment.assignments?.length) return shipment.assignments;
  if (!shipment.driverId && !shipment.driverRate) return [];
  return [{
    id: undefined,
    driverId: shipment.driverId ?? null,
    driverName: shipment.driverName,
    legOrder: 1,
    fromLocation: shipment.loadingPoint,
    toLocation: shipment.destination,
    driverRate: roundMoney(shipment.driverRate),
    notes: "Legacy shipment-level assignment",
  }];
}

function paymentsForAssignment(
  payments: DriverPayment[],
  assignment: ShipmentDriverAssignment,
  assignmentCount: number,
) {
  return payments.filter((payment) => {
    if (payment.shipmentAssignmentId && assignment.id) return payment.shipmentAssignmentId === assignment.id;
    if (assignmentCount === 1) return payment.driverId === assignment.driverId;
    return !payment.shipmentAssignmentId && payment.driverId === assignment.driverId;
  });
}

export function calculateShipmentProjection(
  shipment: Shipment,
  expenses: ShipmentExpense[] = [],
  driverPayments: DriverPayment[] = [],
): ShipmentFinancialProjection {
  const approved = activeExpenses(expenses);
  const activeDriverPayments = driverPayments.filter((payment) => !payment.deletedAt);
  const assignments = baseDriverAssignments(shipment);
  const warnings: FinancialWarning[] = [];
  const driverIds = assignments.map((assignment) => assignment.driverId).filter(Boolean);
  if (new Set(driverIds).size !== driverIds.length) {
    warnings.push({
      code: "DUPLICATE_ASSIGNMENT_DRIVER",
      message: "A driver is assigned to multiple legs; assignment allocation is required for exact settlement.",
    });
  }

  const baseClientCharge = roundMoney(shipment.companyRate);
  const approvedClientCharge = sumMoney(
    approved.filter((expense) => expense.clientBillable).map(getExpenseClientBillAmount),
  );
  const invoiceReadyExpenseCharge = sumMoney(
    approved.filter((expense) => expense.clientBillable && expense.includedInInvoice).map(getExpenseClientBillAmount),
  );
  const baseDriverPayable = sumMoney(assignments.map((assignment) => assignment.driverRate));
  const driverReimbursementsPayable = sumMoney(
    approved.filter((expense) => expense.driverReimbursable).map(getExpenseActualCost),
  );
  const companyOperationalCost = sumMoney(
    approved
      .filter((expense) => expense.paidBy === "company" || expense.driverReimbursable)
      .map(getExpenseActualCost),
  );
  const companyPaidCost = sumMoney(
    approved.filter((expense) => expense.paidBy === "company").map(getExpenseActualCost),
  );
  const companyPaidNonBillable = sumMoney(
    approved.filter((expense) => expense.paidBy === "company" && !expense.clientBillable).map(getExpenseActualCost),
  );
  const expenseMarkupProfit = sumMoney(
    approved.filter((expense) => expense.clientBillable).map(getExpenseMarkupProfit),
  );

  const assignmentSettlements = assignments.map((assignment, index): AssignmentSettlementProjection => {
    const assignmentId = assignment.id ?? null;
    const reimbursable = approved.filter((expense) => {
      if (!expense.driverReimbursable) return false;
      if (expense.shipmentAssignmentId && assignmentId) return expense.shipmentAssignmentId === assignmentId;
      if (assignments.length === 1) return true;
      return false;
    });
    const relevantPayments = paymentsForAssignment(activeDriverPayments, assignment, assignments.length);
    const basePayable = roundMoney(assignment.driverRate);
    const reimbursableExpenses = sumMoney(reimbursable.map(getExpenseActualCost));
    const payable = sumMoney([basePayable, reimbursableExpenses]);
    const totalPaid = sumMoney(relevantPayments.map(signedDriverPaymentAmount));
    const advancePaid = sumMoney(
      relevantPayments.filter((payment) => payment.paymentType === "advance").map(signedDriverPaymentAmount),
    );
    const balance = roundMoney(payable - totalPaid);
    return {
      assignmentId: assignmentId ?? assignmentKey(assignment, index),
      driverId: assignment.driverId,
      basePayable,
      reimbursableExpenses,
      payable,
      advancePaid,
      totalPaid,
      balance,
      status: deriveBalanceStatus(payable, totalPaid, { hasAdvance: advancePaid > 0 }),
    };
  });

  if (assignments.length > 1) {
    for (const expense of approved) {
      if (expense.driverReimbursable && !expense.shipmentAssignmentId) {
        warnings.push({
          code: "UNALLOCATED_DRIVER_EXPENSE",
          message: `Driver-reimbursable expense ${expense.category} is not allocated to an assignment.`,
        });
      }
    }
    for (const payment of activeDriverPayments) {
      const matchingAssignments = assignments.filter((assignment) => assignment.driverId === payment.driverId);
      if (!payment.shipmentAssignmentId && matchingAssignments.length !== 1) {
        warnings.push({
          code: "UNALLOCATED_DRIVER_PAYMENT",
          message: "A driver payment cannot be uniquely allocated to one assignment.",
        });
      }
    }
  }

  const estimatedClientRevenue = sumMoney([baseClientCharge, approvedClientCharge]);
  const invoiceReadyRevenue = sumMoney([baseClientCharge, invoiceReadyExpenseCharge]);
  const totalCost = sumMoney([baseDriverPayable, companyOperationalCost]);
  const driverPaid = sumMoney(activeDriverPayments.map(signedDriverPaymentAmount));
  const driverBalance = roundMoney(baseDriverPayable + driverReimbursementsPayable - driverPaid);

  return {
    baseClientCharge,
    approvedClientCharge,
    invoiceReadyExpenseCharge,
    estimatedClientRevenue,
    invoiceReadyRevenue,
    baseDriverPayable,
    driverReimbursementsPayable,
    companyOperationalCost,
    totalCost,
    estimatedProfit: roundMoney(estimatedClientRevenue - totalCost),
    expenseMarkupProfit,
    approvedExpenses: sumMoney(approved.map(getExpenseActualCost)),
    companyPaidCost,
    companyPaidNonBillable,
    assignmentSettlements,
    driverPaid,
    driverBalance,
    driverStatus: deriveBalanceStatus(baseDriverPayable + driverReimbursementsPayable, driverPaid, {
      hasAdvance: activeDriverPayments.some((payment) => payment.paymentType === "advance" && signedDriverPaymentAmount(payment) > 0),
    }),
    warnings,
  };
}

export function calculateInvoiceBalance(
  invoice: Invoice,
  payments: ClientPayment[] = [],
  today = new Date(),
): InvoiceBalanceProjection {
  const relevant = payments.filter((payment) => payment.invoiceId === invoice.id && !payment.deletedAt);
  const paid = sumMoney(relevant.map(signedClientPaymentAmount));
  const total = roundMoney(invoice.totalAmount);
  const balance = roundMoney(total - paid);
  const due = invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`) : null;
  const overdue = Boolean(
    invoice.status !== "cancelled" &&
    due &&
    !Number.isNaN(due.getTime()) &&
    due.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() &&
    balance > 0,
  );
  return {
    total,
    paid,
    balance,
    status: deriveBalanceStatus(total, paid, { overdue }),
    overdue,
  };
}
