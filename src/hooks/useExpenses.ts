import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createExpense as createSupabaseExpense,
  listExpenses,
  listExpensesByShipment,
  softDeleteExpense,
  updateExpense as updateSupabaseExpense,
} from "../services/expenseService";
import type { ExpenseFilters, Shipment, ShipmentExpense, ShipmentExpenseInput, ShipmentExpenseUpdateInput } from "../types/domain";
import { useAuth } from "./useAuth";
import { useGlobalRefresh, notifyGlobalRefresh } from "./useGlobalRefresh";

function timestamp() {
  return new Date().toISOString();
}

function demoExpenseId(shipmentId: string, category: string) {
  return `demo-expense-${shipmentId}-${category}`;
}

function buildExpenseAmounts(actualCostAmount: number, clientBillAmount = actualCostAmount) {
  return {
    amount: actualCostAmount,
    actualCostAmount,
    clientBillAmount,
  };
}

function buildDemoExpenses(shipments: Shipment[]): ShipmentExpense[] {
  return shipments.flatMap((shipment) => {
    const base = {
      organizationId: "demo-organization",
      shipmentId: shipment.id,
      shipmentNo: shipment.shipmentNo ?? shipment.invoice,
      invoiceReference: shipment.invoice,
      clientName: shipment.customer,
      driverName: shipment.driverName,
      paidBy: "company" as const,
      clientBillable: true,
      driverReimbursable: false,
      approved: true,
      includedInInvoice: true,
      expenseDate: shipment.date,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      deletedAt: null,
    };

    return [
      shipment.gatePass
        ? { ...base, id: demoExpenseId(shipment.id, "gate_pass"), category: "gate_pass" as const, ...buildExpenseAmounts(shipment.gatePass), notes: "Demo Gate Pass expense." }
        : null,
      shipment.fashah
        ? { ...base, id: demoExpenseId(shipment.id, "fashah"), category: "fashah" as const, ...buildExpenseAmounts(shipment.fashah), notes: "Demo Fashah expense." }
        : null,
      shipment.naql
        ? { ...base, id: demoExpenseId(shipment.id, "naql"), category: "naql" as const, ...buildExpenseAmounts(shipment.naql), notes: "Demo NAQL expense." }
        : null,
    ].filter(Boolean) as ShipmentExpense[];
  });
}

function applyFilters(expenses: ShipmentExpense[], filters: ExpenseFilters) {
  return expenses.filter((expense) => {
    return (
      (!filters.shipmentId || expense.shipmentId === filters.shipmentId) &&
      (!filters.category || expense.category === filters.category) &&
      (!filters.paidBy || expense.paidBy === filters.paidBy) &&
      (!filters.approved || (filters.approved === "approved" ? expense.approved : !expense.approved)) &&
      (!filters.dateFrom || expense.expenseDate >= filters.dateFrom) &&
      (!filters.dateTo || expense.expenseDate <= filters.dateTo)
    );
  });
}

export function useExpenses(shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [expenses, setExpenses] = useState<ShipmentExpense[]>(() => buildDemoExpenses(shipments));
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;

    setExpenses((current) => {
      const currentIds = new Set(current.map((expense) => expense.id));
      const derived = buildDemoExpenses(shipments).filter((expense) => !currentIds.has(expense.id));
      return [...current, ...derived].filter((expense) => !expense.deletedAt);
    });
  }, [shipments]);

  const refreshExpenses = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setExpenses([]);
      setError("No active organization is available for loading expenses.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setExpenses(await listExpenses(organizationId, filters));
    } catch (expenseError) {
      setError(expenseError instanceof Error ? expenseError.message : "Unable to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [filters, organizationId]);

  useEffect(() => {
    void refreshExpenses();
  }, [refreshExpenses]);

  useGlobalRefresh(refreshExpenses, "expenses");

  const createExpense = useCallback(
    async (input: ShipmentExpenseInput) => {
      if (env.demoMode) {
        const shipment = shipments.find((item) => item.id === input.shipmentId);
        const now = timestamp();
        const actualCostAmount = input.actualCostAmount ?? input.amount;
        const clientBillAmount = input.clientBillAmount ?? actualCostAmount;
        const created: ShipmentExpense = {
          id: `demo-expense-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          shipmentId: input.shipmentId,
          shipmentNo: shipment?.shipmentNo ?? shipment?.invoice ?? null,
          invoiceReference: shipment?.invoice ?? null,
          clientName: shipment?.customer ?? null,
          driverName: shipment?.driverName ?? null,
          category: input.category,
          amount: actualCostAmount,
          actualCostAmount,
          clientBillAmount,
          paidBy: input.paidBy ?? "company",
          clientBillable: input.clientBillable ?? true,
          driverReimbursable: input.driverReimbursable ?? false,
          approved: input.approved ?? false,
          includedInInvoice: input.includedInInvoice ?? true,
          expenseDate: input.expenseDate ?? new Date().toISOString().slice(0, 10),
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        setExpenses((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating expenses.");

      const created = await createSupabaseExpense(organizationId, input);
      setExpenses((current) => [created, ...current]);
      notifyGlobalRefresh("expenses");
      return created;
    },
    [organizationId, shipments],
  );

  const updateExpense = useCallback(async (expenseId: string, input: ShipmentExpenseUpdateInput) => {
    if (env.demoMode) {
      let updatedExpense: ShipmentExpense | null = null;
      setExpenses((current) =>
        current.map((expense) => {
          if (expense.id !== expenseId) return expense;
          const actualCostAmount = input.actualCostAmount ?? input.amount ?? expense.actualCostAmount ?? expense.amount;
          const clientBillAmount = input.clientBillAmount ?? expense.clientBillAmount ?? actualCostAmount;
          updatedExpense = {
            ...expense,
            ...input,
            amount: actualCostAmount,
            actualCostAmount,
            clientBillAmount,
            paidBy: input.paidBy ?? expense.paidBy,
            clientBillable: input.clientBillable ?? expense.clientBillable,
            driverReimbursable: input.driverReimbursable ?? expense.driverReimbursable,
            approved: input.approved ?? expense.approved,
            includedInInvoice: input.includedInInvoice ?? expense.includedInInvoice,
            expenseDate: input.expenseDate ?? expense.expenseDate,
            notes: input.notes ?? expense.notes,
            updatedAt: timestamp(),
          };
          return updatedExpense;
        }),
      );
      return updatedExpense;
    }

    if (!organizationId) throw new Error("No active organization is available for updating expenses.");

    const updated = await updateSupabaseExpense(organizationId, expenseId, input);
    setExpenses((current) => current.map((expense) => (expense.id === expenseId ? updated : expense)));
    notifyGlobalRefresh("expenses");
    return updated;
  }, [organizationId]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    if (env.demoMode) {
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting expenses.");

    await softDeleteExpense(organizationId, expenseId);
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
    notifyGlobalRefresh("expenses");
  }, [organizationId]);

  const listByShipment = useCallback(
    async (shipmentId: string) => {
      if (env.demoMode) return applyFilters(expenses, { shipmentId });
      if (!organizationId) throw new Error("No active organization is available for loading shipment expenses.");
      return listExpensesByShipment(organizationId, shipmentId);
    },
    [expenses, organizationId],
  );

  const allExpenses = useMemo(() => expenses.filter((expense) => !expense.deletedAt), [expenses]);
  const filteredExpenses = useMemo(() => applyFilters(allExpenses, filters), [allExpenses, filters]);

  return {
    expenses: filteredExpenses,
    allExpenses,
    loading,
    error,
    filters,
    setFilters,
    refreshExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    listByShipment,
  };
}
