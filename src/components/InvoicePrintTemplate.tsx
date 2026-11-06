import { Printer } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { StandaloneInvoiceTemplate, type StandaloneInvoiceLineItem } from "../templates/StandaloneInvoiceTemplate";
import { useBusinessSettingsContext } from "../contexts/BusinessSettingsContext";
import type { Client, Invoice, InvoiceItem, Shipment, ShipmentDriverAssignment, ShipmentExpense } from "../types/domain";
import { getExpenseClientBillAmount } from "../utils/calculations";

type InvoicePrintTemplateProps = {
  shipment: Shipment;
  invoiceRecord?: Invoice;
  invoiceItems?: InvoiceItem[];
  shipmentExpenses?: ShipmentExpense[];
  documentRef?: Ref<HTMLElement>;
  hideToolbar?: boolean;
  /** Current company record; supplies the invoice name, TRN and IBAN toggle. */
  client?: Client;
  /** Shrink the whole page to fit the space it is given (no scrolling). Used by the preview modal. */
  fitToContainer?: boolean;
};

// A4 at 96 dpi: 210mm x 297mm.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

/**
 * Measures the preview area and returns the scale that fits the whole page (width and
 * height) inside it. The page can grow taller than A4 when there are many charges, so
 * its real height is measured too.
 */
function useFitScale(enabled: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ scale: number; pageHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const page = pageRef.current;
    if (!container || !page || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const style = window.getComputedStyle(container);
      const gap = Number.parseFloat(style.rowGap) || 0;
      const toolbarHeight = toolbarRef.current ? toolbarRef.current.offsetHeight + gap : 0;
      const availableWidth = container.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
      const availableHeight =
        container.clientHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0) - toolbarHeight;
      // offsetHeight ignores the CSS transform, so this is the page's real (unscaled) height.
      const pageHeight = Math.max(A4_HEIGHT_PX, page.firstElementChild instanceof HTMLElement ? page.firstElementChild.offsetHeight : 0);
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const scale = Math.min(availableWidth / A4_WIDTH_PX, availableHeight / pageHeight, 1);
      setFit((current) =>
        current && Math.abs(current.scale - scale) < 0.001 && current.pageHeight === pageHeight ? current : { scale, pageHeight },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    if (page.firstElementChild) observer.observe(page.firstElementChild);
    return () => observer.disconnect();
  }, [enabled]);

  const wrapperStyle: CSSProperties | undefined =
    enabled && fit
      ? ({ "--actual-scale": fit.scale, height: `${fit.pageHeight * fit.scale}px` } as CSSProperties)
      : undefined;

  return { containerRef, toolbarRef, pageRef, wrapperStyle };
}

type DriverDetail = {
  driverName: string;
  vehicleNo: string;
  truckType: string;
};

const EXPENSE_LABELS: Record<string, string> = {
  gate_pass: "BATHA BORDER CHARGES",
  fashah: "FASAH",
  fasha: "FASAH",
  naql: "LOGISTIC CLEARING CHARGES",
  customs: "CUSTOM CHARGES",
  custom: "CUSTOM CHARGES",
  clearance: "CLEARANCE CHARGES",
  toll: "SAUDI TOLL GATE",
};

