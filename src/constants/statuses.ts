import type { InvoiceStatus, PaymentStatus } from "../types/domain";

export const PAYMENT_STATUSES: PaymentStatus[] = ["Paid", "Pending", "Partially Paid", "Overdue", "Advance Paid"];
export const INVOICE_STATUSES: InvoiceStatus[] = ["Draft", "Sent", "Paid", "Pending", "Overdue"];

export const CLIENT_PAYMENT_FILTER_STATUSES: PaymentStatus[] = ["Paid", "Pending", "Partially Paid", "Overdue"];
export const DRIVER_PAYMENT_FILTER_STATUSES: PaymentStatus[] = ["Paid", "Advance Paid", "Pending", "Partially Paid"];
