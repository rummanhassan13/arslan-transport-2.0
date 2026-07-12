import { Printer } from "lucide-react";
import arslanLogo from "../assets/invoice-template/image3.jpeg";
import type { Shipment } from "../types/domain";

type MonthlySummaryPrintTemplateProps = {
  shipments: Shipment[];
  customerName: string;
  dateRange: string;
  invoiceStatus: string;
  onClose?: () => void;
};

function formatSummaryDate(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

export function MonthlySummaryPrintTemplate({ shipments, customerName, dateRange, invoiceStatus, onClose }: MonthlySummaryPrintTemplateProps) {
  const generatedDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  
  const half = Math.ceil(shipments.length / 2);
  const column1 = shipments.slice(0, half);
  const column2 = shipments.slice(half);

  return (
    <div className="invoice-print-preview">
      <div className="invoice-print-toolbar">
        <button className="primary-btn" type="button" onClick={() => window.print()}>
          <Printer size={16} />
          Print Summary
        </button>
        {onClose && (
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        )}
      </div>

      <div className="invoice-scale-wrapper">
        <article className="invoice-print-document summary-print-document" aria-label="Monthly Summary Report">
          <header className="arslan-letterhead">
            <div className="arslan-brand-row">
              <img className="arslan-logo" src={arslanLogo} alt="Arslan Transportation truck logo" />
              <div className="arslan-title-block">
                <div className="arslan-arabic">
                  <span>ارسلان للنقليات</span>
                  <span>ش.ذ.م.م</span>
                </div>
                <h1>ARSLAN TRANSPORTATION L.L.C</h1>
              </div>
            </div>
            <div className="arslan-rule" />
          </header>

          <main className="arslan-invoice-body">
            <h2>MONTHLY SUMMARY REPORT</h2>
            <section className="summary-meta-row" aria-label="Report summary">
              <div>
                <span>CUSTOMER:</span>
                <strong>{customerName || "All"}</strong>
              </div>
              <div>
                <span>DATE RANGE:</span>
                <strong>{dateRange || "All"}</strong>
              </div>
              <div>
                <span>STATUS:</span>
                <strong>{invoiceStatus || "All"}</strong>
              </div>
              <div>
                <span>GENERATED:</span>
                <strong>{generatedDate}</strong>
              </div>
            </section>

            <table className="summary-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>REFERENCE</th>
                  <th>DATE</th>
                  <th>REFERENCE</th>
                </tr>
              </thead>
              <tbody>
                {column1.map((shipment, index) => {
                  const rightShipment = column2[index];
                  return (
                    <tr key={shipment.id}>
                      <td>{formatSummaryDate(shipment.date || shipment.shipmentDate)}</td>
                      <td>{shipment.invoice || shipment.invoiceReference || shipment.sr || "-"}</td>
                      <td>{rightShipment ? formatSummaryDate(rightShipment.date || rightShipment.shipmentDate) : ""}</td>
                      <td>{rightShipment ? (rightShipment.invoice || rightShipment.invoiceReference || rightShipment.sr || "-") : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </main>

          <footer className="arslan-footer">
            <div className="arslan-footer-rule" />
            <p>
              <strong>TEL NO:</strong> +971508182942,&nbsp;&nbsp;&nbsp;&nbsp;
              <strong>P.O BOX:</strong> 3201, BUR DUBAI, DUBAI , U.A.E
            </p>
            <p>
              <strong>Website :</strong> https://arslantransport.com&nbsp;&nbsp;&nbsp;&nbsp;
              <strong>EMAIL:</strong> Arslantransport@outlook.com
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
