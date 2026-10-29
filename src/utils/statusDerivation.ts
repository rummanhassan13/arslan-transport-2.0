import type { DriverPayment, Invoice, InvoiceStatus, PaymentStatus, Shipment } from "../types/domain";
import { deriveBalanceStatus, signedDriverPaymentAmount, sumMoney } from "../domain/financials";

/** Invoice statuses a user can set by hand; "Draft" is the stored status behind "Pending". */
export const SETTABLE_INVOICE_STATUSES: InvoiceStatus[] = ["Draft", "Sent"];

/** UI label for an invoice status: the stored "Draft" is shown as "Pending"; anything else (e.g. Cancelled) is shown as is. */
export function invoiceStatusLabel(status: InvoiceStatus): string {
  return status === "Draft" ? "Pending" : status;
}

/**
 * Derive the display-facing invoice status from the live invoice record.
 * Falls back to the shipment's own field when no invoice record exists.
 */
export function deriveDisplayInvoiceStatus(shipment: Shipment, invoice?: Invoice): InvoiceStatus {
  if (!invoice) return "Draft";
  if (invoice.status === "sent") return "Sent";
  if (invoice.status === "cancelled") return "Cancelled";
  return "Draft";
}

/**
 * Derive client payment status by comparing paid amount against receivable.
 */
export function deriveClientPaymentStatus(
  receivable: number,
  paid: number,
  invoice?: Invoice,
): PaymentStatus {
  const overdue = Boolean(invoice?.dueDate && new Date(`${invoice.dueDate}T00:00:00`).getTime() < Date.now());
  return deriveBalanceStatus(receivable, paid, { overdue });
}

/**
 * Derive driver payment status from actual payment records.
 */
export function deriveDriverPaymentStatus(
  payable: number,
  payments: DriverPayment[],
): PaymentStatus {
  const paid = sumMoney(payments.map(signedDriverPaymentAmount));
  return deriveBalanceStatus(payable, paid, {
    hasAdvance: payments.some((payment) => payment.paymentType === "advance" && signedDriverPaymentAmount(payment) > 0),
  });
}
