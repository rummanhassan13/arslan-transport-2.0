import { requireSupabaseClient } from "../lib/supabase";
import type {
  ClientPayment,
  ClientPaymentInput,
  ClientPaymentUpdateInput,
  DriverPayment,
  DriverPaymentInput,
  DriverPaymentUpdateInput,
} from "../types/domain";

type NamedRelation = { name: string | null } | { name: string | null }[] | null;
type ShipmentRelation = { shipment_no: string | null; invoice_reference: string | null } | { shipment_no: string | null; invoice_reference: string | null }[] | null;
type InvoiceRelation = { invoice_number: string | null } | { invoice_number: string | null }[] | null;

type ClientPaymentRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  client_id: string;
  shipment_id: string | null;
  amount: number;
  direction?: 1 | -1;
  reversal_of_id?: string | null;
  idempotency_key?: string | null;
  payment_date: string;
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  invoices?: InvoiceRelation;
  clients?: NamedRelation;
  shipments?: ShipmentRelation;
};

type DriverPaymentRow = {
  id: string;
  organization_id: string;
  driver_id: string;
  shipment_id: string | null;
  shipment_assignment_id?: string | null;
  amount: number;
  direction?: 1 | -1;
  reversal_of_id?: string | null;
  idempotency_key?: string | null;
  payment_type: DriverPayment["paymentType"];
  payment_date: string;
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  drivers?: NamedRelation;
  shipments?: ShipmentRelation;
};

const clientPaymentSelect =
  "id, organization_id, invoice_id, client_id, shipment_id, amount, direction, reversal_of_id, idempotency_key, payment_date, payment_method, reference_no, notes, created_at, updated_at, deleted_at, invoices(invoice_number), clients(name), shipments(shipment_no, invoice_reference)";
const driverPaymentSelect =
  "id, organization_id, driver_id, shipment_id, shipment_assignment_id, amount, direction, reversal_of_id, idempotency_key, payment_type, payment_date, payment_method, reference_no, notes, created_at, updated_at, deleted_at, drivers(name), shipments(shipment_no, invoice_reference)";

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function relationName(relation: NamedRelation | undefined) {
  return firstRelation(relation)?.name ?? null;
}

function shipmentReference(relation: ShipmentRelation | undefined) {
  const shipment = firstRelation(relation);
  return shipment?.invoice_reference || shipment?.shipment_no || null;
}

function invoiceNumber(relation: InvoiceRelation | undefined) {
  return firstRelation(relation)?.invoice_number ?? null;
}

function toClientPayment(row: ClientPaymentRow): ClientPayment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    clientId: row.client_id,
    shipmentId: row.shipment_id,
    amount: Number(row.amount),
    direction: row.direction ?? 1,
    reversalOfId: row.reversal_of_id ?? null,
    idempotencyKey: row.idempotency_key ?? null,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    referenceNo: row.reference_no,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    invoiceNumber: invoiceNumber(row.invoices),
    clientName: relationName(row.clients),
    shipmentReference: shipmentReference(row.shipments),
  };
}

function toDriverPayment(row: DriverPaymentRow): DriverPayment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    driverId: row.driver_id,
    shipmentId: row.shipment_id,
    shipmentAssignmentId: row.shipment_assignment_id ?? null,
    amount: Number(row.amount),
    direction: row.direction ?? 1,
    reversalOfId: row.reversal_of_id ?? null,
    idempotencyKey: row.idempotency_key ?? null,
    paymentType: row.payment_type,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    referenceNo: row.reference_no,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    driverName: relationName(row.drivers),
    shipmentReference: shipmentReference(row.shipments),
  };
}

