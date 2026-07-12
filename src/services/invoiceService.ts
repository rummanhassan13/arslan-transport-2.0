import type { Invoice, InvoiceInput, InvoiceItem, InvoiceItemInput, InvoiceUpdateInput } from "../types/domain";
import { requireSupabaseClient } from "../lib/supabase";

type NamedRelation = { name: string | null } | { name: string | null }[] | null;
type ShipmentRelation =
  | { shipment_no: string | null; invoice_reference: string | null; destination: string | null }
  | { shipment_no: string | null; invoice_reference: string | null; destination: string | null }[]
  | null;

type InvoiceRow = {
  id: string;
  organization_id: string;
  invoice_number: string;
  invoice_prefix: string | null;
  shipment_id: string | null;
  client_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: Invoice["status"];
  client_snapshot: Record<string, unknown> | null;
  shipment_snapshot: Record<string, unknown> | null;
  subtotal: number;
  expense_total: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  issued_at?: string | null;
  sent_at?: string | null;
  voided_at?: string | null;
  idempotency_key?: string | null;
  clients?: NamedRelation;
  shipments?: ShipmentRelation;
};

type InvoiceItemRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  item_type: InvoiceItem["itemType"];
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  snapshot: Record<string, unknown> | null;
  created_at: string;
};

const invoiceSelect =
  "id, organization_id, invoice_number, invoice_prefix, shipment_id, client_id, issue_date, due_date, status, client_snapshot, shipment_snapshot, subtotal, expense_total, total_amount, notes, issued_at, sent_at, voided_at, idempotency_key, created_at, updated_at, deleted_at, clients(name), shipments(shipment_no, invoice_reference, destination)";
const invoiceItemSelect = "id, organization_id, invoice_id, item_type, description, quantity, unit_price, amount, snapshot, created_at";

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

function shipmentDestination(relation: ShipmentRelation | undefined) {
  return firstRelation(relation)?.destination ?? null;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceNumber: row.invoice_number,
    invoicePrefix: row.invoice_prefix,
    shipmentId: row.shipment_id,
    clientId: row.client_id,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    clientSnapshot: row.client_snapshot ?? {},
    shipmentSnapshot: row.shipment_snapshot ?? {},
    subtotal: Number(row.subtotal),
    expenseTotal: Number(row.expense_total),
    totalAmount: Number(row.total_amount),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    issuedAt: row.issued_at ?? null,
    sentAt: row.sent_at ?? null,
    voidedAt: row.voided_at ?? null,
    idempotencyKey: row.idempotency_key ?? null,
    clientName: relationName(row.clients) || (row.client_snapshot?.name as string | undefined) || null,
    shipmentReference: shipmentReference(row.shipments),
    destination: shipmentDestination(row.shipments) || (row.shipment_snapshot?.destination as string | undefined) || null,
  };
}

function toInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    itemType: row.item_type,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    amount: Number(row.amount),
    snapshot: row.snapshot ?? {},
    createdAt: row.created_at,
  };
}

