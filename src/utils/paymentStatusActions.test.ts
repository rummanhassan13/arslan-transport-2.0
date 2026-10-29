import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/domain";
import { canMovePaymentStatus, planDeliveryTransitions, planDriverSettlement, planInTransitTransition } from "./paymentStatusActions";

const shipment = (overrides: Partial<Shipment>) => ({ pending: 0, ...overrides }) as Shipment;
const assignment = (id: string, driverId: string, pending: number) =>
  ({ id, driverId, driverName: id, legOrder: 1, fromLocation: "", toLocation: "", driverRate: 0, notes: "", pending }) as NonNullable<Shipment["assignments"]>[number];

describe("canMovePaymentStatus", () => {
  it("only moves forward by recording a payment", () => {
    expect(canMovePaymentStatus("company", "Pending", "Paid")).toBe(true);
    expect(canMovePaymentStatus("company", "Partially Paid", "Paid")).toBe(true);
    expect(canMovePaymentStatus("driver", "Pending", "Advance Paid")).toBe(true);
    expect(canMovePaymentStatus("driver", "Advance Paid", "Paid")).toBe(true);
  });

  it("never moves back or out of Paid, and company has no advance", () => {
    expect(canMovePaymentStatus("company", "Paid", "Pending")).toBe(false);
    expect(canMovePaymentStatus("driver", "Paid", "Advance Paid")).toBe(false);
    expect(canMovePaymentStatus("driver", "Advance Paid", "Pending")).toBe(false);
    expect(canMovePaymentStatus("driver", "Advance Paid", "Advance Paid")).toBe(true);
    expect(canMovePaymentStatus("company", "Pending", "Advance Paid")).toBe(false);
  });
});

describe("planDriverSettlement", () => {
  it("pays each assignment's outstanding balance and skips settled or driverless ones", () => {
    const plan = planDriverSettlement(shipment({
      assignments: [assignment("a1", "d1", 120.5), assignment("a2", "d2", 0), assignment("a3", "d3", 79.5)],
    }));
    expect(plan.items).toEqual([
      { driverId: "d1", shipmentAssignmentId: "a1", amount: 120.5 },
      { driverId: "d3", shipmentAssignmentId: "a3", amount: 79.5 },
    ]);
    expect(plan.total).toBe(200);
  });

  it("falls back to the shipment's driver when there are no assignments", () => {
    expect(planDriverSettlement(shipment({ driverId: "d1", pending: 300 }))).toEqual({
      items: [{ driverId: "d1", shipmentAssignmentId: null, amount: 300 }],
      total: 300,
    });
    expect(planDriverSettlement(shipment({ driverId: "d1", pending: 0 })).items).toEqual([]);
  });
});

describe("planDeliveryTransitions", () => {
  it("steps a pending shipment through in transit to delivered", () => {
    expect(planDeliveryTransitions("pending")).toEqual(["in_transit", "delivered"]);
    expect(planDeliveryTransitions(undefined)).toEqual(["in_transit", "delivered"]);
  });

  it("delivers an in-transit shipment in one step", () => {
    expect(planDeliveryTransitions("in_transit")).toEqual(["delivered"]);
  });

  it("leaves delivered, completed and cancelled shipments alone", () => {
    expect(planDeliveryTransitions("delivered")).toEqual([]);
    expect(planDeliveryTransitions("completed")).toEqual([]);
    expect(planDeliveryTransitions("cancelled")).toEqual([]);
  });
});
describe("planInTransitTransition", () => {
  it("moves a pending shipment with a driver to in transit", () => {
    expect(planInTransitTransition("pending", true)).toBe("in_transit");
    expect(planInTransitTransition(undefined, true)).toBe("in_transit");
  });

  it("does nothing without a driver", () => {
    expect(planInTransitTransition("pending", false)).toBeNull();
  });

  it("never touches shipments that have moved on or been cancelled", () => {
    for (const status of ["in_transit", "delivered", "completed", "cancelled"] as const) {
      expect(planInTransitTransition(status, true)).toBeNull();
    }
  });
});