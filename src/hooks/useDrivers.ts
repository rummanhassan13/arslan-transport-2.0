import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import { useAuth } from "./useAuth";
import {
  createDriver as createSupabaseDriver,
  listDrivers,
  softDeleteDriver,
  updateDriver as updateSupabaseDriver,
} from "../services/driverService";
import type { Driver, DriverInput, DriverUpdateInput, Shipment } from "../types/domain";
import { useGlobalRefresh, notifyGlobalRefresh } from "./useGlobalRefresh";

function timestamp() {
  return new Date().toISOString();
}

function buildDemoDrivers(shipments: Shipment[]): Driver[] {
  const driverNames = Array.from(new Set(shipments.map((shipment) => shipment.driverName).filter(Boolean)));
  return driverNames.map((name, index) => {
    const now = timestamp();
    const shipment = shipments.find((row) => row.driverName === name);
    return {
      id: `demo-driver-${index + 1}`,
      organizationId: "demo-organization",
      name,
      phone: shipment?.cellNo ?? null,
      cnic: null,
      licenseNumber: null,
      providerName: null,
      notes: "Demo driver derived from mock shipment data.",
      status: "active",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  });
}

export function useDrivers(shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>(() => buildDemoDrivers(shipments));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;

    setDrivers((current) => {
      const currentNames = new Set(current.map((driver) => driver.name));
      const derivedDrivers = buildDemoDrivers(shipments).filter((driver) => !currentNames.has(driver.name));
      return [...current, ...derivedDrivers].filter((driver) => !driver.deletedAt);
    });
  }, [shipments]);

  const refreshDrivers = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setDrivers([]);
      setError("No active organization is available for loading drivers.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setDrivers(await listDrivers(organizationId));
    } catch (driverError) {
      setError(driverError instanceof Error ? driverError.message : "Unable to load drivers.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshDrivers();
  }, [refreshDrivers]);

  useGlobalRefresh(refreshDrivers, "drivers");

  const createDriver = useCallback(
    async (input: DriverInput) => {
      if (env.demoMode) {
        const now = timestamp();
        const created: Driver = {
          id: `demo-driver-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          name: input.name,
          phone: input.phone ?? null,
          cnic: input.cnic ?? null,
          licenseNumber: input.licenseNumber ?? null,
          providerName: input.providerName ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "active",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        setDrivers((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating drivers.");

      const created = await createSupabaseDriver(organizationId, input);
      setDrivers((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      notifyGlobalRefresh("drivers");
      return created;
    },
    [organizationId],
  );

  const updateDriver = useCallback(async (driverId: string, input: DriverUpdateInput) => {
    if (env.demoMode) {
      let updatedDriver: Driver | null = null;
      setDrivers((current) =>
        current.map((driver) => {
          if (driver.id !== driverId) return driver;
          updatedDriver = {
            ...driver,
            ...input,
            phone: input.phone !== undefined ? input.phone : driver.phone,
            cnic: input.cnic !== undefined ? input.cnic : driver.cnic,
            licenseNumber: input.licenseNumber !== undefined ? input.licenseNumber : driver.licenseNumber,
            providerName: input.providerName !== undefined ? input.providerName : driver.providerName,
            notes: input.notes !== undefined ? input.notes : driver.notes,
            status: input.status ?? driver.status,
            updatedAt: timestamp(),
          };
          return updatedDriver;
        }),
      );
      return updatedDriver;
    }

    if (!organizationId) throw new Error("No active organization is available for updating drivers.");

    const updated = await updateSupabaseDriver(organizationId, driverId, input);
    setDrivers((current) => current.map((driver) => (driver.id === driverId ? updated : driver)));
    notifyGlobalRefresh("drivers");
    return updated;
  }, [organizationId]);

  const deleteDriver = useCallback(async (driverId: string) => {
    if (env.demoMode) {
      setDrivers((current) => current.filter((driver) => driver.id !== driverId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting drivers.");

    await softDeleteDriver(organizationId, driverId);
    setDrivers((current) => current.filter((driver) => driver.id !== driverId));
    notifyGlobalRefresh("drivers");
  }, [organizationId]);

  const activeDrivers = useMemo(() => drivers.filter((driver) => !driver.deletedAt), [drivers]);

  return {
    drivers: activeDrivers,
    loading,
    error,
    refreshDrivers,
    createDriver,
    updateDriver,
    deleteDriver,
  };
}
