import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";
import { AddShipmentModal, InvoicePreview, PaymentModal } from "./components/modals";
import { ShipmentSummaryModal } from "./components/ShipmentSummaryModal";
import { ShipmentPrintBundleModal } from "./components/ShipmentPrintBundleModal";
import { Toast } from "./components/ui";
import { AuthProvider } from "./contexts/AuthContext";
import { BusinessSettingsProvider } from "./contexts/BusinessSettingsContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import { env } from "./config/env";
import { views } from "./constants/views";
import { useAuth } from "./hooks/useAuth";
import { useCurrency } from "./hooks/useCurrency";
import { useClients } from "./hooks/useClients";
import { useDrivers } from "./hooks/useDrivers";
import { useExpenses } from "./hooks/useExpenses";
import { useInvoices } from "./hooks/useInvoices";
import { usePayments } from "./hooks/usePayments";
import { useRouteLocations } from "./hooks/useRouteLocations";
import { useShipments } from "./hooks/useShipments";
import { useTruckTypes } from "./hooks/useTruckTypes";
import { useVehicles } from "./hooks/useVehicles";
import { DashboardPage } from "./pages/DashboardPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { FinancePage } from "./pages/FinancePage";
import { LoginPage } from "./pages/LoginPage";
import { NoOrganizationAccess } from "./pages/NoOrganizationAccess";
import { ReportsPage } from "./pages/ReportsPage";
import { ShipmentsPage } from "./pages/ShipmentsPage";
import type { DriverPaymentInput, Invoice, ClientPaymentInput, Shipment, ShipmentAttachment, ShipmentInput, View } from "./types/domain";
import type { RouteLocationType } from "./services/routeLocationService";
import { buildStats, calculateShipmentFinancials } from "./utils/calculations";
import { deriveDisplayInvoiceStatus, deriveClientPaymentStatus } from "./utils/statusDerivation";
import {
  calculateInvoiceBalance,
  calculateShipmentProjection,
  signedDriverPaymentAmount,
  sumMoney,
} from "./domain/financials";

const ACTIVE_VIEW_STORAGE_KEY = "transportflow.activeView";
const UI_STATE_STORAGE_KEY = "transportflow.ui";

function isValidView(value: string | null): value is View {
  return views.includes(value as View);
}

function getStoredView(): View {
  if (typeof window === "undefined") return "Shipments";

  try {
    const rawUi = window.sessionStorage.getItem(UI_STATE_STORAGE_KEY);
    if (rawUi) {
      const parsed = JSON.parse(rawUi);
      if (parsed.view && isValidView(parsed.view)) return parsed.view;
    }
  } catch {
    // Ignore malformed legacy session state and fall back to the stored view.
  }

  const storedView = window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
  return isValidView(storedView) ? storedView : "Shipments";
}

function storeView(view: View) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
}

function clearStoredNavigationState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
  window.sessionStorage.removeItem(UI_STATE_STORAGE_KEY);
}

export default function App() {
  if (env.demoMode) {
    return (
      <AuthProvider>
        <CurrencyProvider>
          <BusinessSettingsProvider>
            <DemoApp />
          </BusinessSettingsProvider>
        </CurrencyProvider>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <CurrencyProvider>
        <BusinessSettingsProvider>
          <AuthenticatedAppGate />
        </BusinessSettingsProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}

function AuthenticatedAppGate() {
  const { session, activeOrganization, activeMembership, loading, signIn, signOut, configurationError } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session || configurationError || !activeMembership) {
      clearStoredNavigationState();
    }
  }, [activeMembership, configurationError, loading, session]);

  if (loading) {
    return (
      <main className="auth-shell">
        <div className="auth-loading-card">
          Loading TransportFlow...
        </div>
      </main>
    );
  }

  if (!session || configurationError) {
    return <LoginPage onSignIn={signIn} loading={loading} initialError={configurationError} />;
  }

  if (!activeMembership) {
    return <NoOrganizationAccess onSignOut={signOut} />;
  }

  return <DemoApp />;
}

