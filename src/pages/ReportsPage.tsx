import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown } from "lucide-react";
import { Card, PageTitle, StatusBadge } from "../components/ui";
import type { Shipment } from "../types/domain";
import { formatDate, money } from "../utils/formatters";
import { MonthlySummaryPrintTemplate } from "../components/MonthlySummaryPrintTemplate";

export function ReportsPage({ shipments }: { shipments: Shipment[] }) {
  return (
    <>
      <PageTitle
        title="Reports"
        subtitle="Generate and export operations and financial reports."
      />
      <section className="report-grid">
        <MonthlySummaryReportCard shipments={shipments} />
      </section>
    </>
  );
}

function MonthlySummaryReportCard({ shipments }: { shipments: Shipment[] }) {
  const [customer, setCustomer] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);

  const uniqueCustomers = useMemo(() => Array.from(new Set(shipments.map((s) => s.customer).filter(Boolean))), [shipments]);

  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      if (s.deletedAt) return false;
      if (customer && s.customer !== customer) return false;
      if (invoiceStatus && s.invoiceStatus !== invoiceStatus) return false;
      const sDate = s.date || s.shipmentDate;
      if (startDate && sDate && sDate < startDate) return false;
      if (endDate && sDate && sDate > endDate) return false;
      return true;
    });
  }, [shipments, customer, invoiceStatus, startDate, endDate]);

  const handleExportPdf = () => {
    if (filteredShipments.length > 80) {
      alert("Too many shipments for one page. Please reduce the date range.");
      return;
    }
    setIsPrinting(true);
  };

  return (
    <Card title="Monthly Summary Report">
      <div className="report-card-body">
        <div className="report-filter-grid">
          <label className="field">
            <span>Customer</span>
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">All customers</option>
              {uniqueCustomers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Invoice status</span>
            <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}>
              <option value="">All statuses</option>
              {(["Draft", "Sent", "Pending", "Partially Paid", "Paid", "Overdue", "Cancelled"] as const).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-preview">
          <div className="report-preview-header">
            <strong>Report preview</strong>
            <span>{filteredShipments.length} shipment{filteredShipments.length === 1 ? "" : "s"}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Route</th>
                  <th className="num">Company Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.slice(0, 20).map((shipment) => (
                  <tr key={shipment.id}>
                    <td className="num">{formatDate(shipment.date || shipment.shipmentDate || "")}</td>
                    <td><span className="invoice-cell">{shipment.invoice || shipment.invoiceReference || shipment.sr}</span></td>
                    <td>{shipment.customer}</td>
                    <td>{shipment.loadingPoint} → {shipment.destination}</td>
                    <td className="num">{money(shipment.companyTotal)}</td>
                    <td><StatusBadge status={shipment.invoiceStatus} /></td>
                  </tr>
                ))}
                {filteredShipments.length === 0 && (
                  <tr><td colSpan={6}><div className="empty-state">No shipments match the selected report filters.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredShipments.length > 20 && (
            <div className="report-preview-header"><span>Showing 20 of {filteredShipments.length} shipments in the preview. The export includes the full filtered set.</span></div>
          )}
        </div>

        <div className="report-actions">
          <button className="btn-primary" onClick={handleExportPdf}><FileDown size={16} /> Export PDF</button>
        </div>
      </div>

      {isPrinting && createPortal(
        <div className="modal-backdrop">
          <MonthlySummaryPrintTemplate
            shipments={filteredShipments}
            customerName={customer}
            dateRange={`${startDate} - ${endDate}`.replace(/^ - $|^ -|- $/g, "") || "All Time"}
            invoiceStatus={invoiceStatus}
            onClose={() => setIsPrinting(false)}
          />
        </div>,
        document.body
      )}
    </Card>
  );
}
