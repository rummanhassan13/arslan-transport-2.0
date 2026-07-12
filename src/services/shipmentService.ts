import { requireSupabaseClient } from "../lib/supabase";
import type { Shipment, ShipmentFilters, ShipmentInput, ShipmentUpdateInput } from "../types/domain";
import { calculate } from "../utils/calculations";

type RelationName = { name: string | null } | { name: string | null }[] | null;
type VehicleRelation = { vehicle_number: string | null } | { vehicle_number: string | null }[] | null;

type ShipmentDriverAssignmentRow = {
  id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  truck_type_id: string | null;
  leg_order: number;
  from_location: string;
  to_location: string;
  driver_rate: number;
  advance_paid: number;
  notes: string;
  deleted_at: string | null;
  drivers?: RelationName;
  vehicles?: VehicleRelation;
  truck_types?: RelationName;
};

type ShipmentRow = {
  id: string;
  organization_id: string;
  shipment_no: string | null;
  invoice_reference: string | null;
  shipment_date: string;
  client_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  truck_type_id: string | null;
  loading_point: string;
  destination: string;
  company_rate: number;
  driver_rate: number;
  status: "pending" | "in_transit" | "delivered" | "completed" | "cancelled";
  remarks: string | null;
  advance: number;
  gate_pass: number;
  fashah: number;
  naql: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  clients?: RelationName;
  drivers?: RelationName;
  vehicles?: VehicleRelation;
  truck_types?: RelationName;
  shipment_driver_assignments?: ShipmentDriverAssignmentRow[];
};

export type ShipmentListFilters = Partial<ShipmentFilters> & {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

const shipmentSelect =
  "id, organization_id, shipment_no, invoice_reference, shipment_date, client_id, driver_id, vehicle_id, truck_type_id, loading_point, destination, company_rate, driver_rate, status, remarks, advance, gate_pass, fashah, naql, created_at, updated_at, deleted_at, clients(name), drivers(name), vehicles(vehicle_number), truck_types(name), shipment_driver_assignments(id, driver_id, vehicle_id, truck_type_id, leg_order, from_location, to_location, driver_rate, advance_paid, notes, deleted_at, drivers(name), vehicles(vehicle_number), truck_types(name))";

function relationName(relation: RelationName | undefined) {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0]?.name ?? null : relation.name;
}

function vehicleNumber(relation: VehicleRelation | undefined) {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0]?.vehicle_number ?? null : relation.vehicle_number;
}

