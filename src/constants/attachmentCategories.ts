import type { ExpenseCategory, ShipmentAttachmentCategory } from "../types/domain";

export const SHIPMENT_ATTACHMENT_CATEGORIES: ShipmentAttachmentCategory[] = [
  "bill",
  "receipt",
  "gate_pass",
  "fashah",
  "naql",
  "loading_slip",
  "unloading_slip",
  "proof_of_delivery",
  "invoice_support",
  "driver_document",
  "client_document",
  "other",
];

export const SHIPMENT_ATTACHMENT_CATEGORY_LABELS: Record<ShipmentAttachmentCategory, string> = {
  bill: "Bill",
  receipt: "Receipt",
  gate_pass: "Gate Pass",
  fashah: "Fashah",
  naql: "NAQL",
  loading_slip: "Loading Slip",
  unloading_slip: "Unloading Slip",
  proof_of_delivery: "Proof of Delivery",
  invoice_support: "Invoice Support",
  driver_document: "Driver Document",
  client_document: "Client Document",
  other: "Other",
};

export function getShipmentAttachmentCategoryLabel(category: ShipmentAttachmentCategory) {
  return SHIPMENT_ATTACHMENT_CATEGORY_LABELS[category] ?? "Other";
}

export function getAttachmentCategoryForExpense(category: ExpenseCategory | string): ShipmentAttachmentCategory {
  if (category === "gate_pass") return "gate_pass";
  if (category === "fashah") return "fashah";
  if (category === "naql") return "naql";
  if (category === "loading_unloading") return "loading_slip";
  if (category === "other") return "other";
  return "receipt";
}
