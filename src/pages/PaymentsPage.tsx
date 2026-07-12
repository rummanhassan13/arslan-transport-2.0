import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { ClientPayment, DriverPayment, Invoice, Shipment } from "../types/domain";
import { formatDate, money, labelize } from "../utils/formatters";
import { EmptyState, KpiGrid, PageTitle, StatusBadge, DataTable } from "../components/ui";
import {
  calculateInvoiceBalance,
  signedClientPaymentAmount,
  signedDriverPaymentAmount,
  sumMoney,
} from "../domain/financials";

export function PaymentsPage({
  shipments,
  invoices = [],
  clientPayments = [],
  driverPayments = [],
  loading = false,
  error = null,
  openPayment,
  deleteClientPayment,
  deleteDriverPayment,
  embedded = false,
}: {
  shipments: Shipment[];
  invoices?: Invoice[];
  clientPayments?: ClientPayment[];
  driverPayments?: DriverPayment[];
  loading?: boolean;
  error?: string | null;
  openPayment: () => void;
  deleteClientPayment?: (paymentId: string) => Promise<void> | void;
  deleteDriverPayment?: (paymentId: string) => Promise<void> | void;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<"Client Receivables" | "Driver Payouts">("Client Receivables");
  const invoiceRows = invoices.length ? invoices : [];
  const paidByInvoice = new Map<string, number>();
  clientPayments.forEach((payment) => {
    paidByInvoice.set(payment.invoiceId, sumMoney([paidByInvoice.get(payment.invoiceId) ?? 0, signedClientPaymentAmount(payment)]));
  });
  const invoiceBalances = invoiceRows
    .filter((invoice) => invoice.status !== "cancelled")
    .map((invoice) => calculateInvoiceBalance(invoice, clientPayments));
  const paidThisPeriod = sumMoney(clientPayments.map(signedClientPaymentAmount));
  const outstanding = sumMoney(invoiceBalances.map((balance) => balance.balance));
  const overdue = sumMoney(invoiceBalances.filter((balance) => balance.overdue).map((balance) => balance.balance));
  const driverPayables = sumMoney(shipments.map((shipment) => shipment.pending));
  return (
    <>
      {embedded ? (
        <section className="filter-card">
          <div className="filter-toolbar">
            <div>
              <h3>Payments</h3>
              <p>Client receivables and driver settlement tracking.</p>
            </div>
            <button className="btn-primary" onClick={openPayment}>
              Add Payment
            </button>
          </div>
        </section>
      ) : (
        <PageTitle title="Payments" subtitle="Client receivables and driver settlement tracking." action="Add Payment" onAction={openPayment} />
      )}
      <KpiGrid
        items={[
          ["Outstanding", money(outstanding), "Client amounts not fully paid"],
          ["Paid this period", money(paidThisPeriod), "Based on current shipment statuses"],
          ["Overdue", money(overdue), "Needs payment follow-up"],
          ["Driver Payables", money(driverPayables), "Open driver settlement balance"],
        ]}
      />
      <div className="period">
        {["Client Receivables", "Driver Payouts"].map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item as typeof tab)}>
            {item}
          </button>
        ))}
      </div>
      {error && <div className="form-error">{error}</div>}
      {tab === "Client Receivables" ? (
        <>
        <div className="table-card">
          <div className="table-title">
            <div>
              <h3>Client receivables ledger</h3>
              <p>Invoice-level receivables grouped by customer context.</p>
            </div>
            <span className="status num">{invoiceRows.length || shipments.length} rows</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th className="num text-right">Company Total</th>
                  <th className="num text-right">Paid</th>
                  <th className="num text-right">Pending</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.length ? invoiceRows.map((row) => {
                  const balance = calculateInvoiceBalance(row, clientPayments);
                  const paid = balance.paid;
                  const pending = balance.balance;
                  const status = balance.status;
                  return (
                    <tr key={row.id}>
                      <td className="num">
                        <span className="invoice-cell">{row.invoiceNumber}</span>
                      </td>
                      <td className="customer-cell">{row.clientName || (row.clientSnapshot.name as string) || "Client"}</td>
                      <td className="num">{formatDate(row.issueDate)}</td>
                      <td className="num">{money(row.totalAmount)}</td>
                      <td className="num">{money(paid)}</td>
                      <td className="num">{money(pending)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={status} />
                          <StatusBadge status={row.status} />
                        </div>
                      </td>
                      <td>
                        <button className="table-action" onClick={openPayment}>Record</button>
                      </td>
                    </tr>
                  );
                }) : shipments.map((row) => {
                  const pending = row.clientBalance ?? row.companyTotal;
                  return (
                    <tr key={row.id}>
                      <td className="num"><span className="invoice-cell">{row.invoice}</span></td>
                      <td className="customer-cell">{row.customer}</td>
                      <td className="num">{formatDate(row.date)}</td>
                      <td className="num">{money(row.companyTotal)}</td>
                      <td className="num">{money(row.companyTotal - pending)}</td>
                      <td className="num">{money(pending)}</td>
                      <td><div className="flex flex-wrap gap-1.5"><StatusBadge status={row.clientPaymentStatus} /><StatusBadge status={row.invoiceStatus} /></div></td>
                      <td><button className="table-action" onClick={openPayment}>Record</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && <EmptyState text="Loading payments..." />}
            {!loading && !invoiceRows.length && !shipments.length && <EmptyState text="No client receivables yet." />}
          </div>
        </div>
        <div className="mt-6">
          <DataTable
            title="Client Payments History"
            columns={["Date", "Customer", "Amount", "Method", "Reference", "Action"]}
            rows={clientPayments.map((payment) => {
              const customerName = payment.clientName || invoices.find((inv) => inv.id === payment.invoiceId)?.clientName || "Client";
              return [
                formatDate(payment.paymentDate),
                customerName,
                money(signedClientPaymentAmount(payment)),
                payment.paymentMethod || "-",
                payment.referenceNo || "-",
                deleteClientPayment && payment.direction !== -1 ? (
                  <button
                    className="icon-btn text-ink-3 hover:text-red-500"
                    onClick={() => {
                      if (window.confirm("Delete this payment? It will be removed from active balances and retained in audit history.")) {
                        void deleteClientPayment(payment.id);
                      }
                    }}
                    title="Delete Payment"
                    aria-label={`Delete client payment ${payment.id}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  "-"
                ),
              ];
            })}
          />
          {clientPayments.length === 0 && <EmptyState text="No client payment transactions recorded yet." />}
        </div>
        </>
      ) : (
        <>
        <div className="table-card">
          <div className="table-title">
            <div>
              <h3>Driver payout ledger</h3>
              <p>Trip-level driver payable amounts, advances, and pending balances.</p>
            </div>
            <span className="status num">{shipments.length} rows</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Invoice</th>
                  <th className="num text-right">Driver Rate</th>
                  <th className="num text-right">Advance</th>
                  <th className="num text-right">Driver Total</th>
                  <th className="num text-right">Pending</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((row) => {
                  const pending = row.pending;
                  const status = row.driverPaymentStatus;
                  return (
                    <tr key={row.id}>
                      <td className="customer-cell">{row.driverName}</td>
                      <td className="num"><span className="invoice-cell">{row.invoice}</span></td>
                      <td className="num">{money(row.driverRate)}</td>
                      <td className="num">{money(row.advance)}</td>
                      <td className="num">{money(row.driverTotal)}</td>
                      <td className="num">{money(pending)}</td>
                      <td><StatusBadge status={status} /></td>
                      <td><button className="table-action" onClick={openPayment}>Pay</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && <EmptyState text="Loading driver payouts..." />}
            {!loading && !shipments.length && <EmptyState text="No driver payouts yet." />}
          </div>
        </div>
        <div className="mt-6">
          <DataTable
            title="Driver Payouts History"
            columns={["Date", "Driver", "Amount", "Type", "Method", "Reference", "Action"]}
            rows={driverPayments.map((payment) => {
              const name = payment.driverName || shipments.find((s) => s.driverId === payment.driverId)?.driverName || "Driver";
              return [
                formatDate(payment.paymentDate),
                name,
                money(signedDriverPaymentAmount(payment)),
                payment.direction === -1 ? "Reversal" : labelize(payment.paymentType),
                payment.paymentMethod || "-",
                payment.referenceNo || "-",
                deleteDriverPayment && payment.direction !== -1 ? (
                  <button
                    className="icon-btn text-ink-3 hover:text-red-500"
                    onClick={() => {
                      if (window.confirm("Delete this driver payment? It will be removed from active balances and retained in audit history.")) {
                        void deleteDriverPayment(payment.id);
                      }
                    }}
                    title="Delete Payment"
                    aria-label={`Delete driver payment ${payment.id}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  "-"
                ),
              ];
            })}
          />
          {driverPayments.length === 0 && <EmptyState text="No driver payouts recorded yet." />}
        </div>
        </>
      )}
    </>
  );
}
