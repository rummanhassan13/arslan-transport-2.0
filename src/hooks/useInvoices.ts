import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createInvoice as createSupabaseInvoice,
  generateInvoiceForShipment as generateSupabaseInvoiceForShipment,
  listInvoiceItems,
  listInvoices,
  softDeleteInvoice,
  transitionInvoiceLifecycle,
} from "../services/invoiceService";
import type { Invoice, InvoiceInput, InvoiceItem, InvoiceRecordStatus, Shipment, ShipmentExpense } from "../types/domain";
import { calculateShipmentFinancials, getExpenseClientBillAmount } from "../utils/calculations";
import { useAuth } from "./useAuth";
import { useBusinessSettings } from "./useBusinessSettings";
import { useGlobalRefresh, notifyGlobalRefresh } from "./useGlobalRefresh";

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString();
}

const demoInvoicesKey = "transportflow-demo-invoices-v2";
const demoInvoiceItemsKey = "transportflow-demo-invoice-items-v2";

function readDemoRows<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function mapShipmentInvoiceStatus(status: Shipment["invoiceStatus"]): InvoiceRecordStatus {
  if (status === "Sent") return "sent";
  if (status === "Paid") return "paid";
  if (status === "Overdue") return "overdue";
  return "draft";
}

function buildDemoInvoices(shipments: Shipment[]): Invoice[] {
  const now = nowTimestamp();
  return shipments.map((shipment) => {
    const subtotal = Number(shipment.companyRate) || 0;
    const expenseTotal = shipment.gatePass + shipment.fashah + shipment.naql;
    const totalAmount = subtotal + expenseTotal;

    return {
      id: `demo-invoice-${shipment.id}`,
      organizationId: "demo-organization",
      invoiceNumber: shipment.invoice,
      invoicePrefix: null,
      shipmentId: shipment.id,
      clientId: shipment.clientId ?? null,
      issueDate: shipment.date,
      dueDate: null,
      status: mapShipmentInvoiceStatus(shipment.invoiceStatus),
      clientSnapshot: { name: shipment.customer },
      shipmentSnapshot: {
        loadingPoint: shipment.loadingPoint,
        destination: shipment.destination,
        vehicleNo: shipment.vehicleNo,
        truckType: shipment.truckType,
        driverName: shipment.driverName,
        assignments: shipment.assignments ?? [],
      },
      subtotal,
      expenseTotal,
      totalAmount,
      notes: shipment.remarks || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      clientName: shipment.customer,
      shipmentReference: shipment.invoice,
      destination: shipment.destination,
    };
  });
}

function buildDemoInvoiceItems(invoices: Invoice[], shipments: Shipment[]): InvoiceItem[] {
  const now = nowTimestamp();
  return invoices.flatMap((invoice) => {
    const shipment = shipments.find((item) => item.id === invoice.shipmentId);
    if (!shipment) return [];

    const rows: { id: string; itemType: "transport" | "expense" | "adjustment" | "other"; description: string; amount: number }[] = [];
    
    let transportDesc = `TRIP FROM: ${shipment.loadingPoint || "LOADING POINT"} TO ${shipment.destination || "DESTINATION"}`;
    if (Array.isArray(shipment.assignments) && shipment.assignments.length > 0) {
      const driverDetails = shipment.assignments.filter(Boolean).map((a, index) => 
        `Driver ${index + 1}: ${a?.driverName || "Not specified"}\nTruck No: ${a?.vehicleNo || "Not specified"}\nVehicle Type: ${a?.truckType || "Not specified"}`
      ).join("\n\n");
      transportDesc += `\n\n${driverDetails}`;
    }
    rows.push({ id: "transport", itemType: "transport", description: transportDesc, amount: Number(shipment.companyRate) || 0 });

    return rows.map((item) => ({
      id: `demo-invoice-item-${invoice.id}-${item.id}`,
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      itemType: item.itemType,
      description: item.description,
      quantity: 1,
      unitPrice: item.amount,
      amount: item.amount,
      snapshot: { shipmentId: shipment.id, assignments: shipment.assignments ?? [] },
      createdAt: now,
    }));
  });
}

