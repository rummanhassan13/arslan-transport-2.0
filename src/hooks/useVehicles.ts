import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createVehicle as createSupabaseVehicle,
  listVehicles,
  softDeleteVehicle,
  updateVehicle as updateSupabaseVehicle,
} from "../services/vehicleService";
import type { Shipment, TruckType, Vehicle, VehicleInput, VehicleUpdateInput } from "../types/domain";
import { useAuth } from "./useAuth";

function timestamp() {
  return new Date().toISOString();
}

function buildDemoVehicles(shipments: Shipment[], truckTypes: TruckType[]): Vehicle[] {
  const vehicleNumbers = Array.from(new Set(shipments.map((shipment) => shipment.vehicleNo).filter(Boolean)));
  return vehicleNumbers.map((vehicleNumber, index) => {
    const now = timestamp();
    const shipment = shipments.find((row) => row.vehicleNo === vehicleNumber);
    const truckType = truckTypes.find((item) => item.name === shipment?.truckType);
    return {
      id: `demo-vehicle-${index + 1}`,
      organizationId: "demo-organization",
      vehicleNumber,
      truckTypeId: truckType?.id ?? null,
      truckTypeName: shipment?.truckType ?? null,
      driverId: null,
      driverName: shipment?.driverName ?? null,
      notes: "Demo vehicle derived from mock shipment data.",
      status: "active",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  });
}

export function useVehicles(shipments: Shipment[] = [], truckTypes: TruckType[] = []) {
  const { activeOrganization } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => buildDemoVehicles(shipments, truckTypes));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;

    setVehicles((current) => {
      const currentNumbers = new Set(current.map((vehicle) => vehicle.vehicleNumber));
      const derivedVehicles = buildDemoVehicles(shipments, truckTypes).filter((vehicle) => !currentNumbers.has(vehicle.vehicleNumber));
      return [...current, ...derivedVehicles].filter((vehicle) => !vehicle.deletedAt);
    });
  }, [shipments, truckTypes]);

  const refreshVehicles = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setVehicles([]);
      setError("No active organization is available for loading vehicles.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setVehicles(await listVehicles(organizationId));
    } catch (vehicleError) {
      setError(vehicleError instanceof Error ? vehicleError.message : "Unable to load vehicles.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshVehicles();
  }, [refreshVehicles]);

  const createVehicle = useCallback(
    async (input: VehicleInput) => {
      if (env.demoMode) {
        const now = timestamp();
        const truckType = truckTypes.find((item) => item.id === input.truckTypeId);
        const created: Vehicle = {
          id: `demo-vehicle-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          vehicleNumber: input.vehicleNumber,
          truckTypeId: input.truckTypeId ?? null,
          truckTypeName: truckType?.name ?? null,
          driverId: input.driverId ?? null,
          driverName: null,
          notes: input.notes ?? null,
          status: input.status ?? "active",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        setVehicles((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating vehicles.");

      const created = await createSupabaseVehicle(organizationId, input);
      setVehicles((current) => [created, ...current]);
      return created;
    },
    [organizationId, truckTypes],
  );

  const updateVehicle = useCallback(
    async (vehicleId: string, input: VehicleUpdateInput) => {
      if (env.demoMode) {
        let updatedVehicle: Vehicle | null = null;
        const truckType = truckTypes.find((item) => item.id === input.truckTypeId);
        setVehicles((current) =>
          current.map((vehicle) => {
            if (vehicle.id !== vehicleId) return vehicle;
            updatedVehicle = {
              ...vehicle,
              ...input,
              truckTypeId: input.truckTypeId ?? vehicle.truckTypeId,
              truckTypeName: truckType?.name ?? vehicle.truckTypeName,
              driverId: input.driverId ?? vehicle.driverId,
              notes: input.notes ?? vehicle.notes,
              status: input.status ?? vehicle.status,
              updatedAt: timestamp(),
            };
            return updatedVehicle;
          }),
        );
        return updatedVehicle;
      }

      if (!organizationId) throw new Error("No active organization is available for updating vehicles.");

      const updated = await updateSupabaseVehicle(organizationId, vehicleId, input);
      setVehicles((current) => current.map((vehicle) => (vehicle.id === vehicleId ? updated : vehicle)));
      return updated;
    },
    [organizationId, truckTypes],
  );

  const deleteVehicle = useCallback(async (vehicleId: string) => {
    if (env.demoMode) {
      setVehicles((current) => current.filter((vehicle) => vehicle.id !== vehicleId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting vehicles.");

    await softDeleteVehicle(organizationId, vehicleId);
    setVehicles((current) => current.filter((vehicle) => vehicle.id !== vehicleId));
  }, [organizationId]);

  const activeVehicles = useMemo(() => vehicles.filter((vehicle) => !vehicle.deletedAt), [vehicles]);

  return {
    vehicles: activeVehicles,
    loading,
    error,
    refreshVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,
  };
}
