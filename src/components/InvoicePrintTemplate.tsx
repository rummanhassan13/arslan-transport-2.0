import { Printer } from "lucide-react";
import type { Ref } from "react";
import { StandaloneInvoiceTemplate, type StandaloneInvoiceLineItem } from "../templates/StandaloneInvoiceTemplate";
import type { Invoice, InvoiceItem, Shipment, ShipmentDriverAssignment, ShipmentExpense } from "../types/domain";
import { getExpenseClientBillAmount } from "../utils/calculations";

type InvoicePrintTemplateProps = {
  shipment: Shipment;
  invoiceRecord?: Invoice;
  invoiceItems?: InvoiceItem[];
  shipmentExpenses?: ShipmentExpense[];
  documentRef?: Ref<HTMLElement>;
  hideToolbar?: boolean;
};

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

function hasDriverDetails(description: string) {
  const normalized = description.toLowerCase();
  return normalized.includes("driver") && (normalized.includes("truck no") || normalized.includes("vehicle"));
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

function withDriverDetails(description: string, details: DriverDetail[]) {
  const baseDescription = description.trim();
  if (!details.length || hasDriverDetails(baseDescription)) return baseDescription;
  return `${baseDescription}\n\n${formatDriverDetails(details)}`;
}

function expenseDescription(item: InvoiceItem) {
  const category = typeof item.snapshot?.category === "string" ? item.snapshot.category : "";
  const normalizedCategory = category.trim().toLowerCase();
  const description = item.description || "";
  const normalizedDescription = description.trim().toLowerCase().replace(/\s+/g, "_");
  return EXPENSE_LABELS[normalizedCategory] ?? EXPENSE_LABELS[normalizedDescription] ?? normalizeDescription(description);
}

function buildInvoiceRows(shipment: Shipment, invoiceRecord?: Invoice, invoiceItems: InvoiceItem[] = [], shipmentExpenses: ShipmentExpense[] = []): StandaloneInvoiceLineItem[] {
  const loadingPoint = snapshotText(invoiceRecord?.shipmentSnapshot, "loadingPoint", shipment.loadingPoint);
  const destination = invoiceRecord?.destination || snapshotText(invoiceRecord?.shipmentSnapshot, "destination", shipment.destination);
  const transportAmount = invoiceRecord?.subtotal ?? shipment.companyRate;
  const defaultTransportDescription = `TRIP FROM: ${loadingPoint || "LOADING POINT"} TO ${destination || "DESTINATION"}`;

  // Identify all active, billable, invoicable expenses
  const activeExpenses = shipmentExpenses.filter((e) => e.approved && e.clientBillable && e.includedInInvoice && !e.deletedAt);
  const activeExpenseIds = new Set(activeExpenses.map(e => e.id));

  const resolvedRows: StandaloneInvoiceLineItem[] = [];
  
  // Transport Rows
  if (invoiceRecord) {
    const transportItems = invoiceItems.filter(item => item.itemType === "transport");
    if (transportItems.length > 0) {
      transportItems.forEach(item => {
        resolvedRows.push({
          description: withDriverDetails(item.description || defaultTransportDescription, shipmentDriverDetails(shipment, invoiceRecord, item)),
          unitPrice: item.unitPrice || item.amount,
          amount: item.amount,
        });
      });
    } else {
      // Legacy fallback
      resolvedRows.push({
        description: withDriverDetails(defaultTransportDescription, shipmentDriverDetails(shipment, invoiceRecord)),
        unitPrice: transportAmount,
        amount: transportAmount,
      });
    }
  } else {
    // Dynamic generation when no invoiceRecord exists
    resolvedRows.push({
      description: withDriverDetails(defaultTransportDescription, shipmentDriverDetails(shipment)),
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

  return resolvedRows;
}

export function InvoicePrintTemplate({
  shipment,
  invoiceRecord,
  invoiceItems = [],
  shipmentExpenses = [],
  documentRef,
  hideToolbar = false,
}: InvoicePrintTemplateProps) {
  const invoiceNumber = formatInvoiceNo(invoiceRecord?.invoiceNumber || shipment.invoice);
  const invoiceDate = formatTemplateDate(invoiceRecord?.issueDate || shipment.date);
  const clientName = invoiceRecord?.clientName || snapshotText(invoiceRecord?.clientSnapshot, "name", shipment.customer);
  const rows = buildInvoiceRows(shipment, invoiceRecord, invoiceItems, shipmentExpenses);

  return (
    <div className="invoice-print-preview">
      {!hideToolbar && (
        <div className="invoice-print-toolbar">
          <button className="primary-btn" type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Print invoice
          </button>
        </div>
      )}

      <div className="invoice-scale-wrapper">
        <StandaloneInvoiceTemplate
          data={{ invoiceNumber, invoiceDate, clientName, rows }}
          documentRef={documentRef}
        />
      </div>
    </div>
  );
}
