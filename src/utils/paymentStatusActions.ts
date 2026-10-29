import type { PaymentStatus, Shipment } from "../types/domain";
import { roundMoney, sumMoney } from "../domain/financials";

export const DRIVER_PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ["Pending", "Paid", "Advance Paid"];
export const COMPANY_PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ["Pending", "Paid"];

export const PAYMENT_STATUS_LOCKED_HINT =
  "Payments are managed in the payments list. Delete a payment there to move this status back.";

/**
 * Payment statuses are derived from recorded payments, so the dropdowns only move forward by recording a payment:
 * Pending -> Paid / Advance Paid (driver) and Pending or partly paid -> Paid. Anything else (going back, or leaving
 * Paid) would mean deleting payments, which is done from the payments list instead.
 */
export function canMovePaymentStatus(kind: "driver" | "company", current: PaymentStatus, target: PaymentStatus): boolean {
  if (target === current) return true;
  if (current === "Paid" || current === "Credit Balance") return false;
  if (target === "Paid") return true;
  if (kind === "driver" && target === "Advance Paid") return current === "Pending";
  return false;
}

export type DriverSettlementPlanItem = {
  driverId: string;
  shipmentAssignmentId: string | null;
  amount: number;
};

/** One settlement payment per driver assignment that is still owed money (or one for a legacy single driver). */
export function planDriverSettlement(shipment: Shipment): { items: DriverSettlementPlanItem[]; total: number } {
  const assignments = shipment.assignments ?? [];
  const items: DriverSettlementPlanItem[] = assignments.length
    ? assignments
        .filter((assignment) => assignment.driverId && (assignment.pending ?? 0) > 0)
        .map((assignment) => ({
          driverId: assignment.driverId as string,
          shipmentAssignmentId: assignment.id ?? null,
          amount: roundMoney(assignment.pending ?? 0),
        }))
    : shipment.driverId && shipment.pending > 0
      ? [{ driverId: shipment.driverId, shipmentAssignmentId: null, amount: roundMoney(shipment.pending) }]
      : [];
  return { items, total: sumMoney(items.map((item) => item.amount)) };
}

/**
 * Shipment statuses to step through when the company has paid in full. The server only allows
 * pending -> in_transit -> delivered -> completed (+ cancel), so a pending shipment goes via in_transit.
 * Delivered, completed and cancelled shipments are left as they are.
 */
export function planDeliveryTransitions(status: Shipment["status"] | undefined): NonNullable<Shipment["status"]>[] {
  const current = status ?? "pending";
  if (current === "pending") return ["in_transit", "delivered"];
  if (current === "in_transit") return ["delivered"];
  return [];
}
/** A pending shipment with a driver assigned goes in transit; cancelled, delivered and completed shipments are never touched. */
export function planInTransitTransition(status: Shipment["status"] | undefined, hasDriver: boolean): "in_transit" | null {
  return (status ?? "pending") === "pending" && hasDriver ? "in_transit" : null;
}