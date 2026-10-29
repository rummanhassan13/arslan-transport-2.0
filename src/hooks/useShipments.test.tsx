// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../types/domain";
import { planDeliveryTransitions } from "../utils/paymentStatusActions";
import { useShipments } from "./useShipments";

vi.mock("../config/env", () => ({ env: { demoMode: true } }));
vi.mock("./useAuth", () => ({ useAuth: () => ({ activeOrganization: null }) }));
vi.mock("./useGlobalRefresh", () => ({
  useGlobalRefresh: () => undefined,
  notifyGlobalRefresh: () => undefined,
}));

function seedShipment(status: Shipment["status"]): Shipment {
  return {
    id: "shipment-1",
    sr: 1,
    date: "2026-07-11",
    invoice: "SHP-1",
    status,
    loadingPoint: "Karachi",
    destination: "Lahore",
    customer: "Client",
    driverId: "driver-1",
    driverName: "Driver One",
    vehicleNo: "TRK-1",
    truckType: "Container",
    cellNo: "",
    companyRate: 1200,
    driverRate: 800,
    advance: 0,
    gatePass: 0,
    fashah: 0,
    naql: 0,
    companyTotal: 1200,
    driverTotal: 800,
    pending: 800,
    netProfit: 400,
    driverPaymentStatus: "Pending",
    invoiceStatus: "Draft",
    clientPaymentStatus: "Pending",
    remarks: "",
    billImages: [],
  } as Shipment;
}

describe("useShipments status transitions", () => {
  beforeEach(() => localStorage.clear());

  it("delivers a pending shipment by stepping through in transit back-to-back", async () => {
    localStorage.setItem("arslan-transport-shipments", JSON.stringify([seedShipment("pending")]));
    const { result } = renderHook(() => useShipments());

    await act(async () => {
      for (const status of planDeliveryTransitions(result.current.shipments[0].status)) {
        await result.current.transitionShipmentStatus("shipment-1", status);
      }
    });

    expect(result.current.shipments[0].status).toBe("delivered");
  });

  it("still rejects a jump that skips a stage", async () => {
    localStorage.setItem("arslan-transport-shipments", JSON.stringify([seedShipment("pending")]));
    const { result } = renderHook(() => useShipments());

    await expect(result.current.transitionShipmentStatus("shipment-1", "delivered")).rejects.toThrow(/Invalid shipment transition/);
  });

  it("keeps an edit saved a moment earlier when the status changes right after", async () => {
    localStorage.setItem("arslan-transport-shipments", JSON.stringify([seedShipment("pending")]));
    const { result } = renderHook(() => useShipments());

    await act(async () => {
      await result.current.updateShipment("shipment-1", { remarks: "Edited" });
      await result.current.transitionShipmentStatus("shipment-1", "in_transit");
    });

    expect(result.current.shipments[0].status).toBe("in_transit");
    expect(result.current.shipments[0].remarks).toBe("Edited");
  });
});
