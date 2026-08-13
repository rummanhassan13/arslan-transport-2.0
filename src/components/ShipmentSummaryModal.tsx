import { useState, useMemo } from "react";
import { MoveRight, Plus, Printer, Trash2 } from "lucide-react";
import { Modal, StatusBadge } from "./ui";
import type { Shipment, ShipmentExpense, ShipmentExpenseInput, ShipmentAttachment, ClientPayment, DriverPayment } from "../types/domain";
import { money, formatDate, labelize } from "../utils/formatters";
import { calculateShipmentFinancials } from "../utils/calculations";
import { ExpenseDialog } from "../pages/ExpensesPage";
import { useAuth } from "../hooks/useAuth";
import { env } from "../config/env";
import { useShipmentAttachments } from "../hooks/useShipmentAttachments";
import { canApproveExpenses, canManageAttachments, canManageExpenses, canManageInvoices, canManagePayments, canManageShipments } from "../utils/permissions";
import { ShipmentAttachmentManager } from "./shipments/ShipmentAttachmentManager";
import { signedClientPaymentAmount, signedDriverPaymentAmount } from "../domain/financials";

export function ShipmentSummaryModal({
  shipment,
  expenses,
  shipments,
  clientPayments,
  driverPayments,
  onClose,
  onEditShipment,
  createExpense,
  updateExpense,
  deleteExpense,
  setPaymentDialog,
  previewInvoice,
  printShipmentDocuments,
  hasInvoice,
  onUpdateInvoiceStatus,
  onUpdateShipmentStatus,
  deleteClientPayment,
  deleteDriverPayment,
}: {
  shipment: Shipment;
  expenses: ShipmentExpense[];
  shipments: Shipment[];
  clientPayments: ClientPayment[];
  driverPayments: DriverPayment[];
  onClose: () => void;
  onEditShipment: () => void;
  createExpense: (input: ShipmentExpenseInput) => Promise<ShipmentExpense>;
  updateExpense: (expenseId: string, input: Partial<ShipmentExpenseInput>) => Promise<ShipmentExpense | null>;
  deleteExpense: (expenseId: string) => Promise<void>;
  deleteClientPayment: (paymentId: string) => Promise<void>;
  deleteDriverPayment: (paymentId: string) => Promise<void>;
  setPaymentDialog: (state: { type?: "Client" | "Driver", shipmentId?: string, driverId?: string, invoiceId?: string } | null) => void;
  previewInvoice?: (shipment: Shipment) => void;
  printShipmentDocuments?: (shipment: Shipment, attachments: ShipmentAttachment[]) => void;
  hasInvoice?: boolean;
  onUpdateInvoiceStatus?: (shipmentId: string, status: import("../types/domain").InvoiceStatus) => void;
  onUpdateShipmentStatus?: (shipmentId: string, status: NonNullable<Shipment["status"]>) => void;
}) {
  const { role } = useAuth();
  const [expenseDialog, setExpenseDialog] = useState<ShipmentExpense | null | "new">(null);
  const [expenseError, setExpenseError] = useState("");

  const canManage = env.demoMode || canManageExpenses(role);
  const canApprove = env.demoMode || canApproveExpenses(role);
  const canManageAttachmentRows = env.demoMode || canManageAttachments(role);
  const canManageFinance = env.demoMode || (canManageInvoices(role) && canManagePayments(role));
  const canManageOperations = env.demoMode || canManageShipments(role);
  const operationalTransitions: Record<NonNullable<Shipment["status"]>, NonNullable<Shipment["status"]>[]> = {
    pending: ["in_transit", "cancelled"],
    in_transit: ["delivered", "cancelled"],
    delivered: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };
  const nextOperationalStatuses = operationalTransitions[shipment.status ?? "pending"];

  // Filter expenses for this shipment
  const shipmentExpenses = useMemo(() => {
    return expenses.filter((e) => e.shipmentId === shipment.id);
  }, [expenses, shipment.id]);

  // Load attachments for this shipment
  const { attachments, loading: loadingAttachments, refreshAttachments } = useShipmentAttachments(shipment.id);


  const financials = useMemo(() => {
    return calculateShipmentFinancials(shipment, shipmentExpenses);
  }, [shipment, shipmentExpenses]);

  const allPayments = useMemo(() => {
    const shipmentClientPayments = clientPayments.filter(p => p.shipmentId === shipment.id);
    const shipmentDriverPayments = driverPayments.filter(p => p.shipmentId === shipment.id);

    const combined = [
      ...shipmentClientPayments.map(p => ({
        id: p.id,
        type: p.direction === -1 ? 'Client Payment Reversal' : 'Client Payment',
        amount: signedClientPaymentAmount(p),
        date: p.paymentDate,
        reversible: p.direction !== -1,
        deleteFn: () => deleteClientPayment(p.id),
      })),
      ...shipmentDriverPayments.map(p => {
        const assignment = shipment.assignments?.find((a) => p.shipmentAssignmentId ? a.id === p.shipmentAssignmentId : a.driverId === p.driverId);
        const name = assignment?.driverName || p.driverName;
        return {
          id: p.id,
          type: (p.direction === -1 ? 'Driver Payment Reversal' : p.paymentType === 'advance' ? 'Driver Advance' : 'Driver Payment') + (name ? ` - ${name}` : ''),
          amount: signedDriverPaymentAmount(p),
          date: p.paymentDate,
          reversible: p.direction !== -1,
          deleteFn: () => deleteDriverPayment(p.id),
        };
      }),
    ];
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [clientPayments, driverPayments, shipment, deleteClientPayment, deleteDriverPayment]);


  const handleSaveExpense = async (input: ShipmentExpenseInput) => {
    setExpenseError("");
    try {
      if (expenseDialog && expenseDialog !== "new") {
        const updated = await updateExpense(expenseDialog.id, input);
        if (updated) {
          setExpenseDialog(null);
          void refreshAttachments();
        }
        return updated ?? undefined;
      } else {
        const created = await createExpense(input);
        setExpenseDialog(null);
        void refreshAttachments();
        return created;
      }
    } catch (err) {
      setExpenseError(err instanceof Error ? err.message : "Unable to save expense.");
      return undefined;
    }
  };

  return (
    <>
      <Modal
        title={
          <div className="flex justify-between items-center w-full pr-8">
            <span>Invoice: {shipment.invoice}</span>
            <span className="text-sm font-normal text-[var(--ink-2)]">{formatDate(shipment.date)}</span>
          </div>
        }
        onClose={onClose}
        size="page"
        footer={
          <div className="flex justify-between w-full flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              {canManageOperations && <button className="btn-ghost" onClick={onEditShipment} type="button">
                Edit Shipment
              </button>}
              {canManage && <button className="btn-ghost" onClick={() => setExpenseDialog("new")} type="button">
                Add Expense
              </button>}
              {canManageFinance && <button className="btn-ghost" onClick={() => setPaymentDialog({ shipmentId: shipment.id })} type="button">
                Record Payment
              </button>}
              {previewInvoice && (
                <button className="btn-ghost" onClick={() => previewInvoice(shipment)} type="button">
                  View Invoice
                </button>
              )}
              {printShipmentDocuments && (
                <button
                  className="btn-ghost"
                  disabled={!hasInvoice || loadingAttachments}
                  onClick={() => printShipmentDocuments(shipment, attachments)}
                  title={!hasInvoice ? "Generate the invoice before printing all shipment documents." : undefined}
                  type="button"
                >
                  <Printer size={15} />
                  {loadingAttachments ? "Loading Documents..." : "Print All Documents"}
                </button>
              )}
            </div>
            <button className="btn-primary" onClick={onClose} type="button">
              Close
            </button>
          </div>
        }
      >
        <div className="shipment-summary p-2">
          {/* Main Layout: 2 side-by-side columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-2">
            
            {/* Left Column */}
            <div className="flex flex-col gap-6">
              
              {/* Main Info */}
              <div className="border border-[var(--line-soft)] rounded-[var(--radius)] p-5 bg-[var(--bg-hover)]">
                <h3 className="text-sm font-bold text-[var(--ink-2)] border-b border-[var(--line-soft)] pb-2 mb-4 uppercase tracking-wider">
                  Main Info
                </h3>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Route / Trip</span>
                    <span className="text-base font-semibold flex items-center gap-2">
                      {shipment.loadingPoint} <MoveRight size={14} className="text-[var(--ink-3)]" /> {shipment.destination}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Customer</span>
                      <span className="text-sm font-semibold">{shipment.customer}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Driver(s)</span>
                      <span className="text-sm font-semibold">
                        {shipment.assignments?.length ? shipment.assignments.map(a => a.driverName).join(", ") : shipment.driverName}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Vehicle Number</span>
                      <span className="text-sm font-semibold">{shipment.vehicleNo || "N/A"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Truck Type</span>
                      <span className="text-sm font-semibold">{shipment.truckType || "N/A"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remarks Block */}
              <div className="border border-[var(--line-soft)] rounded-[var(--radius)] p-4">
                <h3 className="text-sm font-bold text-[var(--ink-2)] mb-2 uppercase tracking-wider">Remarks</h3>
                <div className="text-sm text-[var(--ink-2)] whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto pr-2">
                  {shipment.remarks || "No remarks provided for this shipment."}
                </div>
              </div>

              {/* Expenses Block */}
              <div className="border border-[var(--line-soft)] rounded-[var(--radius)] p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-[var(--ink-2)] uppercase tracking-wider">Expenses</h3>
                  {canManage && (
                    <button
                      className="table-action flex items-center gap-1 font-semibold text-xs"
                      type="button"
                      onClick={() => setExpenseDialog("new")}
                    >
                      <Plus size={13} /> Add
                    </button>
                  )}
                </div>
                
                {shipmentExpenses.length === 0 ? (
                  <p className="text-sm text-[var(--ink-3)]">No expenses added yet.</p>
                ) : (
                  <div className="w-full flex flex-col">
                    {/* Header */}
                    <div 
                      className="grid gap-2 border-b border-[var(--line-soft)] pb-1.5"
                      style={{ gridTemplateColumns: canManage ? "minmax(0, 1fr) 72px 56px 28px" : "minmax(0, 1fr) 72px 56px" }}
                    >
                      <div className="font-semibold text-[var(--ink-3)] text-xs">Category</div>
                      <div className="font-semibold text-[var(--ink-3)] text-xs text-right">Amount</div>
                      <div className="font-semibold text-[var(--ink-3)] text-xs text-right">Date</div>
                      {canManage && <div></div>}
                    </div>
                    {/* Body */}
                    <div className="flex flex-col">
                      {shipmentExpenses.map((expense) => (
                        <div 
                          key={expense.id} 
                          className="grid gap-2 border-b border-[var(--line-soft)] last:border-0 py-1.5 items-start text-xs"
                          style={{ gridTemplateColumns: canManage ? "minmax(0, 1fr) 72px 56px 28px" : "minmax(0, 1fr) 72px 56px" }}
                        >
                          <div className="min-w-0 flex flex-col">
                            <div className="capitalize truncate font-medium text-[var(--ink-2)]" title={labelize(expense.category)}>
                              {labelize(expense.category)}
                            </div>
                            {expense.notes && <div className="text-[10px] text-[var(--ink-3)] mt-0.5 truncate" title={expense.notes}>{expense.notes}</div>}
                          </div>
                          <div className="font-semibold text-right text-[var(--ink-2)] truncate">
                            {money(expense.amount)}
                          </div>
                          <div className="text-right text-[var(--ink-3)] truncate">
                            {new Date(expense.expenseDate).toLocaleDateString("en-US", { day: '2-digit', month: 'short' })}
                          </div>
                          {canManage && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="text-[var(--danger-color)] hover:bg-[var(--danger-color)] hover:text-white rounded p-1 transition-colors inline-flex justify-center items-center"
                                onClick={() => {
                                  if (window.confirm("Are you sure you want to delete this expense?")) {
                                    void deleteExpense(expense.id);
                                  }
                                }}
                                title="Delete expense"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-[var(--line-soft)] flex justify-between items-center font-bold text-sm">
                  <span>Total Expenses:</span>
                  <span className="text-[var(--accent-strong)]">
                    {money(shipmentExpenses.reduce((sum, e) => sum + e.amount, 0))}
                  </span>
                </div>
              </div>
            
              {/* Payments Block */}
              <div className="border border-[var(--line-soft)] rounded-[var(--radius)] p-4 mt-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-[var(--ink-2)] uppercase tracking-wider">Payments</h3>
                </div>
                
                {allPayments.length === 0 ? (
                  <p className="text-sm text-[var(--ink-3)]">No payments recorded for this shipment.</p>
                ) : (
                  <div className="w-full flex flex-col">
                    {/* Header */}
                    <div 
                      className="grid gap-2 border-b border-[var(--line-soft)] pb-1.5"
                      style={{ gridTemplateColumns: canManageFinance ? "minmax(0, 1fr) 72px 56px 28px" : "minmax(0, 1fr) 72px 56px" }}
                    >
                      <div className="font-semibold text-[var(--ink-3)] text-xs">Category</div>
                      <div className="font-semibold text-[var(--ink-3)] text-xs text-right">Amount</div>
                      <div className="font-semibold text-[var(--ink-3)] text-xs text-right">Date</div>
                      {canManageFinance && <div></div>}
                    </div>
                    {/* Body */}
                    <div className="flex flex-col">
                      {allPayments.map((payment) => (
                        <div 
                          key={payment.id} 
                          className="grid gap-2 border-b border-[var(--line-soft)] last:border-0 py-1.5 items-start text-xs"
                          style={{ gridTemplateColumns: canManageFinance ? "minmax(0, 1fr) 72px 56px 28px" : "minmax(0, 1fr) 72px 56px" }}
                        >
                          <div className="min-w-0 flex flex-col">
                            <div className="capitalize truncate font-medium text-[var(--ink-2)]" title={payment.type}>
                              {payment.type}
                            </div>
                          </div>
                          <div className="font-semibold text-right text-[var(--ink-2)] truncate">
                            {money(payment.amount)}
                          </div>
                          <div className="text-right text-[var(--ink-3)] truncate">
                            {new Date(payment.date).toLocaleDateString("en-US", { day: '2-digit', month: 'short' })}
                          </div>
                          {canManageFinance && payment.reversible && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="text-[var(--danger-color)] hover:bg-[var(--danger-color)] hover:text-white rounded p-1 transition-colors inline-flex justify-center items-center"
                                onClick={() => {
                                  if (window.confirm("Delete this payment? It will be removed from active balances and retained in audit history.")) {
                                    void payment.deleteFn();
                                  }
                                }}
                                title="Delete payment"
                                aria-label={`Delete ${payment.type}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-6">
              
              {/* Financial Summary */}
              <div className="border border-[var(--line-soft)] rounded-[var(--radius)] p-5 bg-[var(--bg-hover)] h-fit">
                <h3 className="text-sm font-bold text-[var(--ink-2)] border-b border-[var(--line-soft)] pb-2 mb-4 uppercase tracking-wider">
                  Financial Summary
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--ink-3)] uppercase font-semibold" title="Company Rate + Client Billed Expenses">Company Total</span>
                    <span className="text-base font-bold text-[var(--accent-strong)]">{money(financials.companyTotal)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--ink-3)] uppercase font-semibold" title="Driver Rate + Reimbursable Expenses">Driver Total</span>
                    <span className="text-base font-bold text-[var(--ink-2)]">{money(financials.driverTotal)}</span>
                  </div>
                </div>

                {shipment.assignments && shipment.assignments.length > 0 ? (
                  <div className="mb-4 border-t border-[var(--line-soft)] pt-4">
                    <span className="text-xs text-[var(--ink-3)] uppercase font-semibold mb-2 block">Driver Breakdowns</span>
                    <div className="flex flex-col gap-3">
                      {shipment.assignments.map((assignment, idx) => (
                        <div key={assignment.id ?? `${assignment.driverId ?? "driver"}-${idx}`} className="grid grid-cols-4 gap-2 text-sm bg-white p-2 rounded border border-[var(--line-soft)]">
                          <div className="flex flex-col min-w-0"><span className="text-[10px] text-[var(--ink-3)] uppercase font-bold">Driver</span><span className="font-semibold truncate" title={assignment.driverName}>{assignment.driverName}</span></div>
                          <div className="flex flex-col min-w-0"><span className="text-[10px] text-[var(--ink-3)] uppercase font-bold">Rate</span><span className="font-semibold truncate">{money(assignment.driverRate)}</span></div>
                          <div className="flex flex-col min-w-0"><span className="text-[10px] text-[var(--ink-3)] uppercase font-bold">Paid</span><span className="font-semibold truncate">{money(assignment.totalPaid || 0)}</span></div>
                          <div className="flex flex-col min-w-0"><span className="text-[10px] text-[var(--ink-3)] uppercase font-bold">Pending</span><span className="font-semibold truncate">{money(assignment.pending || 0)}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 mb-4 border-t border-[var(--line-soft)] pt-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Driver Advance</span>
                      <span className="text-base font-bold text-[var(--ink-2)]">{money(shipment.advance)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Driver Pending</span>
                      <span className="text-base font-bold text-[var(--ink-2)]">{money(shipment.pending)}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 mb-4 border-t border-[var(--line-soft)] pt-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--ink-3)] uppercase font-semibold">Total Profit</span>
                    <span className={`text-base font-bold ${financials.estimatedProfit >= 0 ? "text-[var(--accent-strong)]" : "text-[var(--danger-color)]"}`}>
                      {money(financials.estimatedProfit)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 border-t border-[var(--line-soft)] pt-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold">Shipment Status</span>
                    {onUpdateShipmentStatus && canManageOperations && nextOperationalStatuses.length > 0 ? (
                      <select
                        className="border border-[var(--line-soft)] rounded text-xs px-1 py-1 outline-none font-medium bg-white w-full"
                        value={shipment.status ?? "pending"}
                        onChange={(event) => onUpdateShipmentStatus(shipment.id, event.target.value as NonNullable<Shipment["status"]>)}
                      >
                        <option value={shipment.status ?? "pending"}>{labelize(shipment.status ?? "pending")}</option>
                        {nextOperationalStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                      </select>
                    ) : (
                      <StatusBadge status={labelize(shipment.status ?? "pending")} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold">Invoice Status</span>
                    {onUpdateInvoiceStatus && canManageFinance ? (
                      <select
                        className="border border-[var(--line-soft)] rounded text-xs px-1 py-1 outline-none font-medium bg-white w-full"
                        value={shipment.invoiceStatus || "Draft"}
                        onChange={(e) => onUpdateInvoiceStatus(shipment.id, e.target.value as any)}
                      >
                        <option value="Draft">Draft</option>
                        <option value="Sent">Sent</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <StatusBadge status={shipment.invoiceStatus || "Draft"} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold">Client Payment</span>
                    <div className="mt-0.5"><StatusBadge status={shipment.clientPaymentStatus || "Pending"} /></div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold">Driver Payment</span>
                    <div className="mt-0.5"><StatusBadge status={shipment.driverPaymentStatus || "Pending"} /></div>
                  </div>
                </div>
              </div>

              {/* Attachments Block */}
              <div className="border border-[var(--line-soft)] rounded-[var(--radius)] p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-[var(--ink-2)] uppercase tracking-wider">Attachments</h3>
                </div>

                <ShipmentAttachmentManager
                  shipmentId={shipment.id}
                  linkedExpenses={shipmentExpenses}
                  readOnly={!canManageAttachmentRows}
                  compact
                />
              </div>

            </div>
          </div>
        </div>
      </Modal>

      {/* Expense Add/Edit Modal */}
      {expenseDialog && (
        <ExpenseDialog
          expense={expenseDialog === "new" ? null : expenseDialog}
          shipments={shipments}
          canApprove={canApprove}
          canManageAttachments={canManageAttachmentRows}
          initialShipmentId={shipment.id}
          error={expenseError}
          onClose={() => setExpenseDialog(null)}
          onSave={handleSaveExpense}
        />
      )}
    </>
  );
}
