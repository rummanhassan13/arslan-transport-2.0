// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invoice, InvoiceItem, Shipment } from "../types/domain";
import { InvoicePrintTemplate } from "./InvoicePrintTemplate";

vi.mock("../contexts/BusinessSettingsContext", () => ({
  useBusinessSettingsContext: () => ({ company: { companyName: "", trn: "", iban: "" } }),
}));

afterEach(cleanup);

const shipment = {
  id: "shipment-1",
  date: "2026-11-03",
  invoice: "1001",
  loadingPoint: "DUBAI",
  destination: "RIYADH",
  customer: "Example Logistics",
  driverName: "Ahmed",
  vehicleNo: "ABC-123",
  truckType: "FLATBED",
  companyRate: 1200,
  gatePass: 0,
  fashah: 0,
  naql: 0,
} as Shipment;

describe("InvoicePrintTemplate", () => {
  it("prints the shipment waybill number under the driver details", () => {
    render(<InvoicePrintTemplate shipment={{ ...shipment, waybillNumber: "WB-555" }} hideToolbar />);

    const truckType = screen.getByText("TYPE OF VEHICLE: FLATBED");
    const waybill = screen.getByText("WAYBILL NO: WB-555");
    expect(truckType.compareDocumentPosition(waybill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits the waybill line when the shipment has none", () => {
    render(<InvoicePrintTemplate shipment={shipment} hideToolbar />);

    expect(screen.getByText("DRIVER NAME: Ahmed")).toBeTruthy();
    expect(screen.queryByText(/WAYBILL/)).toBeNull();
  });

  it("prints the trip, then the expenses, then the driver details last without changing the total", () => {
    render(<InvoicePrintTemplate shipment={{ ...shipment, gatePass: 300, fashah: 50 }} hideToolbar />);

    const trip = screen.getByText("TRIP FROM: DUBAI TO RIYADH");
    const expense = screen.getByText("FASAH");
    const driver = screen.getByText("DRIVER NAME: Ahmed");
    expect(trip.compareDocumentPosition(expense) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(expense.compareDocumentPosition(driver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const driverRow = driver.closest("tr")!;
    expect(driverRow.querySelectorAll("td.num")[1].textContent).toBe("");
    expect(screen.getByText("1,550.00/-")).toBeTruthy();
  });

  it("does not repeat driver details an older invoice saved inside the trip line", () => {
    const invoiceRecord = {
      id: "invoice-1",
      invoiceNumber: "1001",
      issueDate: "2026-10-15",
      shipmentSnapshot: {},
      subtotal: 1200,
    } as unknown as Invoice;
    const invoiceItems = [{
      id: "item-1",
      invoiceId: "invoice-1",
      itemType: "transport",
      description: "TRIP FROM: DUBAI TO RIYADH\n\nDriver 1: Ahmed\nTruck No: ABC-123\nVehicle Type: FLATBED",
      quantity: 1,
      unitPrice: 1200,
      amount: 1200,
      snapshot: {},
    }] as InvoiceItem[];
    render(<InvoicePrintTemplate shipment={shipment} invoiceRecord={invoiceRecord} invoiceItems={invoiceItems} hideToolbar />);

    expect(screen.queryByText("Driver 1: Ahmed")).toBeNull();
    expect(screen.getAllByText("DRIVER NAME: Ahmed")).toHaveLength(1);
  });

  it("prints the invoice's own date rather than the shipment date", () => {
    const invoiceRecord = { id: "invoice-1", invoiceNumber: "1001", issueDate: "2026-10-15", shipmentSnapshot: {} } as unknown as Invoice;
    render(<InvoicePrintTemplate shipment={shipment} invoiceRecord={invoiceRecord} hideToolbar />);

    expect(screen.getByText(/15-OCT-26/)).toBeTruthy();
    expect(screen.queryByText(/03-NOV-26/)).toBeNull();
  });
});
