import type { Ref } from "react";
import arslanLogo from "../assets/invoice-template/image3.jpeg";
import trnBadge from "../assets/invoice-template/image7.png";
import signatureImage from "../assets/invoice-template/image8.jpeg";
import stampImage from "../assets/invoice-template/image9.jpeg";

export type StandaloneInvoiceLineItem = {
  description: string;
  unitPrice: number;
  amount: number;
};

export type StandaloneInvoiceTemplateData = {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  rows: StandaloneInvoiceLineItem[];
};

type StandaloneInvoiceTemplateProps = {
  data: StandaloneInvoiceTemplateData;
  documentRef?: Ref<HTMLElement>;
};

function formatAmount(value: number | null | undefined, fractionDigits = 0) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Pure A4 invoice markup: no modal, toolbar, print command, or data access. */
export function StandaloneInvoiceTemplate({ data, documentRef }: StandaloneInvoiceTemplateProps) {
  const totalAmount = data.rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <article className="invoice-print-document" aria-label={`Tax invoice ${data.invoiceNumber}`} ref={documentRef}>
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
        <h2>TAX INVOICE</h2>
        <img className="arslan-trn" src={trnBadge} alt="TRN number 104401155700003" />

        <section className="arslan-meta-row" aria-label="Invoice summary">
          <div>
            <span>INVOICE NO:</span>
            <strong>{data.invoiceNumber}</strong>
          </div>
          <div>
            <span>DATE:</span>
            <strong>{data.invoiceDate}</strong>
          </div>
        </section>

        <p className="arslan-client-name">MR/MS {data.clientName || "COMPANY"}</p>

        <table className="arslan-charge-table">
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th>UNIT<br />PRICE</th>
              <th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td>
                  {String(row.description || "").split("\n").map((line, lineIndex) => (
                    <div key={lineIndex} style={{ minHeight: line.trim() === "" ? "0.75rem" : "auto" }}>
                      {line}
                    </div>
                  ))}
                </td>
                <td className="num">{formatAmount(row.unitPrice)}</td>
                <td className="num">{formatAmount(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL AMOUNT</th>
              <td />
              <td className="num">
                <strong>{formatAmount(totalAmount, 2)}/-</strong>
                <span>AED</span>
              </td>
            </tr>
          </tfoot>
        </table>

        <section className="arslan-signature-row" aria-label="Authorized signature">
          <span className="arslan-dot">.</span>
          <div className="arslan-signature-block">
            <div className="arslan-stamp-stack">
              <img className="arslan-signature" src={signatureImage} alt="Authorized signature" />
              <img className="arslan-stamp" src={stampImage} alt="Arslan Transportation stamp" />
            </div>
            <div className="arslan-signature-line" />
            <p>(Authorized Signatory)</p>
          </div>
        </section>
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
  );
}
