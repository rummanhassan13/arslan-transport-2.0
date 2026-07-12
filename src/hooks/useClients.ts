import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import { useAuth } from "./useAuth";
import {
  createClient as createSupabaseClient,
  listClients,
  softDeleteClient,
  updateClient as updateSupabaseClient,
} from "../services/clientService";
import type { Client, ClientInput, ClientUpdateInput, Shipment } from "../types/domain";
import { useGlobalRefresh, notifyGlobalRefresh } from "./useGlobalRefresh";

function timestamp() {
  return new Date().toISOString();
}

function buildDemoClients(shipments: Shipment[]): Client[] {
  return Array.from(new Set(shipments.map((shipment) => shipment.customer).filter(Boolean))).map((name, index) => {
    const now = timestamp();
    return {
      id: `demo-client-${index + 1}`,
      organizationId: "demo-organization",
      name,
      contactPerson: null,
      phone: null,
      email: null,
      address: null,
      notes: "Demo client derived from mock shipment data.",
      status: "active",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  });
}

export function useClients(shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [clients, setClients] = useState<Client[]>(() => buildDemoClients(shipments));
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;

    setClients((current) => {
      const currentNames = new Set(current.map((client) => client.name));
      const derivedClients = buildDemoClients(shipments).filter((client) => !currentNames.has(client.name));
      return [...current, ...derivedClients].filter((client) => !client.deletedAt);
    });
  }, [shipments]);

  const refreshClients = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setClients([]);
      setError("No active organization is available for loading clients.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setClients(await listClients(organizationId));
    } catch (clientError) {
      setError(clientError instanceof Error ? clientError.message : "Unable to load clients.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshClients();
  }, [refreshClients]);

  useGlobalRefresh(refreshClients, "clients");

  const createClient = useCallback(
    async (input: ClientInput) => {
      if (env.demoMode) {
        const now = timestamp();
        const created: Client = {
          id: `demo-client-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          name: input.name,
          contactPerson: input.contactPerson ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "active",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        setClients((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating clients.");

      const created = await createSupabaseClient(organizationId, input);
      setClients((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      notifyGlobalRefresh("clients");
      return created;
    },
    [organizationId],
  );

  const updateClient = useCallback(async (clientId: string, input: ClientUpdateInput) => {
    if (env.demoMode) {
      let updatedClient: Client | null = null;
      setClients((current) =>
        current.map((client) => {
          if (client.id !== clientId) return client;
          updatedClient = {
            ...client,
            ...input,
            contactPerson: input.contactPerson ?? client.contactPerson,
            phone: input.phone ?? client.phone,
            email: input.email ?? client.email,
            address: input.address ?? client.address,
            notes: input.notes ?? client.notes,
            status: input.status ?? client.status,
            updatedAt: timestamp(),
          };
          return updatedClient;
        }),
      );
      return updatedClient;
    }

    if (!organizationId) throw new Error("No active organization is available for updating clients.");

    const updated = await updateSupabaseClient(organizationId, clientId, input);
    setClients((current) => current.map((client) => (client.id === clientId ? updated : client)));
    notifyGlobalRefresh("clients");
    return updated;
  }, [organizationId]);

  const deleteClient = useCallback(async (clientId: string) => {
    if (env.demoMode) {
      setClients((current) => current.filter((client) => client.id !== clientId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting clients.");

    await softDeleteClient(organizationId, clientId);
    setClients((current) => current.filter((client) => client.id !== clientId));
    notifyGlobalRefresh("clients");
  }, [organizationId]);

  const activeClients = useMemo(() => clients.filter((client) => !client.deletedAt), [clients]);

  return {
    clients: activeClients,
    loading,
    error,
    refreshClients,
    createClient,
    updateClient,
    deleteClient,
  };
}
