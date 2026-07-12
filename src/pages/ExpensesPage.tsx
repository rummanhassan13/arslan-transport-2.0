import { useState, useMemo, type FormEvent } from "react";
import { Paperclip, Pencil, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import { Card, EmptyState, KpiGrid, Modal, PageTitle, SelectField, StatusBadge } from "../components/ui";
import { ShipmentAttachmentManager } from "../components/shipments/ShipmentAttachmentManager";
import type {
  ExpenseCategory,
  ExpenseFilters,
  ExpensePaidBy,
  Shipment,
  ShipmentExpense,
  ShipmentExpenseInput,
} from "../types/domain";
import {
  getApprovedExpensesTotal,
  getClientBillableExpensesTotal,
  getDriverReimbursableExpensesTotal,
  getExpenseActualCost,
  getExpenseClientBillAmount,
  getExpenseMarkupProfit,
} from "../utils/calculations";
import { labelize, money } from "../utils/formatters";
import { EXPENSE_CATEGORIES } from "../constants/expenses";
import { getAttachmentCategoryForExpense } from "../constants/attachmentCategories";
import { useAuth } from "../hooks/useAuth";
import { useShipmentAttachments } from "../hooks/useShipmentAttachments";
import { createShipmentAttachmentUploadUrl, uploadFileToSignedUrl } from "../services/shipmentAttachments";
import { env } from "../config/env";
import { canApproveExpenses, canManageAttachments, canManageExpenses } from "../utils/permissions";

const paidByOptions: ExpensePaidBy[] = ["company", "driver", "client", "other"];
const expenseCategoryOptions = Array.from(EXPENSE_CATEGORIES);

export function ExpensesPage({
  shipments,
  expenses,
  loading,
  error,
  filters,
  setFilters,
  createExpense,
  updateExpense,
  deleteExpense,
  embedded = false,
}: {
  shipments: Shipment[];
  expenses: ShipmentExpense[];
  loading: boolean;
  error: string | null;
  filters: ExpenseFilters;
  setFilters: (filters: ExpenseFilters) => void;
  createExpense: (input: ShipmentExpenseInput) => Promise<ShipmentExpense>;
  updateExpense: (expenseId: string, input: Partial<ShipmentExpenseInput>) => Promise<ShipmentExpense | null>;
  deleteExpense: (expenseId: string) => Promise<void>;
  embedded?: boolean;
}) {
  const { role } = useAuth();
  const [dialogExpense, setDialogExpense] = useState<ShipmentExpense | null | "new">(null);
  const [actionError, setActionError] = useState("");
  const [billableFilter, setBillableFilter] = useState("");
  const [reimbursableFilter, setReimbursableFilter] = useState("");
  const [selectedAttachmentExpenseId, setSelectedAttachmentExpenseId] = useState("");
  const canManage = env.demoMode || canManageExpenses(role);
  const canApprove = env.demoMode || canApproveExpenses(role);
  const canManageAttachmentRows = env.demoMode || canManageAttachments(role);

  const visibleExpenses = useMemo(() => {
    return expenses.filter(
      (expense) =>
        (!billableFilter || String(expense.clientBillable) === billableFilter) &&
        (!reimbursableFilter || String(expense.driverReimbursable) === reimbursableFilter),
    );
  }, [expenses, billableFilter, reimbursableFilter]);

  const visibleShipmentIds = useMemo(() => {
    return Array.from(new Set(visibleExpenses.map((e) => e.shipmentId)));
  }, [visibleExpenses]);

  const { attachments: visibleAttachments, loading: attachmentsLoading } = useShipmentAttachments(visibleShipmentIds);

  const selectedAttachmentExpense = visibleExpenses.find((expense) => expense.id === selectedAttachmentExpenseId) ?? visibleExpenses[0] ?? null;
  const totalExpenses = expenses.reduce((total, expense) => total + getExpenseActualCost(expense), 0);
  const awaitingApproval = expenses.filter((expense) => !expense.approved).reduce((total, expense) => total + getExpenseActualCost(expense), 0);

  const saveExpense = async (input: ShipmentExpenseInput) => {
    setActionError("");
    try {
      if (dialogExpense && dialogExpense !== "new") {
        const updated = await updateExpense(dialogExpense.id, input);
        if (updated) setDialogExpense(updated);
        return updated ?? undefined;
      }
      const created = await createExpense(input);
      setDialogExpense(created);
      return created;
    } catch (expenseError) {
      setActionError(expenseError instanceof Error ? expenseError.message : "Unable to save expense.");
      return undefined;
    }
  };

  return (
    <>
      {embedded ? (
        <section className="filter-card">
          <div className="filter-toolbar">
            <div>
              <h3>Expenses & Bills</h3>
              <p>Bill images, expense categories, and settlement evidence in one view.</p>
            </div>
            {canManage && (
              <button className="btn-primary" onClick={() => setDialogExpense("new")}>
                Add Expense
              </button>
            )}
          </div>
        </section>
      ) : (
        <PageTitle
          title="Expenses & Bills"
          subtitle="Bill images, expense categories, and settlement evidence in one view."
          action={canManage ? "Add Expense" : undefined}
          onAction={canManage ? () => setDialogExpense("new") : undefined}
        />
      )}
      <KpiGrid
        items={[
          ["Total Expenses", money(totalExpenses), "Actual cost across expense rows"],
          ["Billable", money(getClientBillableExpensesTotal(expenses)), "Can be invoiced to client"],
          ["Reimbursable", money(getDriverReimbursableExpensesTotal(expenses)), "Driver settlement eligible"],
          ["Awaiting Approval", money(awaitingApproval), "Pending finance review"],
        ]}
      />
      {(loading || error || actionError) && <EmptyState text={loading ? "Loading expenses..." : error || actionError || ""} />}
      <ExpenseFiltersBar
        filters={filters}
        setFilters={setFilters}
        shipments={shipments}
        billableFilter={billableFilter}
        setBillableFilter={setBillableFilter}
        reimbursableFilter={reimbursableFilter}
        setReimbursableFilter={setReimbursableFilter}
      />
      <div className="table-card">
        <div className="table-title">
          <div>
            <h3>Expense records</h3>
            <p>Operational costs, approval state, and attachment coverage.</p>
          </div>
          <span className="status num">{visibleExpenses.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Shipment</th>
                <th>Category</th>
                <th className="num text-right">Actual Cost</th>
                <th className="num text-right">Client Bill</th>
                <th className="num text-right">Markup</th>
                <th>Paid By</th>
                <th>Billable</th>
                <th>Reimbursable</th>
                <th>Approval</th>
                <th>Attachments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((expense) => {
                return (
                  <tr key={expense.id}>
                    <td className="num">{expense.expenseDate}</td>
                    <td className="num">
                      <span className="invoice-cell">{expense.invoiceReference || expense.shipmentNo || "Shipment"}</span>
                    </td>
                    <td>{labelize(expense.category)}</td>
                    <td className="num">{money(getExpenseActualCost(expense))}</td>
                    <td className="num">{money(getExpenseClientBillAmount(expense))}</td>
                    <td className="num">{money(getExpenseMarkupProfit(expense))}</td>
                    <td>{labelize(expense.paidBy)}</td>
                    <td>
                      <StatusBadge status={expense.clientBillable ? "Billable" : "Not Billable"} />
                    </td>
                    <td>
                      <StatusBadge status={expense.driverReimbursable ? "Reimbursable" : "Not Reimbursable"} />
                    </td>
                    <td>
                      <StatusBadge status={expense.approved ? "Paid" : "Pending"} />
                    </td>
                    <td>
                      <ExpenseReceiptIndicator 
                        expense={expense} 
                        attachments={visibleAttachments}
                        loading={attachmentsLoading}
                        onOpen={() => setDialogExpense(expense)} 
                      />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {canManage ? (
                          <>
                            <button className="icon-btn" onClick={() => setDialogExpense(expense)} aria-label="Edit expense">
                              <Pencil size={14} />
                            </button>
                            {canApprove && !expense.approved && (
                              <button className="table-action" onClick={() => void updateExpense(expense.id, { approved: true })}>
                                Approve
                              </button>
                            )}
                            <button className="icon-btn" onClick={() => void deleteExpense(expense.id)} aria-label="Delete expense">
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <span className="status">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleExpenses.length === 0 && <EmptyState text="No expenses match the current filters." />}
        </div>
      </div>
      <Card title="Expense Receipts">
        {selectedAttachmentExpense ? (
          <>
            <label className="field">
              <span>Receipt for expense</span>
              <select
                value={selectedAttachmentExpense.id}
                onChange={(event) => setSelectedAttachmentExpenseId(event.target.value)}
              >
                {visibleExpenses.map((expense) => (
                  <option key={expense.id} value={expense.id}>
                    {expense.invoiceReference || expense.shipmentNo || "Shipment"} - {labelize(expense.category)} - {money(getExpenseActualCost(expense))}
                  </option>
                ))}
              </select>
            </label>
            <ShipmentAttachmentManager
              shipmentId={selectedAttachmentExpense.shipmentId}
              shipmentExpenseId={selectedAttachmentExpense.id}
              defaultCategory={getAttachmentCategoryForExpense(selectedAttachmentExpense.category)}
              linkedExpenses={[selectedAttachmentExpense]}
              readOnly={!canManageAttachmentRows}
              compact
            />
          </>
        ) : (
          <EmptyState text="Create an expense before uploading attachments." />
        )}
      </Card>
      {dialogExpense && (
        <ExpenseDialog
          expense={dialogExpense === "new" ? null : dialogExpense}
          shipments={shipments}
          canApprove={canApprove}
          canManageAttachments={canManageAttachmentRows}
          error={actionError}
          onClose={() => setDialogExpense(null)}
          onSave={saveExpense}
        />
      )}
    </>
  );
}

function ExpenseReceiptIndicator({
  expense,
  attachments,
  loading,
  onOpen,
}: {
  expense: ShipmentExpense;
  attachments: import("../types/domain").ShipmentAttachment[];
  loading: boolean;
  onOpen: () => void;
}) {
  const count = attachments.filter((attachment) => attachment.shipmentExpenseId === expense.id).length;

  return (
    <button className="table-action" type="button" onClick={onOpen}>
      <Paperclip size={13} />
      <span className="num">{loading ? "..." : count}</span>
      <span>{count === 1 ? "receipt" : "receipts"}</span>
    </button>
  );
}

function ExpenseFiltersBar({
  filters,
  setFilters,
  shipments,
  billableFilter,
  setBillableFilter,
  reimbursableFilter,
  setReimbursableFilter,
}: {
  filters: ExpenseFilters;
  setFilters: (filters: ExpenseFilters) => void;
  shipments: Shipment[];
  billableFilter: string;
  setBillableFilter: (value: string) => void;
  reimbursableFilter: string;
  setReimbursableFilter: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const update = (key: keyof ExpenseFilters, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <section className="filter-card">
      <div className="filter-toolbar expense-filter-heading">
        <div>
          <h3>Expense filters</h3>
          <p>Narrow the ledger by cost type, approval, ownership or shipment.</p>
        </div>
        <button className="btn-ghost expense-filter-toggle" onClick={() => setExpanded((value) => !value)} type="button">
          <SlidersHorizontal size={15} /> {expanded ? "Hide filters" : "Show filters"}
        </button>
      </div>
      <div className={`filter-grid filter-grid-primary expense-filter-fields${expanded ? " expanded" : " collapsed"}`}>
        <SelectField label="Category" value={filters.category ?? ""} onChange={(value) => update("category", value)} options={expenseCategoryOptions} includeAll />
        <SelectField label="Approval" value={filters.approved ?? ""} onChange={(value) => update("approved", value)} options={["approved", "pending"]} includeAll />
        <SelectField label="Billable" value={billableFilter} onChange={setBillableFilter} options={["true", "false"]} includeAll />
        <SelectField label="Reimbursable" value={reimbursableFilter} onChange={setReimbursableFilter} options={["true", "false"]} includeAll />
        <SelectField label="Paid By" value={filters.paidBy ?? ""} onChange={(value) => update("paidBy", value)} options={paidByOptions} includeAll />
        <label className="field">
          <span>Shipment / Invoice</span>
          <select value={filters.shipmentId ?? ""} onChange={(event) => update("shipmentId", event.target.value)}>
            <option value="">All</option>
            {shipments.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.invoice} - {shipment.customer}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

export function ExpenseDialog({
  expense,
  shipments,
  canApprove,
  canManageAttachments = false,
  error,
  initialShipmentId,
  onClose,
  onSave,
}: {
  expense: ShipmentExpense | null;
  shipments: Shipment[];
  canApprove: boolean;
  canManageAttachments?: boolean;
  error: string;
  initialShipmentId?: string;
  onClose: () => void;
  onSave: (input: ShipmentExpenseInput) => Promise<ShipmentExpense | void>;
}) {
  type ExpenseFormState = Omit<ShipmentExpenseInput, "amount" | "actualCostAmount" | "clientBillAmount" | "category"> & {
    category: ExpenseCategory | string;
    amount: number | "";
    actualCostAmount: number | "";
    clientBillAmount: number | "";
  };

  const [savedExpense, setSavedExpense] = useState<ShipmentExpense | null>(expense);
  const [saveMessage, setSaveMessage] = useState("");
  const expenseActualCost = expense ? getExpenseActualCost(expense) : "";
  const [form, setForm] = useState<ExpenseFormState>({
    shipmentId: expense?.shipmentId ?? initialShipmentId ?? shipments[0]?.id ?? "",
    shipmentAssignmentId: expense?.shipmentAssignmentId ?? null,
    category: expense?.category ?? "gate_pass",
    amount: expenseActualCost,
    actualCostAmount: expenseActualCost,
    clientBillAmount: expense ? getExpenseClientBillAmount(expense) : "",
    paidBy: expense?.paidBy ?? "company",
    clientBillable: expense?.clientBillable ?? true,
    driverReimbursable: expense?.driverReimbursable ?? false,
    approved: expense?.approved ?? canApprove,
    includedInInvoice: expense?.includedInInvoice ?? true,
    expenseDate: expense?.expenseDate ?? new Date().toISOString().slice(0, 10),
    notes: expense?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("customExpenseCategories") || "[]");
    } catch {
      return [];
    }
  });
  const combinedCategories = Array.from(new Set([...expenseCategoryOptions, ...customCategories]));
  const { activeOrganization } = useAuth();
  const { createAttachmentMetadata } = useShipmentAttachments(form.shipmentId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const selectedShipment = shipments.find((shipment) => shipment.id === form.shipmentId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    const actualCost = Number(form.actualCostAmount === "" ? form.amount : form.actualCostAmount);
    if (!Number.isFinite(actualCost) || actualCost <= 0) {
      setSaveMessage("Actual cost must be greater than zero.");
      setSaving(false);
      return;
    }
    if (form.driverReimbursable && !form.shipmentAssignmentId) {
      setSaveMessage("Select the driver assignment that should receive this reimbursement.");
      setSaving(false);
      return;
    }
    
    if (form.category && !combinedCategories.includes(form.category)) {
      const updatedCustom = [...customCategories, form.category];
      setCustomCategories(updatedCustom);
      window.localStorage.setItem("customExpenseCategories", JSON.stringify(updatedCustom));
    }

    try {
      const saved = await onSave({
        ...form,
        category: form.category as ExpenseCategory,
        amount: actualCost,
        actualCostAmount: actualCost,
        clientBillAmount: Number(form.clientBillAmount === "" ? (form.actualCostAmount === "" ? form.amount : form.actualCostAmount) : form.clientBillAmount),
        notes: form.notes?.trim() || null,
        approved: canApprove ? Boolean(form.approved) : Boolean(expense?.approved),
        paidBy: form.driverReimbursable ? "driver" : form.paidBy,
        clientBillable: Boolean(form.clientBillable),
        includedInInvoice: Boolean(form.clientBillable && form.includedInInvoice),
        driverReimbursable: Boolean(form.driverReimbursable),
      });
      if (saved) {
        setSavedExpense(saved);
        if (selectedFile) {
          setSaveMessage("Uploading receipt...");
          try {
            const metadata: any = {
              shipmentId: saved.shipmentId,
              shipmentExpenseId: saved.id,
              category: getAttachmentCategoryForExpense(saved.category) || "other",
              fileName: selectedFile.name,
              fileType: selectedFile.type,
              fileSize: selectedFile.size,
              storageKey: "",
              notes: null,
            };
            if (!env.demoMode) {
               const urlRes = await createShipmentAttachmentUploadUrl({
                 shipmentId: saved.shipmentId,
                 shipmentExpenseId: saved.id,
                 category: metadata.category,
                 fileName: selectedFile.name,
                 fileType: selectedFile.type,
                 fileSize: selectedFile.size,
               });
               await uploadFileToSignedUrl(selectedFile, urlRes.signedUploadUrl, { "Content-Type": selectedFile.type });
               metadata.storageKey = urlRes.storageKey;
            } else {
               metadata.storageKey = `demo/${saved.shipmentId}/${selectedFile.name}`;
            }
            await createAttachmentMetadata(metadata);
            setSaveMessage("Expense and receipt saved successfully.");
            setSelectedFile(null);
          } catch(err) {
            setSaveMessage("Expense saved, but receipt upload failed. You can try uploading it below.");
          }
        } else {
          setSaveMessage("Expense saved. Receipts can now be linked to this expense.");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={expense ? "Edit Expense" : "Add Expense"}
      onClose={onClose}
      size="large"
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="expense-form" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Expense"}
          </button>
        </>
      }
    >
      <form id="expense-form" className="form-layout" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Expense Details</h3>
            <p>Attach the operational cost to a shipment and choose how it should be treated.</p>
          </div>
          <div className="form-grid">
        <label className="field form-wide">
          <span>Shipment</span>
          <select value={form.shipmentId} onChange={(event) => setForm((current) => ({ ...current, shipmentId: event.target.value, shipmentAssignmentId: null }))} disabled={!!initialShipmentId} required>
            <option value="" disabled>Select shipment</option>
            {shipments.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.invoice} - {shipment.customer}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          {isAddingNewCategory ? (
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Enter category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newCategoryName.trim()) {
                      const cat = newCategoryName.trim();
                      if (!combinedCategories.includes(cat)) {
                        const updated = [...customCategories, cat];
                        setCustomCategories(updated);
                        window.localStorage.setItem("customExpenseCategories", JSON.stringify(updated));
                      }
                      setForm((current) => ({ ...current, category: cat }));
                      setIsAddingNewCategory(false);
                      setNewCategoryName("");
                    }
                  } else if (e.key === "Escape") {
                    setIsAddingNewCategory(false);
                    setNewCategoryName("");
                  }
                }}
              />
              <button
                type="button"
                className="btn-primary whitespace-nowrap"
                onClick={() => {
                  if (newCategoryName.trim()) {
                    const cat = newCategoryName.trim();
                    if (!combinedCategories.includes(cat)) {
                      const updated = [...customCategories, cat];
                      setCustomCategories(updated);
                      window.localStorage.setItem("customExpenseCategories", JSON.stringify(updated));
                    }
                    setForm((current) => ({ ...current, category: cat }));
                    setIsAddingNewCategory(false);
                    setNewCategoryName("");
                  }
                }}
              >
                Add
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setIsAddingNewCategory(false);
                  setNewCategoryName("");
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <select
              value={form.category}
              onChange={(event) => {
                if (event.target.value === "add_new") {
                  setIsAddingNewCategory(true);
                } else {
                  setForm((current) => ({ ...current, category: event.target.value }));
                }
              }}
              required
            >
              <option value="" disabled>Select category</option>
              {combinedCategories.map((category) => (
                <option key={category} value={category}>
                  {labelize(category)}
                </option>
              ))}
              <option value="add_new">+ Add New Category...</option>
            </select>
          )}
        </label>
        <label className="field">
          <span>Actual Cost</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.actualCostAmount === "" ? "" : (form.actualCostAmount ?? form.amount)}
            onChange={(event) => {
              const nextAmount = event.target.value === "" ? "" : Number(event.target.value);
              setForm((current) => ({
                ...current,
                amount: nextAmount,
                actualCostAmount: nextAmount,
                clientBillAmount:
                  current.clientBillAmount === undefined ||
                  current.clientBillAmount === "" ||
                  current.clientBillAmount === 0 ||
                  current.clientBillAmount === current.actualCostAmount
                    ? nextAmount
                    : current.clientBillAmount,
              }));
            }}
          />
        </label>
        <label className="field">
          <span>Client Bill Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.clientBillAmount === "" ? "" : (form.clientBillAmount ?? form.actualCostAmount ?? form.amount)}
            onChange={(event) => setForm((current) => ({ ...current, clientBillAmount: event.target.value === "" ? "" : Number(event.target.value) }))}
          />
        </label>
        <label className="field">
          <span>Expense Date</span>
          <input type="date" value={form.expenseDate} onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))} />
        </label>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Financial Treatment</h3>
            <p>These rules determine client billing, driver reimbursement, cost, and approval.</p>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Paid by</span>
              <select
                value={form.driverReimbursable ? "driver" : form.paidBy}
                onChange={(event) => setForm((current) => ({ ...current, paidBy: event.target.value as ShipmentExpenseInput["paidBy"] }))}
                disabled={Boolean(form.driverReimbursable)}
              >
                <option value="company">Company</option>
                <option value="driver">Driver</option>
                <option value="client">Client</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Driver assignment</span>
              <select
                value={form.shipmentAssignmentId ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, shipmentAssignmentId: event.target.value || null }))}
                disabled={!form.driverReimbursable}
                required={Boolean(form.driverReimbursable)}
              >
                <option value="">{form.driverReimbursable ? "Select assignment" : "Not applicable"}</option>
                {(selectedShipment?.assignments ?? []).map((assignment, index) => (
                  <option key={assignment.id ?? `${assignment.driverId}-${index}`} value={assignment.id ?? ""} disabled={!assignment.id}>
                    Leg {assignment.legOrder}: {assignment.driverName} ({assignment.fromLocation} to {assignment.toLocation})
                  </option>
                ))}
              </select>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(form.clientBillable)}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  clientBillable: event.target.checked,
                  includedInInvoice: event.target.checked ? current.includedInInvoice : false,
                }))}
              />
              <span>Bill this expense to the client</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(form.includedInInvoice)}
                disabled={!form.clientBillable}
                onChange={(event) => setForm((current) => ({ ...current, includedInInvoice: event.target.checked }))}
              />
              <span>Include in the next draft invoice</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(form.driverReimbursable)}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  driverReimbursable: event.target.checked,
                  paidBy: event.target.checked ? "driver" : current.paidBy,
                  shipmentAssignmentId: event.target.checked ? current.shipmentAssignmentId : null,
                }))}
              />
              <span>Reimburse an assigned driver</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(form.approved)}
                disabled={!canApprove}
                onChange={(event) => setForm((current) => ({ ...current, approved: event.target.checked }))}
              />
              <span>{canApprove ? "Approved for financial calculations" : "Approval requires an authorized finance role"}</span>
            </label>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Notes</h3>
            <p>Add optional context to this expense.</p>
          </div>
          <label className="field">
          <span>Notes</span>
          <textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
        </label>
        {error && <p className="form-error">{error}</p>}
        {saveMessage && <p className="inline-alert">{saveMessage}</p>}
        </section>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Receipts & Documents</h3>
            <p>Attach the proof of payment to this expense.</p>
          </div>
          {savedExpense ? (
            <ShipmentAttachmentManager
              shipmentId={savedExpense.shipmentId}
              shipmentExpenseId={savedExpense.id}
              defaultCategory={getAttachmentCategoryForExpense(savedExpense.category)}
              linkedExpenses={[savedExpense]}
              readOnly={!canManageAttachments}
              compact
            />
          ) : (
            <div className="upload-box mt-2">
              <UploadCloud size={22} />
              <strong>Expense receipt upload</strong>
              {selectedFile ? (
                <div className="flex justify-between items-center w-full max-w-sm mt-3 bg-[var(--bg-hover)] p-2 rounded border border-[var(--line-soft)]">
                  <span className="truncate font-medium text-sm">{selectedFile.name}</span>
                  <button type="button" className="text-xs text-[var(--ink-3)] hover:text-[var(--danger-color)] px-2" onClick={() => setSelectedFile(null)} aria-label="Remove file"><X size={14} /></button>
                </div>
              ) : (
                <label className="table-action mt-3 cursor-pointer inline-flex items-center gap-1.5 font-semibold text-xs">
                  <UploadCloud size={14} /> Select file
                  <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setSelectedFile(f);
                  }} />
                </label>
              )}
            </div>
          )}
        </section>
      </form>
    </Modal>
  );
}
