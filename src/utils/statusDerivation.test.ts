import { describe, expect, it } from "vitest";
import type { Invoice, Shipment } from "../types/domain";
import { SETTABLE_INVOICE_STATUSES, deriveDisplayInvoiceStatus, invoiceStatusLabel } from "./statusDerivation";

const shipment = {} as Shipment;
const invoice = (status: Invoice["status"]) => ({ status }) as Invoice;

describe("invoice status display", () => {
  it("offers only Pending (stored as Draft) and Sent", () => {
    expect(SETTABLE_INVOICE_STATUSES.map(invoiceStatusLabel)).toEqual(["Pending", "Sent"]);
  });

  it("shows Draft as Pending and keeps other labels", () => {
    expect(invoiceStatusLabel("Draft")).toBe("Pending");
    expect(invoiceStatusLabel("Sent")).toBe("Sent");
    expect(invoiceStatusLabel("Cancelled")).toBe("Cancelled");
  });

  it("maps stored invoice records to a status the user can read", () => {
    expect(deriveDisplayInvoiceStatus(shipment)).toBe("Draft");
    expect(deriveDisplayInvoiceStatus(shipment, invoice("draft"))).toBe("Draft");
    expect(deriveDisplayInvoiceStatus(shipment, invoice("sent"))).toBe("Sent");
    expect(deriveDisplayInvoiceStatus(shipment, invoice("cancelled"))).toBe("Cancelled");
    // Paid/overdue invoice records still display as Pending; payment progress is shown by Company payment.
    expect(invoiceStatusLabel(deriveDisplayInvoiceStatus(shipment, invoice("paid")))).toBe("Pending");
  });
});