function invoicePayload(input: InvoiceInput | InvoiceUpdateInput) {
  return {
    ...(input.invoiceNumber !== undefined ? { invoice_number: input.invoiceNumber } : {}),
    ...(input.invoicePrefix !== undefined ? { invoice_prefix: input.invoicePrefix } : {}),
    ...(input.shipmentId !== undefined ? { shipment_id: input.shipmentId } : {}),
    ...(input.clientId !== undefined ? { client_id: input.clientId } : {}),
    ...(input.issueDate !== undefined ? { issue_date: input.issueDate } : {}),
    ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.clientSnapshot !== undefined ? { client_snapshot: input.clientSnapshot } : {}),
    ...(input.shipmentSnapshot !== undefined ? { shipment_snapshot: input.shipmentSnapshot } : {}),
    ...(input.subtotal !== undefined ? { subtotal: input.subtotal } : {}),
    ...(input.expenseTotal !== undefined ? { expense_total: input.expenseTotal } : {}),
    ...(input.totalAmount !== undefined ? { total_amount: input.totalAmount } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

function invoiceItemPayload(input: InvoiceItemInput) {
  return {
    invoice_id: input.invoiceId,
    item_type: input.itemType ?? "transport",
    description: input.description,
    quantity: input.quantity ?? 1,
    unit_price: input.unitPrice ?? input.amount ?? 0,
    amount: input.amount ?? input.unitPrice ?? 0,
    snapshot: input.snapshot ?? {},
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listInvoices(organizationId: string): Promise<Invoice[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(invoiceSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });

  if (error) throw new Error(`Unable to load invoices: ${error.message}`);
  return ((data ?? []) as InvoiceRow[]).map(toInvoice);
}

export async function generateInvoiceForShipment(
  organizationId: string,
  shipmentId: string,
  regenerateDraft = false,
): Promise<{ invoice: Invoice; items: InvoiceItem[] }> {
  const supabase = requireSupabaseClient();
  const { data: invoiceId, error } = await supabase.rpc("generate_invoice_for_shipment", {
    p_organization_id: organizationId,
    p_shipment_id: shipmentId,
    p_regenerate_draft: regenerateDraft,
    p_idempotency_key: `invoice-${shipmentId}`,
  });
  if (error) throw new Error(`Unable to generate invoice: ${error.message}`);
  const [{ data: invoiceData, error: invoiceError }, { data: itemData, error: itemError }] = await Promise.all([
    supabase.from("invoices").select(invoiceSelect).eq("id", invoiceId).eq("organization_id", organizationId).single(),
    supabase.from("invoice_items").select(invoiceItemSelect).eq("invoice_id", invoiceId).eq("organization_id", organizationId).order("created_at"),
  ]);
  if (invoiceError) throw new Error(`Invoice was committed but could not be reloaded: ${invoiceError.message}`);
  if (itemError) throw new Error(`Invoice items were committed but could not be reloaded: ${itemError.message}`);
  return {
    invoice: toInvoice(invoiceData as InvoiceRow),
    items: ((itemData ?? []) as InvoiceItemRow[]).map(toInvoiceItem),
  };
}

export async function transitionInvoiceLifecycle(
  organizationId: string,
  invoiceId: string,
  status: "draft" | "sent" | "cancelled",
): Promise<Invoice> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("transition_invoice_lifecycle", {
    p_organization_id: organizationId,
    p_invoice_id: invoiceId,
    p_status: status,
  });
  if (error) throw new Error(`Unable to change invoice lifecycle: ${error.message}`);
  const { data, error: loadError } = await supabase
    .from("invoices")
    .select(invoiceSelect)
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (loadError) throw new Error(`Invoice changed but could not be reloaded: ${loadError.message}`);
  return toInvoice(data as InvoiceRow);
}

export async function createInvoice(organizationId: string, input: InvoiceInput, items: Omit<InvoiceItemInput, "invoiceId">[] = []): Promise<{ invoice: Invoice; items: InvoiceItem[] }> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  try {
    let matchQuery = supabase
      .from("invoices")
      .select(invoiceSelect)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (input.shipmentId) {
      matchQuery = matchQuery.or(`shipment_id.eq.${input.shipmentId},invoice_number.eq.${input.invoiceNumber}`);
    } else {
      matchQuery = matchQuery.eq("invoice_number", input.invoiceNumber);
    }

    const { data: existingData, error: existingError } = await matchQuery;
    
    if (!existingError && existingData && existingData.length > 0) {
      const existingMatch = existingData.find((r) => r.shipment_id === input.shipmentId) || existingData[0];
      const updatedInvoice = await updateInvoice(organizationId, existingMatch.id, input);
      return { invoice: updatedInvoice, items: [] };
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        ...invoicePayload({
          issueDate: new Date().toISOString().slice(0, 10),
          status: "draft",
          ...input,
        }),
        organization_id: organizationId,
        created_by: userId,
        updated_by: userId,
      })
      .select(invoiceSelect)
      .single();

    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate key")) {
        throw new Error("An invoice with this number already exists. Please verify your data.");
      }
      throw new Error(`Unable to create invoice: ${error.message}`);
    }
    
    const invoice = toInvoice(data as InvoiceRow);
    const createdItems = items.length ? await createInvoiceItems(organizationId, items.map((item) => ({ ...item, invoiceId: invoice.id }))) : [];
    
    return { invoice, items: createdItems };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("An unexpected error occurred while creating the invoice.", { cause: error });
  }
}

export async function updateInvoice(organizationId: string, invoiceId: string, input: InvoiceUpdateInput): Promise<Invoice> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      ...invoicePayload(input),
      updated_by: userId,
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(invoiceSelect)
    .single();

  if (error) throw new Error(`Unable to update invoice: ${error.message}`);
  return toInvoice(data as InvoiceRow);
}

export async function softDeleteInvoice(organizationId: string, invoiceId: string): Promise<void> {
  await transitionInvoiceLifecycle(organizationId, invoiceId, "cancelled");
}

export async function listInvoiceItems(organizationId: string): Promise<InvoiceItem[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .select(invoiceItemSelect)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Unable to load invoice items: ${error.message}`);
  return ((data ?? []) as InvoiceItemRow[]).map(toInvoiceItem);
}

export async function createInvoiceItems(organizationId: string, inputs: InvoiceItemInput[]): Promise<InvoiceItem[]> {
  if (!inputs.length) return [];
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("invoice_items")
    .insert(inputs.map((input) => ({ ...invoiceItemPayload(input), organization_id: organizationId })))
    .select(invoiceItemSelect);

  if (error) throw new Error(`Unable to create invoice items: ${error.message}`);
  return ((data ?? []) as InvoiceItemRow[]).map(toInvoiceItem);
}
