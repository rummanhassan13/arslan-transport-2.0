import { useMemo, useState } from "react";
import { Download, FilePlus2, Search, Trash2, X } from "lucide-react";
import type { ClientPayment, Invoice, InvoiceItem, Shipment } from "../types/domain";
import { formatDate, money } from "../utils/formatters";
import { EmptyState, KpiGrid, PageTitle, StatusBadge } from "../components/ui";
import { calculateInvoiceBalance, signedClientPaymentAmount, sumMoney } from "../domain/financials";

export function InvoicesPage({
  shipments,
  invoices = [],
  invoiceItems = [],
  invoiceItemsByInvoice = new Map(),
  clientPayments = [],
  loading = false,
  error = null,
  preview,
  generateInvoice,
  markSent,
  deleteInvoice,
  embedded = false,
}: {
  shipments: Shipment[];
  invoices?: Invoice[];
  invoiceItems?: InvoiceItem[];
  invoiceItemsByInvoice?: Map<string, InvoiceItem[]>;
  clientPayments?: ClientPayment[];
  loading?: boolean;
  error?: string | null;
  preview: (shipment: Shipment, invoice?: Invoice) => void;
  generateInvoice: (shipment: Shipment) => Promise<void> | void;
  markSent: (id: string) => Promise<void> | void;
  deleteInvoice?: (id: string) => Promise<void> | void;
  embedded?: boolean;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  const paidByInvoice = new Map<string, number>();
  clientPayments.forEach((payment) => paidByInvoice.set(
    payment.invoiceId,
    sumMoney([paidByInvoice.get(payment.invoiceId) ?? 0, signedClientPaymentAmount(payment)]),
  ));
  const activeInvoices = invoices.filter((invoice) => invoice.status !== "cancelled");
  const balances = activeInvoices.map((invoice) => calculateInvoiceBalance(invoice, clientPayments));
  const paid = sumMoney(balances.map((balance) => balance.paid));
  const outstanding = sumMoney(balances.map((balance) => balance.balance));
  const overdue = sumMoney(balances.filter((balance) => balance.overdue).map((balance) => balance.balance));
  const drafts = invoices.length ? invoices.filter((row) => row.status === "draft").length : shipments.filter((row) => row.invoiceStatus === "Draft").length;
  const rows = invoices.length ? invoices : [];
  const invoicedShipmentIds = new Set(rows.map((row) => row.shipmentId).filter(Boolean));
  const unbilledShipments = invoices.length ? shipments.filter((shipment) => !invoicedShipmentIds.has(shipment.id)) : shipments;

  const unifiedRows = useMemo(() => {
    type UnifiedRow = 
      | { type: "invoice"; data: Invoice }
      | { type: "unbilled"; data: Shipment };

    const result: UnifiedRow[] = [];

    for (const row of rows) {
      if (normalizedSearch && !(row.invoiceNumber || "").toLowerCase().includes(normalizedSearch)) continue;
      result.push({ type: "invoice", data: row });
    }

    for (const row of unbilledShipments) {
      if (normalizedSearch && !(row.invoice || "").toLowerCase().includes(normalizedSearch)) continue;
      result.push({ type: "unbilled", data: row });
    }

    return result.sort((a, b) => {
      const invA = a.type === "invoice" ? a.data.invoiceNumber : a.data.invoice;
      const invB = b.type === "invoice" ? b.data.invoiceNumber : b.data.invoice;

      const numA = parseInt((invA || "").replace(/\D/g, ""), 10) || 0;
      const numB = parseInt((invB || "").replace(/\D/g, ""), 10) || 0;
      if (numA !== numB) return numB - numA;
      return (invB || "").localeCompare(invA || "");
    });
  }, [rows, unbilledShipments, normalizedSearch]);

  return (
    <>
      {!embedded && <PageTitle title="Invoices" subtitle="Invoice generation demo with preview and mock download actions." />}
      {error && <div className="form-error">{error}</div>}
      <KpiGrid
        items={[
          ["Outstanding", money(outstanding), "Open invoice receivables"],
          ["Paid", money(paid), "Invoices marked paid"],
          ["Overdue", money(overdue), "Past-due invoice value"],
          ["Drafts", drafts.toString(), "Invoices not sent yet"],
        ]}
      />
      <div className="table-card">
        <div className="table-title table-title-filters">
          <div>
            <h3>Invoices</h3>
            <p>Invoice status, client payment state, and preview actions.</p>
          </div>
          
          <div className="table-filters">
            <div className="compact-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice number..."
              />
            </div>
            {search && (
              <button 
                className="icon-btn text-ink-3 hover:text-ink" 
                onClick={() => setSearch("")} 
                title="Clear search"
                type="button"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <span className="status num">{unifiedRows.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Destination</th>
                <th className="num text-right">Company Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unifiedRows.map((item) => {
                if (item.type === "invoice") {
                  const row = item.data;
                  const shipment = shipments.find((s) => s.id === row.shipmentId) ?? shipmentFromInvoice(row);
                  const paidAmount = paidByInvoice.get(row.id) ?? 0;
                  const clientStatus = calculateInvoiceBalance(row, clientPayments).status;
                  return (
                    <tr key={`inv-${row.id}`} onClick={() => preview(shipment, row)} className="cursor-pointer hover:bg-surface-soft transition-colors">
                      <td className="num">
                        <span className="invoice-cell">{row.invoiceNumber}</span>
                      </td>
                      <td className="customer-cell">{row.clientName || (row.clientSnapshot.name as string) || "Client"}</td>
                      <td className="num">{formatDate(row.issueDate)}</td>
                      <td>{row.destination || (row.shipmentSnapshot.destination as string) || "Destination"}</td>
                      <td className="num">{money(row.totalAmount)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={row.status} />
                          <StatusBadge status={clientStatus} />
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button 
                            className="icon-btn" 
                            title={`Download Invoice (${invoiceItemsByInvoice.get(row.id)?.length ?? invoiceItems.filter((i) => i.invoiceId === row.id).length} items)`}
                            onClick={() => {
                              preview(shipment, row);
                              setTimeout(() => window.print(), 100);
                            }}
                          >
                            <Download size={15} />
                          </button>
                          <button className="table-action" onClick={() => markSent(row.id)}>
                            Mark Sent
                          </button>
                          {deleteInvoice && (
                            <button
                              className="icon-btn text-ink-3 hover:text-red-500"
                              onClick={() => {
                                if (window.confirm("Cancel this invoice? Issued history and line-item snapshots will be retained.")) {
                                  void deleteInvoice(row.id);
                                }
                              }}
                              title="Cancel Invoice"
                              disabled={row.status === "cancelled"}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                } else {
                  const row = item.data;
                  return (
                    <tr key={`ship-${row.id}`} className="hover:bg-surface-soft transition-colors">
                      <td className="num">
                        <span className="invoice-cell">{row.invoice}</span>
                      </td>
                      <td className="customer-cell">{row.customer}</td>
                      <td className="num">{formatDate(row.date)}</td>
                      <td>{row.destination}</td>
                      <td className="num">{money(row.companyTotal)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={row.invoiceStatus} />
                          <StatusBadge status={row.clientPaymentStatus} />
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button
                            className="table-action"
                            title="Generate a frozen draft from approved, included charges"
                            onClick={() => void generateInvoice(row)}
                          >
                            <FilePlus2 size={15} /> Generate Invoice
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
          {loading && <EmptyState text="Loading invoices..." />}
          {!loading && !unifiedRows.length && (
            <EmptyState text={search ? "No invoices match the current search." : "No invoices yet."} />
          )}
        </div>
      </div>
    </>
  );
}

function shipmentFromInvoice(invoice: Invoice): Shipment {
  const snapshot = invoice.shipmentSnapshot;
  const clientSnapshot = invoice.clientSnapshot;
  return {
    id: invoice.shipmentId ?? invoice.id,
    organizationId: invoice.organizationId,
    sr: 0,
    date: invoice.issueDate,
    invoice: invoice.invoiceNumber,
    loadingPoint: (snapshot.loadingPoint as string) || "",
    destination: (snapshot.destination as string) || invoice.destination || "",
    customer: (clientSnapshot.name as string) || invoice.clientName || "Client",
    driverName: (snapshot.driverName as string) || "",
    vehicleNo: (snapshot.vehicleNo as string) || "",
    truckType: (snapshot.truckType as string) || "",
    cellNo: "",
    companyRate: invoice.subtotal,
    driverRate: 0,
    advance: 0,
    gatePass: 0,
    fashah: 0,
    naql: invoice.expenseTotal,
    companyTotal: invoice.totalAmount,
    driverTotal: 0,
    pending: 0,
    netProfit: invoice.totalAmount,
    driverPaymentStatus: "Pending",
    invoiceStatus: invoice.status === "sent" ? "Sent" : invoice.status === "paid" ? "Paid" : invoice.status === "overdue" ? "Overdue" : "Draft",
    clientPaymentStatus: invoice.status === "paid" ? "Paid" : invoice.status === "overdue" ? "Overdue" : "Pending",
    remarks: invoice.notes ?? "",
    billImages: [],
  };
}