function snapshotText(snapshot: Record<string, unknown> | undefined, key: string, fallback = "") {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatTemplateDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.toUpperCase();

  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function formatInvoiceNo(value: string | undefined | null) {
  if (!value) return "";
  const cleanValue = String(value).trim();
  return cleanValue.replace(/^[A-Z]+-/, "") || cleanValue;
}

function normalizeDescription(value: string | undefined | null) {
  return String(value || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function snapshotAssignments(value: unknown): ShipmentDriverAssignment[] {
  return Array.isArray(value) ? (value.filter(Boolean) as ShipmentDriverAssignment[]) : [];
}

function detailFromAssignment(assignment: ShipmentDriverAssignment | Record<string, unknown>): DriverDetail | null {
  const record = assignment as Record<string, unknown>;
  const driverName = textValue(record.driverName);
  const vehicleNo = textValue(record.vehicleNo) || textValue(record.vehicleNumber);
  const truckType = textValue(record.truckType) || textValue(record.truckTypeName);

  if (!driverName && !vehicleNo && !truckType) return null;
  return { driverName, vehicleNo, truckType };
}

function driverDetailsFromAssignments(assignments: unknown): DriverDetail[] {
  return snapshotAssignments(assignments).map(detailFromAssignment).filter((detail): detail is DriverDetail => Boolean(detail));
}

function driverDetailsFromSnapshot(snapshot: Record<string, unknown> | undefined): DriverDetail[] {
  if (!snapshot) return [];

  const assignmentDetails = driverDetailsFromAssignments(snapshot.assignments);
  if (assignmentDetails.length > 0) return assignmentDetails;

  const fallback = detailFromAssignment({
    driverName: snapshot.driverName,
    vehicleNo: snapshot.vehicleNo,
    vehicleNumber: snapshot.vehicleNumber,
    truckType: snapshot.truckType,
    truckTypeName: snapshot.truckTypeName,
  });
  return fallback ? [fallback] : [];
}

function shipmentDriverDetails(shipment: Shipment, invoiceRecord?: Invoice, item?: InvoiceItem): DriverDetail[] {
  const sources: DriverDetail[][] = [
    driverDetailsFromSnapshot(item?.snapshot),
    driverDetailsFromSnapshot(invoiceRecord?.shipmentSnapshot),
    driverDetailsFromAssignments(shipment.assignments),
    driverDetailsFromSnapshot({
      driverName: shipment.driverName,
      vehicleNo: shipment.vehicleNo,
      truckType: shipment.truckType,
    }),
  ];

  return sources.find((details) => details.length > 0) ?? [];
}

// Lines of driver/waybill text that older invoices (and demo mode) saved inside the
// trip line, e.g. "Driver 1: X", "Truck No: Y", "Vehicle Type: Z", "WAYBILL NO: W".
const EMBEDDED_DRIVER_LINE = /^\s*(driver(\s+\d+)?(\s+name)?|truck\s*no|vehicle\s*type|type\s+of\s+vehicle|waybill\s*no)\s*:/i;

/** The trip line shows only the route; driver details now print in their own row at the bottom. */
function stripDriverDetails(description: string) {
  return description
    .split("\n")
    .filter((line) => !EMBEDDED_DRIVER_LINE.test(line))
    .join("\n")
    .replace(/\n\s*\n(\s*\n)+/g, "\n\n")
    .trim();
}

function formatDriverDetails(details: DriverDetail[]) {
  return details.map((detail, index) => {
    const prefix = details.length > 1 ? `DRIVER ${index + 1} NAME` : "DRIVER NAME";
    return [
      `${prefix}: ${detail.driverName || "Not specified"}`,
      `TRUCK NO: ${detail.vehicleNo || "Not specified"}`,
      `TYPE OF VEHICLE: ${detail.truckType || "Not specified"}`,
    ].join("\n");
  }).join("\n\n");
}

/** Driver name, truck number, vehicle type and waybill, printed as the last row. */
function driverDetailsRow(details: DriverDetail[], waybillNumber = ""): StandaloneInvoiceLineItem | null {
  const lines = [details.length ? formatDriverDetails(details) : "", waybillNumber ? `WAYBILL NO: ${waybillNumber}` : ""].filter(Boolean);
  if (!lines.length) return null;
  return { description: lines.join("\n"), unitPrice: 0, amount: 0, detailOnly: true };
}

function expenseDescription(item: InvoiceItem) {
  const category = typeof item.snapshot?.category === "string" ? item.snapshot.category : "";
  const normalizedCategory = category.trim().toLowerCase();
  const description = item.description || "";
  const normalizedDescription = description.trim().toLowerCase().replace(/\s+/g, "_");
  return EXPENSE_LABELS[normalizedCategory] ?? EXPENSE_LABELS[normalizedDescription] ?? normalizeDescription(description);
}

function buildInvoiceRows(shipment: Shipment, invoiceRecord?: Invoice, invoiceItems: InvoiceItem[] = [], shipmentExpenses: ShipmentExpense[] = [], waybillNumber = ""): StandaloneInvoiceLineItem[] {
  const loadingPoint = snapshotText(invoiceRecord?.shipmentSnapshot, "loadingPoint", shipment.loadingPoint);
  const destination = invoiceRecord?.destination || snapshotText(invoiceRecord?.shipmentSnapshot, "destination", shipment.destination);
  const transportAmount = invoiceRecord?.subtotal ?? shipment.companyRate;
  const defaultTransportDescription = `TRIP FROM: ${loadingPoint || "LOADING POINT"} TO ${destination || "DESTINATION"}`;

  // Identify all active, billable, invoicable expenses
  const activeExpenses = shipmentExpenses.filter((e) => e.approved && e.clientBillable && e.includedInInvoice && !e.deletedAt);
  const activeExpenseIds = new Set(activeExpenses.map(e => e.id));

  const resolvedRows: StandaloneInvoiceLineItem[] = [];
  // Driver details are collected here and printed once, after all charges.
  let driverDetails: DriverDetail[];

  // Transport Rows
  if (invoiceRecord) {
    const transportItems = invoiceItems.filter(item => item.itemType === "transport");
    if (transportItems.length > 0) {
      driverDetails = shipmentDriverDetails(shipment, invoiceRecord, transportItems[0]);
      transportItems.forEach(item => {
        resolvedRows.push({
          description: stripDriverDetails(item.description || "") || defaultTransportDescription,
          unitPrice: item.unitPrice || item.amount,
          amount: item.amount,
        });
      });
    } else {
      // Legacy fallback
      driverDetails = shipmentDriverDetails(shipment, invoiceRecord);
      resolvedRows.push({
        description: defaultTransportDescription,
        unitPrice: transportAmount,
        amount: transportAmount,
      });
    }
  } else {
    // Dynamic generation when no invoiceRecord exists
    driverDetails = shipmentDriverDetails(shipment);
    resolvedRows.push({
      description: defaultTransportDescription,
      unitPrice: transportAmount,
      amount: transportAmount,
    });
  }
  
  if (invoiceRecord) {
    const billedItems = invoiceItems.filter((item) => item.amount > 0 && item.itemType !== "transport");
    // For existing invoices, process billed items, filtering out removed expenses
    billedItems.forEach(item => {
      const expenseId = item.snapshot?.expenseId as string | undefined;
      if (expenseId) {
        if (activeExpenseIds.has(expenseId)) {
          resolvedRows.push({
            description: expenseDescription(item),
            unitPrice: item.unitPrice || item.amount,
            amount: item.amount,
          });
          activeExpenseIds.delete(expenseId);
        }
      } else {
        resolvedRows.push({
          description: expenseDescription(item),
          unitPrice: item.unitPrice || item.amount,
          amount: item.amount,
        });
      }
    });

    // Add active expenses that were missing from the invoice items
    activeExpenses.forEach(e => {
      if (activeExpenseIds.has(e.id)) {
        const billAmount = getExpenseClientBillAmount(e);
        if (billAmount > 0) {
          resolvedRows.push({
            description: String(e.category || "").replace(/_/g, " ").toUpperCase(),
            unitPrice: billAmount,
            amount: billAmount,
          });
        }
      }
    });
  } else {
    // If no invoice yet, generate rows strictly from shipment expenses or legacy fields
    if (shipmentExpenses.length > 0) {
      activeExpenses.forEach(e => {
        const billAmount = getExpenseClientBillAmount(e);
        if (billAmount > 0) {
          resolvedRows.push({
            description: String(e.category || "").replace(/_/g, " ").toUpperCase(),
            unitPrice: billAmount,
            amount: billAmount,
          });
        }
      });
    } else {
      const legacyItems = [
        { description: "SAUDI TOLL GATE", amount: shipment.gatePass },
        { description: "FASAH", amount: shipment.fashah },
        { description: "NAQL", amount: shipment.naql },
      ];
      legacyItems.forEach(item => {
        if (item.amount > 0) {
          resolvedRows.push({
            description: item.description,
            unitPrice: item.amount,
            amount: item.amount,
          });
        }
      });
    }
  }

  const driverRow = driverDetailsRow(driverDetails, waybillNumber);
  if (driverRow) resolvedRows.push(driverRow);

  return resolvedRows;
}

export function InvoicePrintTemplate({
  shipment,
  invoiceRecord,
  invoiceItems = [],
  shipmentExpenses = [],
  documentRef,
  hideToolbar = false,
  client,
  fitToContainer = false,
}: InvoicePrintTemplateProps) {
  const { company } = useBusinessSettingsContext();
  const { containerRef, toolbarRef, pageRef, wrapperStyle } = useFitScale(fitToContainer);
  const invoiceNumber = formatInvoiceNo(invoiceRecord?.invoiceNumber || shipment.invoice);
  const invoiceDate = formatTemplateDate(invoiceRecord?.issueDate || shipment.date);
  const clientName =
    client?.invoiceCompanyName?.trim() ||
    client?.name ||
    invoiceRecord?.clientName ||
    snapshotText(invoiceRecord?.clientSnapshot, "name", shipment.customer);
  const clientTrn = client?.trn?.trim() || "";
  const businessIban = client?.showIbanOnInvoice ? company.iban?.trim() || "" : "";
  const rows = buildInvoiceRows(shipment, invoiceRecord, invoiceItems, shipmentExpenses, shipment.waybillNumber?.trim() || "");

  return (
    <div className={`invoice-print-preview${fitToContainer ? " is-fit" : ""}`} ref={containerRef}>
      {!hideToolbar && (
        <div className="invoice-print-toolbar" ref={toolbarRef}>
          <button className="primary-btn" type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Print invoice
          </button>
        </div>
      )}

      <div className="invoice-scale-wrapper" ref={pageRef} style={wrapperStyle}>
        <StandaloneInvoiceTemplate
          data={{
            invoiceNumber,
            invoiceDate,
            clientName,
            clientTrn,
            businessName: company.companyName?.trim() || "",
            businessTrn: company.trn?.trim() || "",
            businessIban,
            rows,
          }}
          documentRef={documentRef}
        />
      </div>
    </div>
  );
}
