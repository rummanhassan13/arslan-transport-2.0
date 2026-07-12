import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createRouteLocation as createSupabaseRouteLocation,
  listRouteLocations,
  type RouteLocation,
  type RouteLocationType,
} from "../services/routeLocationService";
import type { Shipment } from "../types/domain";
import { useAuth } from "./useAuth";

const demoStorageKey = "transportflow_demo_route_locations";

function timestamp() {
  return new Date().toISOString();
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function loadDemoLocations(shipments: Shipment[]): RouteLocation[] {
  const saved = (() => {
    try {
      return JSON.parse(window.localStorage.getItem(demoStorageKey) ?? "[]") as RouteLocation[];
    } catch {
      return [];
    }
  })();
  const now = timestamp();
  const derived: RouteLocation[] = [
    ...shipments.map((shipment, index) => ({
      id: `demo-loading-point-${index}`,
      organizationId: "demo-organization",
      type: "loading_point" as const,
      name: shipment.loadingPoint,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })),
    ...shipments.map((shipment, index) => ({
      id: `demo-destination-${index}`,
      organizationId: "demo-organization",
      type: "destination" as const,
      name: shipment.destination,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })),
  ].filter((location) => location.name);
  const map = new Map<string, RouteLocation>();
  [...derived, ...saved].forEach((location) => {
    map.set(`${location.type}:${location.name.toUpperCase()}`, location);
  });
  return [...map.values()];
}

function saveDemoLocations(locations: RouteLocation[]) {
  window.localStorage.setItem(demoStorageKey, JSON.stringify(locations.filter((location) => location.id.startsWith("demo-route-location-"))));
}

export function useRouteLocations(shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [locations, setLocations] = useState<RouteLocation[]>(() => (env.demoMode ? loadDemoLocations(shipments) : []));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  const refreshRouteLocations = useCallback(async () => {
    if (env.demoMode) {
      setLocations(loadDemoLocations(shipments));
      setLoading(false);
      setError(null);
      return;
    }

    if (!organizationId) {
      setLocations([]);
      setLoading(false);
      setError("No active organization is available for loading route locations.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setLocations(await listRouteLocations(organizationId));
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Unable to load route locations.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, shipments]);

  useEffect(() => {
    void refreshRouteLocations();
  }, [refreshRouteLocations]);

  const createRouteLocation = useCallback(
    async (type: RouteLocationType, name: string) => {
      const cleanedName = normalizeName(name);
      if (!cleanedName) throw new Error("Route location name is required.");

      if (env.demoMode) {
        const existing = locations.find((location) => location.type === type && location.name.toUpperCase() === cleanedName.toUpperCase());
        if (existing) return existing;
        const now = timestamp();
        const created: RouteLocation = {
          id: `demo-route-location-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          type,
          name: cleanedName,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        const next = [...locations, created];
        setLocations(next);
        saveDemoLocations(next);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for saving route locations.");
      const created = await createSupabaseRouteLocation(organizationId, type, cleanedName);
      setLocations((current) => {
        const exists = current.some((location) => location.id === created.id);
        return exists ? current.map((location) => (location.id === created.id ? created : location)) : [...current, created];
      });
      return created;
    },
    [locations, organizationId],
  );

  const optionsByType = useMemo(
    () => ({
      loadingPoints: locations.filter((location) => location.type === "loading_point" && !location.deletedAt).map((location) => location.name),
      destinations: locations.filter((location) => location.type === "destination" && !location.deletedAt).map((location) => location.name),
    }),
    [locations],
  );

  return {
    routeLocations: locations,
    loading,
    error,
    refreshRouteLocations,
    createRouteLocation,
    ...optionsByType,
  };
}
