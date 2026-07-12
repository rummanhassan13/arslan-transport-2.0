import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createClientPayment as createSupabaseClientPayment,
  createDriverPayment as createSupabaseDriverPayment,
  listClientPayments,
  listDriverPayments,
  softDeleteClientPayment,
  softDeleteDriverPayment,
  updateClientPayment as updateSupabaseClientPayment,
  updateDriverPayment as updateSupabaseDriverPayment,
} from "../services/paymentService";
import type {
  ClientPayment,
  ClientPaymentInput,
  ClientPaymentUpdateInput,
  DriverPayment,
  DriverPaymentInput,
  DriverPaymentUpdateInput,
  Invoice,
  Shipment,
} from "../types/domain";
import { useAuth } from "./useAuth";
import { useGlobalRefresh, notifyGlobalRefresh } from "./useGlobalRefresh";
import { calculateInvoiceBalance } from "../domain/financials";

const demoClientPaymentsKey = "transportflow-demo-client-payments";
const demoDriverPaymentsKey = "transportflow-demo-driver-payments";

function readDemoPayments<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString();
}

function demoClientPayment(input: ClientPaymentInput, invoice?: Invoice): ClientPayment {
  const now = nowTimestamp();
  return {
    id: `demo-client-payment-${crypto.randomUUID()}`,
    organizationId: "demo-organization",
    invoiceId: input.invoiceId,
    clientId: input.clientId,
    shipmentId: input.shipmentId ?? null,
    amount: input.amount,
    direction: 1,
    reversalOfId: null,
    idempotencyKey: input.idempotencyKey ?? null,
    paymentDate: input.paymentDate ?? nowDate(),
    paymentMethod: input.paymentMethod ?? null,
    referenceNo: input.referenceNo ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    clientName: invoice?.clientName ?? null,
    shipmentReference: invoice?.shipmentReference ?? null,
  };
}

function demoDriverPayment(input: DriverPaymentInput, shipment?: Shipment): DriverPayment {
  const now = nowTimestamp();
  const assignment = shipment?.assignments?.find((item) =>
    input.shipmentAssignmentId ? item.id === input.shipmentAssignmentId : item.driverId === input.driverId,
  );
  return {
    id: `demo-driver-payment-${crypto.randomUUID()}`,
    organizationId: "demo-organization",
    driverId: input.driverId,
    shipmentId: input.shipmentId ?? null,
    shipmentAssignmentId: input.shipmentAssignmentId ?? null,
    amount: input.amount,
    direction: 1,
    reversalOfId: null,
    idempotencyKey: input.idempotencyKey ?? null,
    paymentType: input.paymentType ?? "settlement",
    paymentDate: input.paymentDate ?? nowDate(),
    paymentMethod: input.paymentMethod ?? null,
    referenceNo: input.referenceNo ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    driverName: assignment?.driverName ?? shipment?.driverName ?? null,
    shipmentReference: shipment?.invoice ?? null,
  };
}