function toShipment(row: ShipmentRow, index = 0): Shipment {
  const totals = calculate({
    date: row.shipment_date,
    invoice: row.invoice_reference || row.shipment_no || "",
    loadingPoint: row.loading_point,
    destination: row.destination,
    customer: relationName(row.clients) || "Unassigned Client",
    driverName: relationName(row.drivers) || "Unassigned Driver",
    vehicleNo: vehicleNumber(row.vehicles) || "-",
    truckType: relationName(row.truck_types) || "-",
    cellNo: "",
    companyRate: Number(row.company_rate),
    driverRate: Number(row.driver_rate),
    advance: Number(row.advance),
    gatePass: Number(row.gate_pass),
    fashah: Number(row.fashah),
    naql: Number(row.naql),
    driverPaymentStatus: "Pending",
    invoiceStatus: "Pending",
    clientPaymentStatus: "Pending",
    remarks: row.remarks || "",
    clientId: row.client_id,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    truckTypeId: row.truck_type_id,
  });

  return {
    id: row.id,
    organizationId: row.organization_id,
    sr: index + 1,
    shipmentNo: row.shipment_no,
    date: row.shipment_date,
    shipmentDate: row.shipment_date,
    invoice: row.invoice_reference || row.shipment_no || "",
    invoiceReference: row.invoice_reference,
    clientId: row.client_id,
    clientName: relationName(row.clients),
    driverId: row.driver_id,
    driverName: relationName(row.drivers) || "Unassigned Driver",
    vehicleId: row.vehicle_id,
    vehicleNo: vehicleNumber(row.vehicles) || "-",
    vehicleNumber: vehicleNumber(row.vehicles),
    truckTypeId: row.truck_type_id,
    truckType: relationName(row.truck_types) || "-",
    truckTypeName: relationName(row.truck_types),
    loadingPoint: row.loading_point,
    destination: row.destination,
    customer: relationName(row.clients) || "Unassigned Client",
    cellNo: "",
    companyRate: Number(row.company_rate),
    driverRate: Number(row.driver_rate),
    advance: Number(row.advance),
    gatePass: Number(row.gate_pass),
    fashah: Number(row.fashah),
    naql: Number(row.naql),
    ...totals,
    status: row.status,
    driverPaymentStatus: "Pending",
    invoiceStatus: "Pending",
    clientPaymentStatus: "Pending",
    remarks: row.remarks || "",
    billImages: [],
    assignments: (row.shipment_driver_assignments || []).filter((a) => !a.deleted_at).map(a => ({
      id: a.id,
      driverId: a.driver_id,
      driverName: relationName(a.drivers) || "Unassigned",
      legOrder: a.leg_order,
      fromLocation: a.from_location,
      toLocation: a.to_location,
      driverRate: Number(a.driver_rate),
      notes: a.notes || "",
      vehicleId: a.vehicle_id,
      vehicleNo: vehicleNumber(a.vehicles) || "-",
      truckTypeId: a.truck_type_id,
      truckType: relationName(a.truck_types) || "-",
      advancePaid: Number(a.advance_paid) || 0,
    })).sort((a, b) => a.legOrder - b.legOrder),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toShipmentPayload(input: ShipmentInput | ShipmentUpdateInput) {
  return {
    ...(input.shipmentNo !== undefined ? { shipment_no: input.shipmentNo } : {}),
    ...(input.invoice !== undefined || input.invoiceReference !== undefined ? { invoice_reference: input.invoiceReference ?? input.invoice } : {}),
    ...(input.date !== undefined || input.shipmentDate !== undefined ? { shipment_date: input.shipmentDate ?? input.date } : {}),
    ...(input.clientId !== undefined ? { client_id: input.clientId } : {}),
    ...(input.driverId !== undefined ? { driver_id: input.driverId } : {}),
    ...(input.vehicleId !== undefined ? { vehicle_id: input.vehicleId } : {}),
    ...(input.truckTypeId !== undefined ? { truck_type_id: input.truckTypeId } : {}),
    ...(input.loadingPoint !== undefined ? { loading_point: input.loadingPoint } : {}),
    ...(input.destination !== undefined ? { destination: input.destination } : {}),
    ...(input.companyRate !== undefined ? { company_rate: input.companyRate } : {}),
    ...(input.driverRate !== undefined ? { driver_rate: input.driverRate } : {}),
    ...(input.advance !== undefined ? { advance: input.advance } : {}),
    ...(input.gatePass !== undefined ? { gate_pass: input.gatePass } : {}),
    ...(input.fashah !== undefined ? { fashah: input.fashah } : {}),
    ...(input.naql !== undefined ? { naql: input.naql } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
  };
}

function toWorkflowShipment(input: ShipmentInput) {
  return {
    shipment_no: input.shipmentNo || input.invoice || null,
    customer_reference: input.invoiceReference && input.invoiceReference !== input.invoice ? input.invoiceReference : null,
    shipment_date: input.shipmentDate || input.date,
    client_id: input.clientId ?? null,
    driver_id: input.driverId ?? null,
    vehicle_id: input.vehicleId ?? null,
    truck_type_id: input.truckTypeId ?? null,
    loading_point: input.loadingPoint,
    destination: input.destination,
    company_rate: Number(input.companyRate) || 0,
    status: input.status ?? "pending",
    remarks: input.remarks || null,
  };
}

function toWorkflowAssignments(input: ShipmentInput) {
  return (input.assignments ?? []).map((assignment) => ({
    id: assignment.id ?? null,
    driver_id: assignment.driverId,
    vehicle_id: assignment.vehicleId ?? null,
    truck_type_id: assignment.truckTypeId ?? null,
    leg_order: assignment.legOrder,
    from_location: assignment.fromLocation,
    to_location: assignment.toLocation,
    driver_rate: Number(assignment.driverRate) || 0,
    initial_advance: Number(assignment.initialAdvance ?? assignment.advancePaid ?? 0) || 0,
    notes: assignment.notes || null,
  }));
}

function requireWorkflowResult(data: unknown, error: { message?: string } | null, action: string) {
  if (error) {
    const migrationHint = error.message?.includes("save_shipment_with_assignments")
      ? " Apply migration 015_logic_integrity_workflows.sql before using Supabase mode."
      : "";
    throw new Error(`Unable to ${action} shipment: ${error.message ?? "Unknown database error."}${migrationHint}`);
  }
  if (typeof data !== "string") throw new Error(`Unable to ${action} shipment: database workflow returned no shipment id.`);
  return data;
}

function requireAutomaticInvoiceResult(data: unknown, error: { message?: string } | null) {
  if (error) {
    const migrationHint = error.message?.includes("create_shipment_with_invoice")
      ? " Apply migration 017_automatic_shipment_invoice.sql before creating shipments in Supabase mode."
      : "";
    throw new Error(`Unable to create shipment and invoice: ${error.message ?? "Unknown database error."}${migrationHint}`);
  }
  if (!data || typeof data !== "object") {
    throw new Error("Unable to create shipment and invoice: database workflow returned no result.");
  }
  const result = data as { shipment_id?: unknown; invoice_id?: unknown };
  if (typeof result.shipment_id !== "string" || typeof result.invoice_id !== "string") {
    throw new Error("Unable to create shipment and invoice: database workflow returned invalid identifiers.");
  }
  return { shipmentId: result.shipment_id, invoiceId: result.invoice_id };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listShipments(organizationId: string, filters: ShipmentListFilters = {}): Promise<Shipment[]> {
  const supabase = requireSupabaseClient();
  let query = supabase
    .from("shipments")
    .select(shipmentSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("shipment_date", { ascending: false });

  if (filters.dateFrom) query = query.gte("shipment_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("shipment_date", filters.dateTo);
  if (filters.destination) query = query.ilike("destination", `%${filters.destination}%`);
  if (filters.search) query = query.or(`invoice_reference.ilike.%${filters.search}%,shipment_no.ilike.%${filters.search}%,loading_point.ilike.%${filters.search}%,destination.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load shipments: ${error.message}`);
  return ((data ?? []) as ShipmentRow[]).map(toShipment);
}

export async function getShipmentById(organizationId: string, shipmentId: string): Promise<Shipment | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from("shipments").select(shipmentSelect).eq("id", shipmentId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Unable to load shipment: ${error.message}`);
  return data ? toShipment(data as ShipmentRow) : null;
}

export async function createShipment(organizationId: string, input: ShipmentInput): Promise<Shipment> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .rpc("create_shipment_with_invoice", {
      p_organization_id: organizationId,
      p_shipment: toWorkflowShipment(input),
      p_assignments: toWorkflowAssignments(input),
      p_idempotency_key: `shipment-${crypto.randomUUID()}`,
    });
  const { shipmentId } = requireAutomaticInvoiceResult(data, error);
  const created = await getShipmentById(organizationId, shipmentId);
  if (!created) throw new Error("Shipment was committed but could not be reloaded.");
  return created;
}

export async function updateShipment(organizationId: string, shipmentId: string, input: ShipmentUpdateInput): Promise<Shipment> {
  const supabase = requireSupabaseClient();
  const current = await getShipmentById(organizationId, shipmentId);
  if (!current) throw new Error("Shipment not found in the active organization.");
  const merged = { ...current, ...input } as ShipmentInput;
  const { data, error } = await supabase
    .rpc("save_shipment_with_assignments", {
      p_organization_id: organizationId,
      p_shipment_id: shipmentId,
      p_shipment: toWorkflowShipment(merged),
      p_assignments: toWorkflowAssignments(merged),
      p_idempotency_key: null,
    });
  requireWorkflowResult(data, error, "update");
  const updated = await getShipmentById(organizationId, shipmentId);
  if (!updated) throw new Error("Shipment was updated but could not be reloaded.");
  return updated;
}

export async function softDeleteShipment(organizationId: string, shipmentId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("shipments")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", shipmentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete shipment: ${error.message}`);
}

export async function transitionShipmentStatus(
  organizationId: string,
  shipmentId: string,
  status: NonNullable<Shipment["status"]>,
  reason?: string,
): Promise<Shipment> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.rpc("transition_shipment_status", {
    p_organization_id: organizationId,
    p_shipment_id: shipmentId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(`Unable to change shipment status: ${error.message}`);
  const updated = await getShipmentById(organizationId, shipmentId);
  if (!updated) throw new Error("Shipment status changed but the shipment could not be reloaded.");
  return updated;
}
