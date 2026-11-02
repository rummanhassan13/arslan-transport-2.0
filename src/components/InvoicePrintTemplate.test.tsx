// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../types/domain";
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
});