export function usePayments(invoices: Invoice[] = [], shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>(() => env.demoMode ? readDemoPayments<ClientPayment>(demoClientPaymentsKey) : []);
  const [driverPayments, setDriverPayments] = useState<DriverPayment[]>(() => env.demoMode ? readDemoPayments<DriverPayment>(demoDriverPaymentsKey) : []);
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;
    localStorage.setItem(demoClientPaymentsKey, JSON.stringify(clientPayments));
  }, [clientPayments]);

  useEffect(() => {
    if (!env.demoMode) return;
    localStorage.setItem(demoDriverPaymentsKey, JSON.stringify(driverPayments));
  }, [driverPayments]);

  const refreshPayments = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setClientPayments([]);
      setDriverPayments([]);
      setError("No active organization is available for loading payments.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [clientRows, driverRows] = await Promise.all([
        listClientPayments(organizationId),
        listDriverPayments(organizationId),
      ]);
      setClientPayments(clientRows);
      setDriverPayments(driverRows);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Unable to load payments.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshPayments();
  }, [refreshPayments]);

  useGlobalRefresh(refreshPayments, "payments");

  const createClientPayment = useCallback(
    async (input: ClientPaymentInput) => {
      if (env.demoMode) {
        const invoice = invoices.find((item) => item.id === input.invoiceId);
        if (!invoice) throw new Error("Select an invoice before recording a client payment.");
        if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
        const duplicate = input.idempotencyKey
          ? clientPayments.find((payment) => payment.idempotencyKey === input.idempotencyKey)
          : null;
        if (duplicate) return duplicate;
        const balance = calculateInvoiceBalance(invoice, clientPayments).balance;
        if (input.amount > balance) throw new Error(`Payment exceeds the outstanding invoice balance of ${balance.toFixed(2)}.`);
        const created = demoClientPayment(input, invoice);
        setClientPayments((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating client payments.");
      const created = await createSupabaseClientPayment(organizationId, input);
      setClientPayments((current) => [created, ...current]);
      notifyGlobalRefresh("payments");
      return created;
    },
    [clientPayments, invoices, organizationId],
  );

  const updateClientPayment = useCallback(async (paymentId: string, input: ClientPaymentUpdateInput) => {
    if (env.demoMode) {
      let updated: ClientPayment | null = null;
      setClientPayments((current) =>
        current.map((payment) => {
          if (payment.id !== paymentId) return payment;
          updated = { ...payment, ...input, updatedAt: nowTimestamp() };
          return updated;
        }),
      );
      return updated;
    }

    if (!organizationId) throw new Error("No active organization is available for updating client payments.");

    const updated = await updateSupabaseClientPayment(organizationId, paymentId, input);
    setClientPayments((current) => current.map((payment) => (payment.id === paymentId ? updated : payment)));
    notifyGlobalRefresh("payments");
    return updated;
  }, [organizationId]);

  const deleteClientPayment = useCallback(async (paymentId: string) => {
    if (env.demoMode) {
      setClientPayments((current) => current.filter((payment) => payment.id !== paymentId && payment.reversalOfId !== paymentId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting client payments.");

    await softDeleteClientPayment(organizationId, paymentId);
    setClientPayments((current) => current.filter((payment) => payment.id !== paymentId && payment.reversalOfId !== paymentId));
    notifyGlobalRefresh("payments");
  }, [organizationId]);

  const createDriverPayment = useCallback(
    async (input: DriverPaymentInput) => {
      if (env.demoMode) {
        const shipment = shipments.find((item) => item.id === input.shipmentId);
        if (!shipment) throw new Error("Select a shipment before recording a driver payment.");
        if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
        const duplicate = input.idempotencyKey
          ? driverPayments.find((payment) => payment.idempotencyKey === input.idempotencyKey)
          : null;
        if (duplicate) return duplicate;
        const assignment = input.shipmentAssignmentId
          ? shipment.assignments?.find((item) => item.id === input.shipmentAssignmentId)
          : shipment.assignments?.find((item) => item.driverId === input.driverId);
        const balance = assignment?.pending ?? shipment.pending;
        if (input.amount > balance) throw new Error(`Payment exceeds the outstanding driver balance of ${balance.toFixed(2)}.`);
        const created = demoDriverPayment(input, shipment);
        setDriverPayments((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating driver payments.");
      const created = await createSupabaseDriverPayment(organizationId, input);
      setDriverPayments((current) => [created, ...current]);
      notifyGlobalRefresh("payments");
      return created;
    },
    [driverPayments, organizationId, shipments],
  );

  const updateDriverPayment = useCallback(async (paymentId: string, input: DriverPaymentUpdateInput) => {
    if (env.demoMode) {
      let updated: DriverPayment | null = null;
      setDriverPayments((current) =>
        current.map((payment) => {
          if (payment.id !== paymentId) return payment;
          updated = { ...payment, ...input, updatedAt: nowTimestamp() };
          return updated;
        }),
      );
      return updated;
    }

    if (!organizationId) throw new Error("No active organization is available for updating driver payments.");

    const updated = await updateSupabaseDriverPayment(organizationId, paymentId, input);
    setDriverPayments((current) => current.map((payment) => (payment.id === paymentId ? updated : payment)));
    notifyGlobalRefresh("payments");
    return updated;
  }, [organizationId]);

  const deleteDriverPayment = useCallback(async (paymentId: string) => {
    if (env.demoMode) {
      setDriverPayments((current) => current.filter((payment) => payment.id !== paymentId && payment.reversalOfId !== paymentId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting driver payments.");

    await softDeleteDriverPayment(organizationId, paymentId);
    setDriverPayments((current) => current.filter((payment) => payment.id !== paymentId && payment.reversalOfId !== paymentId));
    notifyGlobalRefresh("payments");
  }, [organizationId]);

  const activeClientPayments = useMemo(() => clientPayments.filter((payment) => !payment.deletedAt), [clientPayments]);
  const activeDriverPayments = useMemo(() => driverPayments.filter((payment) => !payment.deletedAt), [driverPayments]);

  return {
    clientPayments: activeClientPayments,
    driverPayments: activeDriverPayments,
    loading,
    error,
    refreshPayments,
    createClientPayment,
    updateClientPayment,
    deleteClientPayment,
    createDriverPayment,
    updateDriverPayment,
    deleteDriverPayment,
  };
}
