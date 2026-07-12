import { requireSupabaseClient } from "../lib/supabase";
import type { ExpenseFilters, ShipmentExpense, ShipmentExpenseInput, ShipmentExpenseUpdateInput } from "../types/domain";

type ExpenseShipmentRelation =
  | {
      shipment_no: string | null;
      invoice_reference: string | null;
      clients?: { name: string | null } | { name: string | null }[] | null;
      drivers?: { name: string | null } | { name: string | null }[] | null;
    }
  | {
      shipment_no: string | null;
      invoice_reference: string | null;
      clients?: { name: string | null } | { name: string | null }[] | null;
      drivers?: { name: string | null } | { name: string | null }[] | null;
    }[]
  | null;

type ExpenseRow = {
  id: string;
  organization_id: string;
  shipment_id: string;
  shipment_assignment_id?: string | null;
  category: ShipmentExpense["category"];
  amount: number;
  client_bill_amount?: number | null;
  paid_by: ShipmentExpense["paidBy"];
  client_billable: boolean;
  driver_reimbursable: boolean;
  approved: boolean;
  included_in_invoice: boolean;
  expense_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  shipments?: ExpenseShipmentRelation;
};

export type ExpenseListFilters = ExpenseFilters;

const baseExpenseSelect =
  "id, organization_id, shipment_id, category, amount, paid_by, client_billable, driver_reimbursable, approved, included_in_invoice, expense_date, notes, created_at, updated_at, deleted_at, shipments(shipment_no, invoice_reference, clients(name), drivers(name))";
const expenseSelect =
  "id, organization_id, shipment_id, shipment_assignment_id, category, amount, client_bill_amount, paid_by, client_billable, driver_reimbursable, approved, included_in_invoice, expense_date, notes, created_at, updated_at, deleted_at, shipments(shipment_no, invoice_reference, clients(name), drivers(name))";

function isMissingClientBillAmountError(error: { message?: string; details?: string; hint?: string } | null) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  return text.includes("client_bill_amount");
}

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function relationName(relation: { name: string | null } | { name: string | null }[] | null | undefined) {
  const resolved = firstRelation(relation);
  return resolved?.name ?? null;
}

function toExpense(row: ExpenseRow): ShipmentExpense {
  const shipment = firstRelation(row.shipments);
  const actualCostAmount = Number(row.amount ?? 0);
  const clientBillAmount = row.client_bill_amount === null || row.client_bill_amount === undefined
    ? actualCostAmount
    : Number(row.client_bill_amount);
  return {
    id: row.id,
    organizationId: row.organization_id,
    shipmentId: row.shipment_id,
    shipmentAssignmentId: row.shipment_assignment_id ?? null,
    shipmentNo: shipment?.shipment_no ?? null,
    invoiceReference: shipment?.invoice_reference ?? null,
    clientName: relationName(shipment?.clients),
    driverName: relationName(shipment?.drivers),
    category: row.category,
    amount: actualCostAmount,
    actualCostAmount,
    clientBillAmount,
    paidBy: row.paid_by,
    clientBillable: row.client_billable,
    driverReimbursable: row.driver_reimbursable,
    approved: row.approved,
    includedInInvoice: row.included_in_invoice,
    expenseDate: row.expense_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toExpensePayload(input: ShipmentExpenseInput | ShipmentExpenseUpdateInput, includeClientBillAmount = true) {
  const actualCostAmount = input.actualCostAmount ?? input.amount;
  return {
    ...(input.shipmentId !== undefined ? { shipment_id: input.shipmentId } : {}),
    ...(input.shipmentAssignmentId !== undefined ? { shipment_assignment_id: input.shipmentAssignmentId } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(actualCostAmount !== undefined ? { amount: actualCostAmount } : {}),
    ...(includeClientBillAmount && input.clientBillAmount !== undefined ? { client_bill_amount: input.clientBillAmount } : {}),
    ...(input.paidBy !== undefined ? { paid_by: input.paidBy } : {}),
    ...(input.clientBillable !== undefined ? { client_billable: input.clientBillable } : {}),
    ...(input.driverReimbursable !== undefined ? { driver_reimbursable: input.driverReimbursable } : {}),
    ...(input.approved !== undefined ? { approved: input.approved } : {}),
    ...(input.includedInInvoice !== undefined ? { included_in_invoice: input.includedInInvoice } : {}),
    ...(input.expenseDate !== undefined ? { expense_date: input.expenseDate } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listExpenses(organizationId: string, filters: ExpenseListFilters = {}): Promise<ShipmentExpense[]> {
  const supabase = requireSupabaseClient();
  const buildQuery = (select: string) => {
    let query = supabase
      .from("shipment_expenses")
      .select(select)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false });

    if (filters.shipmentId) query = query.eq("shipment_id", filters.shipmentId);
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.paidBy) query = query.eq("paid_by", filters.paidBy);
    if (filters.approved === "approved") query = query.eq("approved", true);
    if (filters.approved === "pending") query = query.eq("approved", false);
    if (filters.dateFrom) query = query.gte("expense_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("expense_date", filters.dateTo);
    return query;
  };

  let { data, error } = await buildQuery(expenseSelect);
  if (error && isMissingClientBillAmountError(error)) {
    ({ data, error } = await buildQuery(baseExpenseSelect));
  }
  if (error) throw new Error(`Unable to load expenses: ${error.message}`);
  return ((data ?? []) as unknown as ExpenseRow[]).map(toExpense);
}

export async function listExpensesByShipment(organizationId: string, shipmentId: string): Promise<ShipmentExpense[]> {
  return listExpenses(organizationId, { shipmentId });
}

export async function createExpense(organizationId: string, input: ShipmentExpenseInput): Promise<ShipmentExpense> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();
  const defaultedInput: ShipmentExpenseInput = {
    paidBy: "company",
    clientBillable: true,
    driverReimbursable: false,
    approved: false,
    includedInInvoice: true,
    expenseDate: new Date().toISOString().slice(0, 10),
    ...input,
    actualCostAmount: input.actualCostAmount ?? input.amount,
    clientBillAmount: input.clientBillAmount ?? input.amount,
  };

  let { data, error } = await supabase
    .from("shipment_expenses")
    .insert({
      ...toExpensePayload(defaultedInput),
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select(expenseSelect)
    .single();

  if (error && isMissingClientBillAmountError(error)) {
    ({ data, error } = await supabase
      .from("shipment_expenses")
      .insert({
        ...toExpensePayload(defaultedInput, false),
        organization_id: organizationId,
        created_by: userId,
        updated_by: userId,
      })
      .select(baseExpenseSelect)
      .single());
  }

  if (error) throw new Error(`Unable to create expense: ${error.message}`);
  return toExpense(data as ExpenseRow);
}

export async function updateExpense(organizationId: string, expenseId: string, input: ShipmentExpenseUpdateInput): Promise<ShipmentExpense> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  let { data, error } = await supabase
    .from("shipment_expenses")
    .update({
      ...toExpensePayload(input),
      updated_by: userId,
    })
    .eq("id", expenseId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(expenseSelect)
    .single();

  if (error && isMissingClientBillAmountError(error)) {
    ({ data, error } = await supabase
      .from("shipment_expenses")
      .update({
        ...toExpensePayload(input, false),
        updated_by: userId,
      })
      .eq("id", expenseId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .select(baseExpenseSelect)
      .single());
  }

  if (error) throw new Error(`Unable to update expense: ${error.message}`);
  return toExpense(data as ExpenseRow);
}

export async function softDeleteExpense(organizationId: string, expenseId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("shipment_expenses")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", expenseId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete expense: ${error.message}`);
}
