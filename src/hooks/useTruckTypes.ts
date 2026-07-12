import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_TRUCK_TYPES } from "../constants/truckTypes";
import { env } from "../config/env";
import {
  createTruckType as createSupabaseTruckType,
  listTruckTypes,
  softDeleteTruckType,
  updateTruckType as updateSupabaseTruckType,
} from "../services/truckTypeService";
import type { Shipment, TruckType, TruckTypeInput, TruckTypeUpdateInput } from "../types/domain";
import { useAuth } from "./useAuth";

function timestamp() {
  return new Date().toISOString();
}

function buildDemoTruckTypes(shipments: Shipment[]): TruckType[] {
  const names = Array.from(new Set([...DEFAULT_TRUCK_TYPES, ...shipments.map((shipment) => shipment.truckType)].filter(Boolean)));
  return names.map((name, index) => {
    const now = timestamp();
    return {
      id: `demo-truck-type-${index + 1}`,
      organizationId: "demo-organization",
      name,
      description: "Demo truck type.",
      status: "active",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  });
}

export function useTruckTypes(shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [truckTypes, setTruckTypes] = useState<TruckType[]>(() => buildDemoTruckTypes(shipments));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;

    setTruckTypes((current) => {
      const currentNames = new Set(current.map((truckType) => truckType.name));
      const derivedTypes = buildDemoTruckTypes(shipments).filter((truckType) => !currentNames.has(truckType.name));
      return [...current, ...derivedTypes].filter((truckType) => !truckType.deletedAt);
    });
  }, [shipments]);

  const refreshTruckTypes = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setTruckTypes([]);
      setError("No active organization is available for loading truck types.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setTruckTypes(await listTruckTypes(organizationId));
    } catch (truckTypeError) {
      setError(truckTypeError instanceof Error ? truckTypeError.message : "Unable to load truck types.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshTruckTypes();
  }, [refreshTruckTypes]);

  const createTruckType = useCallback(
    async (input: TruckTypeInput) => {
      if (env.demoMode) {
        const now = timestamp();
        const created: TruckType = {
          id: `demo-truck-type-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "active",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        setTruckTypes((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating truck types.");

      const created = await createSupabaseTruckType(organizationId, input);
      setTruckTypes((current) => [created, ...current]);
      return created;
    },
    [organizationId],
  );

  const updateTruckType = useCallback(async (truckTypeId: string, input: TruckTypeUpdateInput) => {
    if (env.demoMode) {
      let updatedTruckType: TruckType | null = null;
      setTruckTypes((current) =>
        current.map((truckType) => {
          if (truckType.id !== truckTypeId) return truckType;
          updatedTruckType = {
            ...truckType,
            ...input,
            description: input.description ?? truckType.description,
            status: input.status ?? truckType.status,
            updatedAt: timestamp(),
          };
          return updatedTruckType;
        }),
      );
      return updatedTruckType;
    }

    if (!organizationId) throw new Error("No active organization is available for updating truck types.");

    const updated = await updateSupabaseTruckType(organizationId, truckTypeId, input);
    setTruckTypes((current) => current.map((truckType) => (truckType.id === truckTypeId ? updated : truckType)));
    return updated;
  }, [organizationId]);

  const deleteTruckType = useCallback(async (truckTypeId: string) => {
    if (env.demoMode) {
      setTruckTypes((current) => current.filter((truckType) => truckType.id !== truckTypeId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting truck types.");

    await softDeleteTruckType(organizationId, truckTypeId);
    setTruckTypes((current) => current.filter((truckType) => truckType.id !== truckTypeId));
  }, [organizationId]);

  const activeTruckTypes = useMemo(() => truckTypes.filter((truckType) => !truckType.deletedAt), [truckTypes]);

  return {
    truckTypes: activeTruckTypes,
    loading,
    error,
    refreshTruckTypes,
    createTruckType,
    updateTruckType,
    deleteTruckType,
  };
}
