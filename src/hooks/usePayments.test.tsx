// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../types/domain";
import { usePayments } from "./usePayments";

vi.mock("../config/env", () => ({ env: { demoMode: true } }));
vi.mock("./useAuth", () => ({ useAuth: () => ({ activeOrganization: null }) }));
vi.mock("./useGlobalRefresh", () => ({
  useGlobalRefresh: () => undefined,
  notifyGlobalRefresh: () => undefined,
}));

function dualDriverShipment(): Shipment {
  return {
    id: "shipment-dual",
    sr: 1,
    date: "2026-07-11",
    invoice: "SHP-DUAL",
    status: "pending",
    loadingPoint: "Karachi",
    destination: "Lahore",
    customer: "Client",
    driverId: "driver-1",
    driverName: "Driver One",
    vehicleNo: "TRK-1",
    truckType: "Container",
    cellNo: "",
    companyRate: 1200,
    driverRate: 1000,
    advance: 0,
    gatePass: 0,
    fashah: 0,
    naql: 0,
    companyTotal: 1200,
    driverTotal: 1000,
    pending: 1000,
    netProfit: 200,
    driverPaymentStatus: "Pending",
    invoiceStatus: "Draft",
    clientPaymentStatus: "Pending",
    remarks: "",
    billImages: [],
    assignments: [
      {
        id: "assignment-1",
        driverId: "driver-1",
        driverName: "Driver One",
        legOrder: 1,
        fromLocation: "Karachi",
        toLocation: "Multan",
        driverRate: 600,
        pending: 600,
        notes: "",
      },
      {
        id: "assignment-2",
        driverId: "driver-2",
        driverName: "Driver Two",
        legOrder: 2,
        fromLocation: "Multan",
        toLocation: "Lahore",
        driverRate: 400,
        pending: 400,
        notes: "",
      },
    ],
  };
}

describe("usePayments assignment-aware lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists a second-driver payment against its assignment and removes it consistently", async () => {
    const shipment = dualDriverShipment();
    const { result } = renderHook(() => usePayments([], [shipment]));

    await act(async () => {
      await result.current.createDriverPayment({
        driverId: "driver-2",
        shipmentId: shipment.id,
        shipmentAssignmentId: "assignment-2",
        amount: 125,
        paymentType: "settlement",
        paymentDate: "2026-07-11",
      });
    });

    expect(result.current.driverPayments).toHaveLength(1);
    expect(result.current.driverPayments[0]).toMatchObject({
      driverId: "driver-2",
      driverName: "Driver Two",
      shipmentAssignmentId: "assignment-2",
      amount: 125,
    });

    const paymentId = result.current.driverPayments[0].id;
    await act(async () => {
      await result.current.deleteDriverPayment(paymentId);
    });

    expect(result.current.driverPayments).toHaveLength(0);
  });
});