function clientPaymentPayload(input: ClientPaymentInput | ClientPaymentUpdateInput) {
  return {
    ...(input.invoiceId !== undefined ? { invoice_id: input.invoiceId } : {}),
    ...(input.clientId !== undefined ? { client_id: input.clientId } : {}),
    ...(input.shipmentId !== undefined ? { shipment_id: input.shipmentId } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.paymentDate !== undefined ? { payment_date: input.paymentDate } : {}),
    ...(input.paymentMethod !== undefined ? { payment_method: input.paymentMethod } : {}),
    ...(input.referenceNo !== undefined ? { reference_no: input.referenceNo } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

function driverPaymentPayload(input: DriverPaymentInput | DriverPaymentUpdateInput) {
  return {
    ...(input.driverId !== undefined ? { driver_id: input.driverId } : {}),
    ...(input.shipmentId !== undefined ? { shipment_id: input.shipmentId } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.paymentType !== undefined ? { payment_type: input.paymentType } : {}),
    ...(input.paymentDate !== undefined ? { payment_date: input.paymentDate } : {}),
    ...(input.paymentMethod !== undefined ? { payment_method: input.paymentMethod } : {}),
    ...(input.referenceNo !== undefined ? { reference_no: input.referenceNo } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listClientPayments(organizationId: string): Promise<ClientPayment[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("client_payments")
    .select(clientPaymentSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("payment_date", { ascending: false });

  if (error) throw new Error(`Unable to load client payments: ${error.message}`);
  return ((data ?? []) as ClientPaymentRow[]).map(toClientPayment);
}

export async function createClientPayment(organizationId: string, input: ClientPaymentInput): Promise<ClientPayment> {
  const supabase = requireSupabaseClient();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const { data: paymentId, error } = await supabase.rpc("record_client_payment", {
    p_organization_id: organizationId,
    p_invoice_id: input.invoiceId,
    p_client_id: input.clientId,
    p_shipment_id: input.shipmentId ?? null,
    p_amount: input.amount,
    p_payment_date: input.paymentDate ?? new Date().toISOString().slice(0, 10),
    p_payment_method: input.paymentMethod ?? null,
    p_reference_no: input.referenceNo ?? null,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotencyKey ?? `client-payment-${crypto.randomUUID()}`,
  });
  if (error) throw new Error(`Unable to record client payment: ${error.message}`);
  const { data, error: loadError } = await supabase
    .from("client_payments")
    .select(clientPaymentSelect)
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .single();
  if (loadError) throw new Error(`Payment was committed but could not be reloaded: ${loadError.message}`);
  return toClientPayment(data as ClientPaymentRow);
}

export async function updateClientPayment(organizationId: string, paymentId: string, input: ClientPaymentUpdateInput): Promise<ClientPayment> {
  void organizationId;
  void paymentId;
  void input;
  throw new Error("Posted payments are immutable. Reverse the payment and record a corrected entry.");
}

export async function softDeleteClientPayment(organizationId: string, paymentId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("void_client_payment", {
    p_organization_id: organizationId,
    p_payment_id: paymentId,
    p_reason: "Deleted from the payment ledger UI",
  });
  if (error) throw new Error(`Unable to delete client payment: ${error.message}. Apply migration 016_payment_void_workflows.sql if this workflow is unavailable.`);
}

export async function listDriverPayments(organizationId: string): Promise<DriverPayment[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("driver_payments")
    .select(driverPaymentSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("payment_date", { ascending: false });

  if (error) throw new Error(`Unable to load driver payments: ${error.message}`);
  return ((data ?? []) as DriverPaymentRow[]).map(toDriverPayment);
}

export async function createDriverPayment(organizationId: string, input: DriverPaymentInput): Promise<DriverPayment> {
  const supabase = requireSupabaseClient();
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  if (!input.shipmentId) throw new Error("Driver payments must be linked to a shipment.");
  const { data: paymentId, error } = await supabase.rpc("record_driver_payment", {
    p_organization_id: organizationId,
    p_driver_id: input.driverId,
    p_shipment_id: input.shipmentId,
    p_shipment_assignment_id: input.shipmentAssignmentId ?? null,
    p_amount: input.amount,
    p_payment_type: input.paymentType ?? "settlement",
    p_payment_date: input.paymentDate ?? new Date().toISOString().slice(0, 10),
    p_payment_method: input.paymentMethod ?? null,
    p_reference_no: input.referenceNo ?? null,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotencyKey ?? `driver-payment-${crypto.randomUUID()}`,
  });
  if (error) throw new Error(`Unable to record driver payment: ${error.message}`);
  const { data, error: loadError } = await supabase
    .from("driver_payments")
    .select(driverPaymentSelect)
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .single();
  if (loadError) throw new Error(`Payment was committed but could not be reloaded: ${loadError.message}`);
  return toDriverPayment(data as DriverPaymentRow);
}

export async function updateDriverPayment(organizationId: string, paymentId: string, input: DriverPaymentUpdateInput): Promise<DriverPayment> {
  void organizationId;
  void paymentId;
  void input;
  throw new Error("Posted payments are immutable. Reverse the payment and record a corrected entry.");
}

export async function softDeleteDriverPayment(organizationId: string, paymentId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("void_driver_payment", {
    p_organization_id: organizationId,
    p_payment_id: paymentId,
    p_reason: "Deleted from the payment ledger UI",
  });
  if (error) throw new Error(`Unable to delete driver payment: ${error.message}. Apply migration 016_payment_void_workflows.sql if this workflow is unavailable.`);
}

export async function upsertDriverAdvancePayment(organizationId: string, shipmentId: string, driverId: string, amount: number): Promise<void> {
  void organizationId;
  void shipmentId;
  void driverId;
  void amount;
  throw new Error("Advance upserts are retired. Record an assignment-aware immutable advance ledger entry.");
}