export function useInvoices(shipments: Shipment[], expenses: ShipmentExpense[] = []) {
  const { activeOrganization } = useAuth();
  const { formatInvoiceNumber, invoice: invoiceSettings } = useBusinessSettings();
  const [invoices, setInvoices] = useState<Invoice[]>(() => env.demoMode ? readDemoRows<Invoice>(demoInvoicesKey) : []);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(() => env.demoMode ? readDemoRows<InvoiceItem>(demoInvoiceItemsKey) : []);
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;
    localStorage.setItem(demoInvoicesKey, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    if (!env.demoMode) return;
    localStorage.setItem(demoInvoiceItemsKey, JSON.stringify(invoiceItems));
  }, [invoiceItems]);

  const refreshInvoices = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setInvoices([]);
      setInvoiceItems([]);
      setError("No active organization is available for loading invoices.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [invoiceRows, itemRows] = await Promise.all([listInvoices(organizationId), listInvoiceItems(organizationId)]);
      setInvoices(invoiceRows);
      setInvoiceItems(itemRows);
    } catch (invoiceError) {
      setError(invoiceError instanceof Error ? invoiceError.message : "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refreshInvoices();
  }, [refreshInvoices]);

  useGlobalRefresh(refreshInvoices, "invoices");

  const createInvoice = useCallback(
    async (input: InvoiceInput, items: Omit<InvoiceItem, "id" | "organizationId" | "invoiceId" | "createdAt">[] = []) => {
      if (env.demoMode) {
        const now = nowTimestamp();
        const created: Invoice = {
          id: `demo-invoice-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          invoicePrefix: input.invoicePrefix ?? null,
          shipmentId: input.shipmentId ?? null,
          clientId: input.clientId ?? null,
          issueDate: input.issueDate ?? nowDate(),
          dueDate: input.dueDate ?? null,
          status: input.status ?? "draft",
          clientSnapshot: input.clientSnapshot ?? {},
          shipmentSnapshot: input.shipmentSnapshot ?? {},
          subtotal: input.subtotal ?? 0,
          expenseTotal: input.expenseTotal ?? 0,
          totalAmount: input.totalAmount ?? 0,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          invoiceNumber: input.invoiceNumber,
          clientName: (input.clientSnapshot?.name as string | undefined) ?? null,
          shipmentReference: (input.shipmentSnapshot?.invoice as string | undefined) ?? null,
          destination: (input.shipmentSnapshot?.destination as string | undefined) ?? null,
        };
        const createdItems: InvoiceItem[] = items.map((item) => ({
          ...item,
          id: `demo-invoice-item-${crypto.randomUUID()}`,
          organizationId: created.organizationId,
          invoiceId: created.id,
          createdAt: now,
        }));
        setInvoices((current) => [created, ...current]);
        setInvoiceItems((current) => [...current, ...createdItems]);
        notifyGlobalRefresh("invoices");
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating invoices.");

      const created = await createSupabaseInvoice(
        organizationId,
        input,
        items.map((item) => ({
          invoiceId: "",
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
          snapshot: item.snapshot,
        })),
      );
      setInvoices((current) => [created.invoice, ...current]);
      setInvoiceItems((current) => [...current, ...created.items]);
      notifyGlobalRefresh("invoices");
      return created.invoice;
    },
    [organizationId],
  );

  const createInvoiceForShipment = useCallback(
    async (shipment: Shipment) => {
      const existing = invoices.find((invoice) => invoice.shipmentId === shipment.id);
      if (existing) return existing;

      if (!env.demoMode) {
        if (!organizationId) throw new Error("No active organization is available for generating invoices.");
        const generated = await generateSupabaseInvoiceForShipment(organizationId, shipment.id);
        setInvoices((current) => [generated.invoice, ...current.filter((item) => item.id !== generated.invoice.id)]);
        setInvoiceItems((current) => [
          ...current.filter((item) => item.invoiceId !== generated.invoice.id),
          ...generated.items,
        ]);
        return generated.invoice;
      }

      const shipmentExpenses = expenses.filter((expense) => expense.shipmentId === shipment.id);
      const financials = calculateShipmentFinancials(shipment, shipmentExpenses);
      const invoiceNumber = formatInvoiceNumber(shipment.invoiceReference || shipment.invoice || shipment.shipmentNo);
      const clientSnapshot = {
        id: shipment.clientId ?? null,
        name: shipment.customer,
      };
      const shipmentSnapshot = {
        id: shipment.id,
        invoice: shipment.invoice,
        shipmentNo: shipment.shipmentNo ?? null,
        date: shipment.date,
        loadingPoint: shipment.loadingPoint,
        destination: shipment.destination,
        vehicleNo: shipment.vehicleNo,
        truckType: shipment.truckType,
        driverName: shipment.driverName,
        assignments: shipment.assignments ?? [],
      };
      const expenseItems = shipmentExpenses
        .filter((expense) => expense.approved && expense.clientBillable && expense.includedInInvoice)
        .map((expense) => {
          const billAmount = getExpenseClientBillAmount(expense);
          return {
            itemType: "expense" as const,
            description: String(expense.category || "").replace(/_/g, " "),
            quantity: 1,
            unitPrice: billAmount,
            amount: billAmount,
            snapshot: { expenseId: expense.id, category: expense.category },
          };
        });

      const calculatedSubtotal = Number(shipment.companyRate) || 0;

      let transportDesc = `TRIP FROM: ${shipment.loadingPoint || "LOADING POINT"} TO ${shipment.destination || "DESTINATION"}`;
      if (Array.isArray(shipment.assignments) && shipment.assignments.length > 0) {
        const driverDetails = shipment.assignments.filter(Boolean).map((a, index) => 
          `Driver ${index + 1}: ${a?.driverName || "Not specified"}\nTruck No: ${a?.vehicleNo || "Not specified"}\nVehicle Type: ${a?.truckType || "Not specified"}`
        ).join("\n\n");
        transportDesc += `\n\n${driverDetails}`;
      }

      const transportItems: Omit<InvoiceItem, "id" | "organizationId" | "invoiceId" | "createdAt">[] = [
        {
          itemType: "transport",
          description: transportDesc,
          quantity: 1,
          unitPrice: Number(shipment.companyRate) || 0,
          amount: Number(shipment.companyRate) || 0,
          snapshot: { shipmentId: shipment.id, assignments: shipment.assignments ?? [] },
        }
      ];

      const totalAmount = calculatedSubtotal + financials.clientBillable;

      return createInvoice(
        {
          invoiceNumber,
          invoicePrefix: invoiceSettings.invoicePrefix,
          shipmentId: shipment.id,
          clientId: shipment.clientId ?? null,
          issueDate: nowDate(),
          dueDate: (() => {
            const days = Number.parseInt(invoiceSettings.dueDateTerms, 10) || 0;
            const due = new Date();
            due.setDate(due.getDate() + days);
            return due.toISOString().slice(0, 10);
          })(),
          status: "draft",
          clientSnapshot,
          shipmentSnapshot,
          subtotal: calculatedSubtotal,
          expenseTotal: financials.clientBillable,
          totalAmount: totalAmount,
          notes: shipment.remarks || null,
        },
        [
          ...transportItems,
          ...expenseItems,
        ],
      );
    },
    [createInvoice, expenses, formatInvoiceNumber, invoiceSettings, invoices, organizationId],
  );

  const updateInvoiceStatus = useCallback(async (invoiceId: string, status: InvoiceRecordStatus) => {
    if (!["draft", "sent", "cancelled"].includes(status)) {
      throw new Error("Paid, partially paid, and overdue are derived from the payment ledger and due date.");
    }
    if (env.demoMode) {
      let updated: Invoice | null = null;
      setInvoices((current) =>
        current.map((invoice) => {
          if (invoice.id !== invoiceId) return invoice;
          updated = { ...invoice, status, updatedAt: nowTimestamp() };
          return updated;
        }),
      );
      notifyGlobalRefresh("invoices");
      return updated;
    }

    if (!organizationId) throw new Error("No active organization is available for updating invoices.");

    const updated = await transitionInvoiceLifecycle(organizationId, invoiceId, status as "draft" | "sent" | "cancelled");
    setInvoices((current) => current.map((invoice) => (invoice.id === invoiceId ? updated : invoice)));
    notifyGlobalRefresh("invoices");
    return updated;
  }, [organizationId]);

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    if (env.demoMode) {
      setInvoices((current) => current.map((invoice) => invoice.id === invoiceId
        ? { ...invoice, status: "cancelled", voidedAt: nowTimestamp(), updatedAt: nowTimestamp() }
        : invoice));
      notifyGlobalRefresh("invoices");
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting invoices.");

    await softDeleteInvoice(organizationId, invoiceId);
    setInvoices((current) => current.map((invoice) => invoice.id === invoiceId
      ? { ...invoice, status: "cancelled", voidedAt: nowTimestamp(), updatedAt: nowTimestamp() }
      : invoice));
  }, [organizationId]);

  const invoiceItemsByInvoice = useMemo(() => {
    const map = new Map<string, InvoiceItem[]>();
    invoiceItems.forEach((item) => map.set(item.invoiceId, [...(map.get(item.invoiceId) ?? []), item]));
    return map;
  }, [invoiceItems]);

  return {
    invoices: invoices.filter((invoice) => !invoice.deletedAt),
    invoiceItems,
    invoiceItemsByInvoice,
    loading,
    error,
    refreshInvoices,
    createInvoice,
    createInvoiceForShipment,
    updateInvoiceStatus,
    deleteInvoice,
  };
}
