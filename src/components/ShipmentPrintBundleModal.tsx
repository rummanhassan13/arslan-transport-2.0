import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, LoaderCircle, RefreshCcw } from "lucide-react";
import type { Invoice, InvoiceItem, Shipment, ShipmentAttachment, ShipmentExpense } from "../types/domain";
import { buildShipmentPrintBundle, shipmentPrintBundleFileName, type ShipmentPrintProgress } from "../services/shipmentPrintBundle";
import { formatFileSize } from "../utils/fileValidation";
import { InvoicePrintTemplate } from "./InvoicePrintTemplate";
import { Modal } from "./ui";

type ShipmentPrintBundleModalProps = {
  shipment: Shipment;
  invoiceRecord: Invoice;
  invoiceItems: InvoiceItem[];
  shipmentExpenses: ShipmentExpense[];
  attachments: ShipmentAttachment[];
  onClose: () => void;
};

const LARGE_BUNDLE_WARNING_BYTES = 40 * 1024 * 1024;

function progressLabel(progress: ShipmentPrintProgress | null) {
  if (!progress || progress.phase === "rendering_invoice") return "Rendering invoice page...";
  if (progress.phase === "finalizing") return "Finalizing combined PDF...";
  return `Adding ${progress.fileName || "shipment document"}...`;
}

export function ShipmentPrintBundleModal({ shipment, invoiceRecord, invoiceItems, shipmentExpenses, attachments, onClose }: ShipmentPrintBundleModalProps) {
  const invoiceRef = useRef<HTMLElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<ShipmentPrintProgress | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");
  const fileName = shipmentPrintBundleFileName(invoiceRecord.invoiceNumber || shipment.invoice);
  const totalAttachmentSize = useMemo(() => attachments.reduce((total, attachment) => total + attachment.fileSize, 0), [attachments]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let generatedUrl = "";
    setProgress(null);
    setPdfUrl("");
    setError("");

    const generate = async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!invoiceRef.current) throw new Error("The invoice page is not ready for rendering.");
      const bytes = await buildShipmentPrintBundle({
        invoiceElement: invoiceRef.current,
        attachments,
        signal: controller.signal,
        onProgress: (nextProgress) => { if (active) setProgress(nextProgress); },
      });
      if (!active) return;
      const blobBytes = Uint8Array.from(bytes);
      generatedUrl = URL.createObjectURL(new Blob([blobBytes.buffer], { type: "application/pdf" }));
      setPdfUrl(generatedUrl);
    };

    void generate().catch((generationError) => {
      if (!active || controller.signal.aborted) return;
      setError(generationError instanceof Error ? generationError.message : "Unable to prepare the shipment PDF.");
    });

    return () => {
      active = false;
      controller.abort();
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [attachments, attempt, invoiceItems, invoiceRecord, shipment, shipmentExpenses]);

  const preparing = !pdfUrl && !error;
  const completion = progress ? Math.round((progress.completed / progress.total) * 100) : 5;

  return (
    <Modal
      title={`Shipment documents - ${invoiceRecord.invoiceNumber || shipment.invoice}`}
      onClose={onClose}
      size="page"
      footer={<>
        <button className="btn-ghost" onClick={onClose} type="button">Close</button>
        {error && <button className="btn-primary" onClick={() => setAttempt((value) => value + 1)} type="button"><RefreshCcw size={15} /> Retry</button>}
        {pdfUrl && <>
          <a className="btn-ghost" download={fileName} href={pdfUrl}><Download size={15} /> Download PDF</a>
          <button className="btn-primary" onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")} type="button"><ExternalLink size={15} /> Open / Print</button>
        </>}
      </>}
    >
      <div className="shipment-print-capture" aria-hidden="true">
        <InvoicePrintTemplate documentRef={invoiceRef} hideToolbar invoiceItems={invoiceItems} invoiceRecord={invoiceRecord} shipment={shipment} shipmentExpenses={shipmentExpenses} />
      </div>

      {preparing && <div className="shipment-print-state" aria-live="polite">
        <LoaderCircle className="document-spinner" size={34} />
        <strong>Preparing one printable shipment file</strong>
        <span>{progressLabel(progress)}</span>
        <div className="shipment-print-progress" aria-label="PDF preparation progress"><span style={{ width: `${completion}%` }} /></div>
        <small>Invoice first, followed by {attachments.length} document{attachments.length === 1 ? "" : "s"}.</small>
      </div>}

      {error && <div className="shipment-print-state shipment-print-error" role="alert">
        <AlertTriangle size={34} /><strong>The combined PDF could not be created</strong><span>{error}</span><small>No document was silently omitted.</small>
      </div>}

      {pdfUrl && <div className="shipment-print-preview-shell">
        <div className="shipment-print-summary"><FileText size={18} /><div><strong>{fileName}</strong><span>Invoice + {attachments.length} attachment{attachments.length === 1 ? "" : "s"}</span></div></div>
        <iframe className="shipment-print-pdf" src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`} title={fileName} />
      </div>}

      {totalAttachmentSize > LARGE_BUNDLE_WARNING_BYTES && <p className="inline-alert shipment-print-size-warning"><AlertTriangle size={15} /> This shipment contains {formatFileSize(totalAttachmentSize)} of attachments. Preparation may take longer on low-memory devices.</p>}
    </Modal>
  );
}