function DemoApp() {
  const initialUiState = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(UI_STATE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [view, setStoredView] = useState<View>(() => {
    if (initialUiState?.view && isValidView(initialUiState.view)) return initialUiState.view as View;
    return getStoredView();
  });
  const setView = useCallback((nextView: View) => {
    setStoredView(nextView);
    storeView(nextView);
  }, []);
  useCurrency();
  const { shipments, setShipments, loading: shipmentsLoading, error: shipmentsError, createShipment, updateShipment, transitionShipmentStatus, deleteShipment } = useShipments();
  const { clients, createClient } = useClients(shipments);
  const { drivers, createDriver, updateDriver } = useDrivers(shipments);
  const { truckTypes, createTruckType } = useTruckTypes(shipments);
  const { vehicles, createVehicle, updateVehicle } = useVehicles(shipments, truckTypes);
  const { loadingPoints, destinations, createRouteLocation } = useRouteLocations(shipments);
  const {
    expenses,
    allExpenses,
    loading: expensesLoading,
    error: expensesError,
    filters: expenseFilters,
    setFilters: setExpenseFilters,
    createExpense,
    updateExpense,
    deleteExpense,
  } = useExpenses(shipments);
  const baseShipments = useMemo(() => {
    return shipments.map((shipment) => {
      const financials = calculateShipmentFinancials(
        shipment,
        allExpenses.filter((expense) => expense.shipmentId === shipment.id),
      );
      return {
        ...shipment,
        companyTotal: financials.companyTotal,
        driverTotal: financials.driverTotal,
        netProfit: financials.estimatedProfit,
        pending: financials.driverTotal - shipment.advance,
      };
    });
  }, [allExpenses, shipments]);
  const {
    invoices,
    invoiceItems,
    invoiceItemsByInvoice,
    loading: invoicesLoading,
    error: invoicesError,
    createInvoiceForShipment,
    refreshInvoices,
    updateInvoiceStatus,
    deleteInvoice,
  } = useInvoices(baseShipments, allExpenses);
  const {
    clientPayments,
    driverPayments,
    loading: paymentsLoading,
    error: paymentsError,
    createClientPayment,
    updateClientPayment,
    deleteClientPayment,
    createDriverPayment,
    updateDriverPayment,
    deleteDriverPayment,
    refreshPayments,
  } = usePayments(invoices, baseShipments);

  /* Enriched shipments: overlay live invoice/payment statuses onto base financials */
  const displayShipments = useMemo(() => {
    return baseShipments.map((shipment) => {
      const invoice = invoices.find((inv) => inv.shipmentId === shipment.id);
      const shipClientPayments = clientPayments.filter(
        (p) => p.shipmentId === shipment.id || (invoice?.id && p.invoiceId === invoice.id),
      );
      const shipDriverPayments = driverPayments.filter((p) => p.shipmentId === shipment.id);
      const projection = calculateShipmentProjection(
        shipment,
        allExpenses.filter((expense) => expense.shipmentId === shipment.id),
        shipDriverPayments,
      );
      const invoiceBalance = invoice ? calculateInvoiceBalance(invoice, shipClientPayments) : null;
      const clientPaid = invoiceBalance?.paid ?? 0;
      const clientBalance = invoice?.status === "cancelled"
        ? 0
        : invoiceBalance?.balance ?? projection.estimatedClientRevenue;
      const enrichedAssignments = shipment.assignments?.map((assignment, index) => {
        const settlementById = assignment.id
          ? projection.assignmentSettlements.find((item) => item.assignmentId === assignment.id)
          : undefined;
        const settlementsForDriver = projection.assignmentSettlements.filter((item) => item.driverId === assignment.driverId);
        const settlement = settlementById
          ?? (settlementsForDriver.length === 1 ? settlementsForDriver[0] : undefined)
          ?? (shipment.assignments?.length === 1 ? projection.assignmentSettlements[index] : undefined);
        return {
          ...assignment,
          advancePaid: settlement?.advancePaid ?? 0,
          totalPaid: settlement?.totalPaid ?? 0,
          pending: settlement?.balance ?? assignment.driverRate,
        };
      });
      const totalDriverAdvance = sumMoney(
        shipDriverPayments
          .filter((payment) => payment.paymentType === "advance")
          .map(signedDriverPaymentAmount),
      );

      return {
        ...shipment,
        assignments: enrichedAssignments,
        advance: totalDriverAdvance,
        companyTotal: projection.estimatedClientRevenue,
        driverRate: projection.baseDriverPayable,
        driverTotal: projection.baseDriverPayable + projection.driverReimbursementsPayable,
        netProfit: projection.estimatedProfit,
        driverPaid: projection.driverPaid,
        pending: projection.driverBalance,
        clientPaid,
        clientBalance,
        financialWarnings: projection.warnings.map((warning) => warning.message),
        invoiceStatus: deriveDisplayInvoiceStatus(shipment, invoice),
        clientPaymentStatus: deriveClientPaymentStatus(invoice?.totalAmount ?? projection.estimatedClientRevenue, clientPaid, invoice),
        driverPaymentStatus: projection.driverStatus,
      };
    });
  }, [allExpenses, baseShipments, invoices, clientPayments, driverPayments]);
  const [query, setQuery] = useState(initialUiState?.query ?? "");
  const [shipmentDialog, setShipmentDialog] = useState(initialUiState?.shipmentDialog ?? false);
  const [paymentDialog, setPaymentDialog] = useState<{ type?: "Client" | "Driver", shipmentId?: string, driverId?: string, invoiceId?: string } | null>(initialUiState?.paymentDialog ?? null);
  const [invoicePreview, setInvoicePreview] = useState<{ shipment: Shipment; invoice?: Invoice } | null>(null);
  const [shipmentPrintBundle, setShipmentPrintBundle] = useState<{
    shipment: Shipment;
    invoice: Invoice;
    attachments: ShipmentAttachment[];
  } | null>(null);
  const [toast, setToast] = useState("");

  const [summaryShipmentId, setSummaryShipmentId] = useState<string | null>(initialUiState?.summaryShipmentId ?? null);
  const summaryShipment = useMemo(() => {
    return displayShipments.find((s) => s.id === summaryShipmentId) || null;
  }, [displayShipments, summaryShipmentId]);

  const [editShipmentId, setEditShipmentId] = useState<string | null>(initialUiState?.editShipmentId ?? null);
  const editShipmentTarget = useMemo(() => {
    return displayShipments.find((s) => s.id === editShipmentId) || null;
  }, [displayShipments, editShipmentId]);

  useEffect(() => {
    const saveUiState = () => {
      window.sessionStorage.setItem(
        UI_STATE_STORAGE_KEY,
        JSON.stringify({
          view,
          query,
          shipmentDialog,
          summaryShipmentId,
          editShipmentId,
          paymentDialog,
        })
      );
    };

    saveUiState();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveUiState();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [view, query, shipmentDialog, summaryShipmentId, editShipmentId, paymentDialog]);

  const stats = useMemo(() => buildStats(displayShipments), [displayShipments]);


  const saveShipment = async (input: ShipmentInput) => {
    try {
      const client =
        clients.find((item) => item.name === input.customer) ||
        (input.customer.trim() ? await createClient({ name: input.customer.trim(), status: "active" }) : null);
      const driver =
        drivers.find((item) => item.name === input.driverName) ||
        (input.driverName.trim()
          ? await createDriver({ name: input.driverName.trim(), phone: input.cellNo?.trim() || null, status: "active" })
          : null);
      const truckType =
        truckTypes.find((item) => item.name === input.truckType) ||
        (input.truckType.trim() ? await createTruckType({ name: input.truckType.trim(), status: "active" }) : null);
      const vehicle =
        vehicles.find((item) => item.vehicleNumber === input.vehicleNo) ||
        (input.vehicleNo.trim()
          ? await createVehicle({
              vehicleNumber: input.vehicleNo.trim(),
              truckTypeId: truckType?.id ?? input.truckTypeId ?? null,
              driverId: driver?.id ?? input.driverId ?? null,
              status: "active",
            })
          : null);

      const preparedAssignments = await Promise.all((input.assignments || []).map(async (a) => {
        let aDriverId = a.driverId;
        if (!aDriverId && a.driverName.trim()) {
          const existingD = drivers.find(d => d.name === a.driverName.trim()) || 
            await createDriver({ name: a.driverName.trim(), status: "active" });
          aDriverId = existingD?.id || null;
        }
        
        let aVehicleId = a.vehicleId;
        if (!aVehicleId && a.vehicleNo?.trim()) {
          const existingV = vehicles.find(v => v.vehicleNumber === a.vehicleNo?.trim()) ||
            await createVehicle({ vehicleNumber: a.vehicleNo?.trim() || "", status: "active", driverId: aDriverId });
          aVehicleId = existingV?.id || null;
        }

        let aTruckTypeId = a.truckTypeId;
        if (!aTruckTypeId && a.truckType?.trim()) {
          const existingT = truckTypes.find(t => t.name === a.truckType?.trim()) ||
            await createTruckType({ name: a.truckType?.trim() || "", status: "active" });
          aTruckTypeId = existingT?.id || null;
        }

        return {
          ...a,
          driverId: aDriverId,
          vehicleId: aVehicleId,
          truckTypeId: aTruckTypeId,
        };
      }));

      const preparedInput = {
        ...input,
        clientId: client?.id ?? input.clientId ?? null,
        driverId: driver?.id ?? input.driverId ?? null,
        vehicleId: vehicle?.id ?? input.vehicleId ?? null,
        truckTypeId: truckType?.id ?? vehicle?.truckTypeId ?? input.truckTypeId ?? null,
        assignments: preparedAssignments,
      };

      if (editShipmentId) {
        await updateShipment(editShipmentId, preparedInput);
        setEditShipmentId(null);
        setToast("Shipment updated.");
      } else {
        const createdShipment = await createShipment(preparedInput);
        let generatedInvoice: Invoice;
        try {
          generatedInvoice = await createInvoiceForShipment(createdShipment);
        } catch (invoiceError) {
          if (env.demoMode) {
            await deleteShipment(createdShipment.id);
            throw new Error(
              `Shipment creation was rolled back because its invoice could not be generated: ${invoiceError instanceof Error ? invoiceError.message : "Unknown invoice error."}`,
              { cause: invoiceError },
            );
          }
          await refreshInvoices().catch(() => undefined);
          setShipmentDialog(false);
          setToast("Shipment and invoice were committed, but the invoice list could not be refreshed. Reload the app to synchronize it.");
          return;
        }
        if (env.demoMode) {
          const createdAssignments = createdShipment.assignments ?? [];
          for (const [index, assignmentInput] of (preparedInput.assignments ?? []).entries()) {
            const amount = Number(assignmentInput.advancePaid ?? assignmentInput.initialAdvance ?? 0);
            const createdAssignment = createdAssignments[index];
            if (amount > 0 && assignmentInput.driverId) {
              await createDriverPayment({
                driverId: assignmentInput.driverId,
                shipmentId: createdShipment.id,
                shipmentAssignmentId: createdAssignment?.id ?? null,
                amount,
                paymentType: "advance",
                paymentDate: createdShipment.date,
                idempotencyKey: `initial-advance-${createdShipment.id}-${createdAssignment?.id ?? index}`,
              });
            }
          }
          await refreshPayments();
        }
        setShipmentDialog(false);
        setToast(`Shipment saved and invoice ${generatedInvoice.invoiceNumber} generated automatically.`);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save shipment.");
    }
  };

  const saveRouteLocation = async (type: RouteLocationType, name: string) => {
    const created = await createRouteLocation(type, name);
    return created.name;
  };

  const saveDriverVehicleBundle = async (input: { driverName: string; vehicleNo: string; truckType: string; cellNo: string }) => {
    const cleanName = input.driverName.trim().replace(/\s+/g, " ");
    const cleanVehicle = input.vehicleNo.trim().replace(/\s+/g, " ").toUpperCase();
    const cleanTruckType = input.truckType.trim().replace(/\s+/g, " ").toUpperCase();
    const cleanPhone = input.cellNo.trim();
    const normalize = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

    if (!cleanName || !cleanVehicle || !cleanTruckType) {
      throw new Error("Driver name, vehicle number, and truck type are required.");
    }

    const truckType =
      truckTypes.find((item) => normalize(item.name) === cleanTruckType) ||
      (await createTruckType({
        name: cleanTruckType,
        status: "active",
      }));

    const existingDriver =
      drivers.find((driver) => normalize(driver.name) === normalize(cleanName) && normalize(driver.phone) === normalize(cleanPhone)) ||
      drivers.find((driver) => normalize(driver.name) === normalize(cleanName));
    const driverResult = existingDriver
      ? cleanPhone && normalize(existingDriver.phone) !== normalize(cleanPhone)
        ? await updateDriver(existingDriver.id, {
            phone: existingDriver.phone || cleanPhone,
            notes: existingDriver.notes?.includes(cleanPhone)
              ? existingDriver.notes
              : [existingDriver.notes, `Shipment form alternate phone: ${cleanPhone}`].filter(Boolean).join("\n"),
          })
        : existingDriver
      : await createDriver({
          name: cleanName,
          phone: cleanPhone || null,
          notes: "Created from Add Shipment form.",
          status: "active",
        });
    if (!driverResult) throw new Error("Unable to save driver.");
    const driver = driverResult;

    const existingVehicle = vehicles.find((vehicle) => normalize(vehicle.vehicleNumber) === cleanVehicle);
    if (existingVehicle?.driverId && driver?.id && existingVehicle.driverId !== driver.id) {
      throw new Error(`Vehicle ${cleanVehicle} is already linked to another driver. Review the vehicle record before creating a shipment.`);
    }

    const vehicleResult = existingVehicle
      ? await updateVehicle(existingVehicle.id, {
          truckTypeId: truckType.id,
          driverId: driver?.id ?? null,
          notes: existingVehicle.notes || "Linked from Add Shipment form.",
        })
      : await createVehicle({
          vehicleNumber: cleanVehicle,
          truckTypeId: truckType.id,
          driverId: driver?.id ?? null,
          notes: "Created from Add Shipment form.",
          status: "active",
        });
    if (!vehicleResult) throw new Error("Unable to save vehicle.");
    const vehicle = vehicleResult;

    return { driver, vehicle, truckType };
  };

  const markInvoiceSent = async (id: string) => {
    try {
      const invoice = invoices.find((row) => row.id === id || row.shipmentId === id);

      if (invoice) {
        await updateInvoiceStatus(invoice.id, "sent");
        setToast("Invoice marked as sent.");
        return;
      }

      setToast("Invoice not found.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to mark invoice as sent.");
    }
  };

  const savePayment = async (input: { type: "Client" | "Driver"; clientPayment?: ClientPaymentInput; driverPayment?: DriverPaymentInput }) => {
    try {
      if (input.type === "Client" && input.clientPayment) {
        await createClientPayment(input.clientPayment);
      }
      if (input.type === "Driver" && input.driverPayment) {
        await createDriverPayment(input.driverPayment);
      }
      setPaymentDialog(null);
      setToast("Payment saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save payment.");
    }
  };

  const previewInvoice = async (shipment: Shipment, invoice?: Invoice) => {
    const resolvedInvoice = invoice ?? invoices.find((row) => row.shipmentId === shipment.id);
    if (!resolvedInvoice) {
      setToast("This shipment is not invoiced. Use Generate Invoice when billing is ready.");
      return;
    }
    setInvoicePreview({ shipment, invoice: resolvedInvoice });
  };

  const printShipmentDocuments = (shipment: Shipment, attachments: ShipmentAttachment[]) => {
    const invoice = invoices.find((row) => row.shipmentId === shipment.id);
    if (!invoice) {
      setToast("Generate the invoice before printing all shipment documents.");
      return;
    }
    setShipmentPrintBundle({ shipment, invoice, attachments });
  };

  const generateInvoice = async (shipment: Shipment) => {
    try {
      const generated = await createInvoiceForShipment(shipment);
      if (!generated) throw new Error("Invoice generation returned no invoice.");
      setToast(`Invoice ${generated.invoiceNumber} generated.`);
      setInvoicePreview({ shipment, invoice: generated });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to generate invoice.");
    }
  };

  const handleUpdateInvoiceStatus = async (shipmentId: string, status: import("./types/domain").InvoiceStatus) => {
    try {
      const invoice = invoices.find((inv) => inv.shipmentId === shipmentId);

      if (!invoice) {
        setToast("Generate the invoice before changing its lifecycle status.");
        return;
      }

      let recordStatus: import("./types/domain").InvoiceRecordStatus = "draft";
      if (status === "Sent") recordStatus = "sent";
      if (status === "Paid") recordStatus = "paid";
      if (status === "Overdue") recordStatus = "overdue";
      if (status === "Partially Paid") recordStatus = "partially_paid";
      if (status === "Cancelled") recordStatus = "cancelled";
      await updateInvoiceStatus(invoice.id, recordStatus);
      setToast("Invoice status updated.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update invoice status.");
    }
  };

  const handleUpdateShipmentStatus = async (shipmentId: string, status: NonNullable<Shipment["status"]>) => {
    try {
      const reason = status === "cancelled" ? window.prompt("Cancellation reason")?.trim() : undefined;
      if (status === "cancelled" && !reason) return;
      await transitionShipmentStatus(shipmentId, status, reason);
      setToast(`Shipment status changed to ${status.replace(/_/g, " ")}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to change shipment status.");
    }
  };

  return (
    <div className="app-root bg-grid-pattern">
      <AppShell
        view={view}
        setView={setView}
        query={query}
        setQuery={setQuery}
        openShipment={() => setShipmentDialog(true)}
      />

      <main className="page-shell v2-page-shell">
        {view === "Dashboard" && (
          <DashboardPage shipments={displayShipments} openShipment={() => setShipmentDialog(true)} setView={setView} />
        )}
        {view === "Shipments" && (
          <ShipmentsPage
            shipments={displayShipments}
            query={query}
            setQuery={setQuery}
            loading={shipmentsLoading}
            error={shipmentsError}
            clients={clients}
            openSummary={(row) => setSummaryShipmentId(row.id)}
            onEditShipment={(row) => setEditShipmentId(row.id)}
            deleteShipment={deleteShipment}
            driverPayments={driverPayments}
          />
        )}
        {view === "Directory" && (
          <DirectoryPage 
            shipments={displayShipments} 
            clientPayments={clientPayments}
            driverPayments={driverPayments}
          />
        )}
        {view === "Finance" && (
          <FinancePage
            shipments={displayShipments}
            stats={stats}
            openPayment={() => setPaymentDialog({})}
            previewInvoice={previewInvoice}
            generateInvoice={generateInvoice}
            markInvoiceSent={markInvoiceSent}
            invoices={invoices}
            invoiceItems={invoiceItems}
            invoiceItemsByInvoice={invoiceItemsByInvoice}
            invoicesLoading={invoicesLoading}
            invoicesError={invoicesError}
            clientPayments={clientPayments}
            driverPayments={driverPayments}
            paymentsLoading={paymentsLoading}
            paymentsError={paymentsError}
            expenses={expenses}
            expensesLoading={expensesLoading}
            expensesError={expensesError}
            expenseFilters={expenseFilters}
            setExpenseFilters={setExpenseFilters}
            createExpense={createExpense}
            updateExpense={updateExpense}
            deleteExpense={deleteExpense}
            deleteInvoice={deleteInvoice}
            deleteClientPayment={deleteClientPayment}
            deleteDriverPayment={deleteDriverPayment}
          />
        )}
        {view === "Reports" && (
          <ReportsPage shipments={displayShipments} />
        )}
      </main>

      {(shipmentDialog || editShipmentTarget) && (
        <AddShipmentModal
          editShipment={editShipmentTarget || undefined}
          shipments={displayShipments}
          masterData={{ clients, drivers, vehicles, truckTypes }}
          routeOptions={{ loadingPoints, destinations }}
          onCreateRouteLocation={saveRouteLocation}
          onCreateDriverVehicleBundle={saveDriverVehicleBundle}
          onCreateClient={createClient}
          onClose={() => {
            setShipmentDialog(false);
            setEditShipmentId(null);
          }}
          onSave={saveShipment}
        />
      )}
      {summaryShipment && (
        <ShipmentSummaryModal
          shipment={summaryShipment}
          expenses={allExpenses}
          shipments={displayShipments}
          clientPayments={clientPayments}
          driverPayments={driverPayments}
          onClose={() => setSummaryShipmentId(null)}
          onEditShipment={() => {
            setSummaryShipmentId(null);
            setEditShipmentId(summaryShipment.id);
          }}
          createExpense={createExpense}
          updateExpense={updateExpense}
          deleteExpense={deleteExpense}
          deleteClientPayment={deleteClientPayment}
          deleteDriverPayment={deleteDriverPayment}
          setPaymentDialog={setPaymentDialog}
          previewInvoice={previewInvoice}
          printShipmentDocuments={printShipmentDocuments}
          hasInvoice={invoices.some((invoice) => invoice.shipmentId === summaryShipment.id)}
          onUpdateInvoiceStatus={handleUpdateInvoiceStatus}
          onUpdateShipmentStatus={handleUpdateShipmentStatus}
        />
      )}
      {paymentDialog && (
        <PaymentModal
          invoices={invoices}
          shipments={displayShipments}
          drivers={drivers}
          initialType={paymentDialog.type}
          initialShipmentId={paymentDialog.shipmentId}
          initialDriverId={paymentDialog.driverId}
          initialInvoiceId={paymentDialog.invoiceId}
          onClose={() => setPaymentDialog(null)}
          onSave={savePayment}
        />
      )}
      {invoicePreview && (
        <InvoicePreview
          shipment={invoicePreview.shipment}
          invoiceRecord={invoicePreview.invoice}
          invoiceItems={invoicePreview.invoice ? invoiceItemsByInvoice.get(invoicePreview.invoice.id) ?? [] : []}
          shipmentExpenses={allExpenses.filter((e) => e.shipmentId === invoicePreview.shipment.id)}
          onClose={() => setInvoicePreview(null)}
        />
      )}
      {shipmentPrintBundle && (
        <ShipmentPrintBundleModal
          shipment={shipmentPrintBundle.shipment}
          invoiceRecord={shipmentPrintBundle.invoice}
          invoiceItems={invoiceItemsByInvoice.get(shipmentPrintBundle.invoice.id) ?? []}
          shipmentExpenses={allExpenses.filter((expense) => expense.shipmentId === shipmentPrintBundle.shipment.id)}
          attachments={shipmentPrintBundle.attachments}
          onClose={() => setShipmentPrintBundle(null)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
