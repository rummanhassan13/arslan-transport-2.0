import { useCallback, useEffect, useState } from "react";
import { env } from "../config/env";
import { defaultShipments } from "../data/mockData";
import {
  createShipment as createSupabaseShipment,
  getShipmentById as getSupabaseShipmentById,
  listShipments,
  softDeleteShipment,
  updateShipment as updateSupabaseShipment,
  transitionShipmentStatus as transitionSupabaseShipmentStatus,
  type ShipmentListFilters,
} from "../services/shipmentService";
import type { Shipment, ShipmentInput, ShipmentUpdateInput } from "../types/domain";
import { calculate } from "../utils/calculations";
import { useAuth } from "./useAuth";
import { useGlobalRefresh, notifyGlobalRefresh } from "./useGlobalRefresh";

const storageKey = "arslan-transport-shipments";

export function useShipments() {
  const { activeOrganization } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>(() => {
    if (!env.demoMode) return [];
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : defaultShipments;
  });
  const [filters, setFilters] = useState<ShipmentListFilters>({});
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;
    localStorage.setItem(storageKey, JSON.stringify(shipments));
  }, [shipments]);

  const refreshShipments = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setShipments([]);
      setError("No active organization is available for loading shipments.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setShipments(await listShipments(organizationId, filters));
    } catch (shipmentError) {
      setError(shipmentError instanceof Error ? shipmentError.message : "Unable to load shipments.");
    } finally {
      setLoading(false);
    }
  }, [filters, organizationId]);

  useEffect(() => {
    void refreshShipments();
  }, [refreshShipments]);

  useGlobalRefresh(refreshShipments, "shipments");

  const getShipmentById = useCallback(
    async (shipmentId: string) => {
      if (env.demoMode) {
        return shipments.find((shipment) => shipment.id === shipmentId) ?? null;
      }

      if (!organizationId) throw new Error("No active organization is available for loading shipments.");

      return getSupabaseShipmentById(organizationId, shipmentId);
    },
    [organizationId, shipments],
  );

  const createShipment = useCallback(
    async (input: ShipmentInput) => {
      const sanitizedInput = {
        ...input,
        companyRate: input.companyRate === "" ? 0 : Number(input.companyRate),
        driverRate: input.driverRate === "" ? 0 : Number(input.driverRate),
        advance: input.advance === "" ? 0 : Number(input.advance),
        gatePass: input.gatePass === "" ? 0 : Number(input.gatePass),
        fashah: input.fashah === "" ? 0 : Number(input.fashah),
        naql: input.naql === "" ? 0 : Number(input.naql),
      };

      if (env.demoMode) {
        const now = new Date().toISOString();
        const totals = calculate(sanitizedInput);
        const newShipment: Shipment = {
          ...sanitizedInput,
          ...totals,
          id: `SHP-${String(shipments.length + 1).padStart(3, "0")}`,
          sr: shipments.length + 1,
          billImages: [],
          assignments: sanitizedInput.assignments?.map((a, i) => ({ ...a, id: `assign-${Date.now()}-${i}` })) || [],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          driverPaymentStatus: "Pending",
          invoiceStatus: "Pending",
          clientPaymentStatus: "Pending",
        };
        setShipments((current) => [newShipment, ...current].map((shipment, index) => ({ ...shipment, sr: index + 1 })));
        notifyGlobalRefresh("shipments");
        return newShipment;
      }

      if (!organizationId) throw new Error("No active organization is available for creating shipments.");

      const created = await createSupabaseShipment(organizationId, sanitizedInput);
      setShipments((current) => [created, ...current]);
      notifyGlobalRefresh("shipments");
      return created;
    },
    [organizationId, shipments.length],
  );

  const updateShipment = useCallback(async (id: string, input: ShipmentUpdateInput) => {
    const sanitizedInput = {
      ...input,
      ...(input.companyRate !== undefined ? { companyRate: input.companyRate === "" ? 0 : Number(input.companyRate) } : {}),
      ...(input.driverRate !== undefined ? { driverRate: input.driverRate === "" ? 0 : Number(input.driverRate) } : {}),
      ...(input.advance !== undefined ? { advance: input.advance === "" ? 0 : Number(input.advance) } : {}),
      ...(input.gatePass !== undefined ? { gatePass: input.gatePass === "" ? 0 : Number(input.gatePass) } : {}),
      ...(input.fashah !== undefined ? { fashah: input.fashah === "" ? 0 : Number(input.fashah) } : {}),
      ...(input.naql !== undefined ? { naql: input.naql === "" ? 0 : Number(input.naql) } : {}),
    };

    if (env.demoMode) {
      let updatedShipment: Shipment | undefined;
      setShipments((current) =>
        current.map((shipment) => {
          if (shipment.id !== id) return shipment;
          const shipmentToUpdate = {
            ...shipment,
            ...sanitizedInput,
            assignments: sanitizedInput.assignments
              ? sanitizedInput.assignments.map((a, i) => ({ ...a, id: a.id || `assign-${Date.now()}-${i}` }))
              : shipment.assignments,
          } as Shipment;
          const totals = calculate(shipmentToUpdate);
          const result = { ...shipmentToUpdate, ...totals, updatedAt: new Date().toISOString() };
          updatedShipment = result;
          return result;
        }),
      );
      notifyGlobalRefresh("shipments");
      return updatedShipment ?? null;
    }

    if (!organizationId) throw new Error("No active organization is available for updating shipments.");

    const updated = await updateSupabaseShipment(organizationId, id, sanitizedInput);
    setShipments((current) => current.map((shipment) => (shipment.id === id ? updated : shipment)));
    notifyGlobalRefresh("shipments");
    return updated;
  }, [organizationId]);

  const deleteShipment = useCallback(async (id: string) => {
    if (env.demoMode) {
      setShipments((current) => current.filter((shipment) => shipment.id !== id));
      notifyGlobalRefresh("shipments");
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting shipments.");

    await softDeleteShipment(organizationId, id);
    setShipments((current) => current.filter((shipment) => shipment.id !== id));
    notifyGlobalRefresh("shipments");
  }, [organizationId]);

  const transitionShipmentStatus = useCallback(async (
    id: string,
    status: NonNullable<Shipment["status"]>,
    reason?: string,
  ) => {
    if (env.demoMode) {
      const allowed: Record<string, Shipment["status"][]> = {
        pending: ["in_transit", "cancelled"],
        in_transit: ["delivered", "cancelled"],
        delivered: ["completed", "cancelled"],
      };
      const currentShipment = shipments.find((shipment) => shipment.id === id);
      if (!currentShipment) throw new Error("Shipment not found.");
      const currentStatus = currentShipment.status ?? "pending";
      if (!(allowed[currentStatus] ?? []).includes(status)) {
        throw new Error(`Invalid shipment transition from ${currentStatus} to ${status}.`);
      }
      if (status === "cancelled" && !reason?.trim()) throw new Error("A cancellation reason is required.");
      const updated: Shipment = {
        ...currentShipment,
        status,
        remarks: status === "cancelled"
          ? [currentShipment.remarks, `CANCELLED: ${reason?.trim()}`].filter(Boolean).join("\n")
          : currentShipment.remarks,
        updatedAt: new Date().toISOString(),
      };
      setShipments((current) => current.map((shipment) => shipment.id === id ? updated : shipment));
      return updated;
    }
    if (!organizationId) throw new Error("No active organization is available for changing shipment status.");
    const updated = await transitionSupabaseShipmentStatus(organizationId, id, status, reason);
    setShipments((current) => current.map((shipment) => shipment.id === id ? updated : shipment));
    return updated;
  }, [organizationId, shipments]);

  return {
    shipments,
    setShipments,
    loading,
    error,
    filters,
    setFilters,
    refreshShipments,
    getShipmentById,
    createShipment,
    updateShipment,
    transitionShipmentStatus,
    deleteShipment,
  };
}
