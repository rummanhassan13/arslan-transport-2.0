import { useMemo, useState } from "react";
import type {
  ClientPayment,
  DriverPayment,
  ExpenseFilters,
  Invoice,
  InvoiceItem,
  Shipment,
  ShipmentExpense,
  ShipmentExpenseInput,
} from "../types/domain";
import { Card, EmptyState, KpiGrid, PageTitle, PeriodSelector } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { env } from "../config/env";
import { canViewFinance } from "../utils/permissions";
import { buildStats, getApprovedExpensesTotal, profitBy } from "../utils/calculations";
import { labelize, money } from "../utils/formatters";
import { ExpensesPage } from "./ExpensesPage";
import { InvoicesPage } from "./InvoicesPage";
import { PaymentsPage } from "./PaymentsPage";
import { ProfitPage } from "./ProfitPage";
import {
  calculateInvoiceBalance,
  signedClientPaymentAmount,
  sumMoney,
} from "../domain/financials";

type FinanceTab = "Overview" | "Payments" | "Invoices" | "Expenses & Bills" | "Profit";

export function FinancePage({
  shipments,
  stats,
  openPayment,
  previewInvoice,
  generateInvoice,
  markInvoiceSent,
  invoices,
  invoiceItems,
  invoiceItemsByInvoice,
  invoicesLoading,
  invoicesError,
  clientPayments,
  driverPayments,
  paymentsLoading,
  paymentsError,
  expenses,
  expensesLoading,
  expensesError,
  expenseFilters,
  setExpenseFilters,
  createExpense,
  updateExpense,
  deleteExpense,
  deleteInvoice,
  deleteClientPayment,
  deleteDriverPayment,
}: {
  shipments: Shipment[];
  stats: ReturnType<typeof buildStats>;
  openPayment: () => void;
  previewInvoice: (shipment: Shipment, invoice?: Invoice) => void;
  generateInvoice: (shipment: Shipment) => Promise<void> | void;
  markInvoiceSent: (id: string) => Promise<void> | void;
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  invoiceItemsByInvoice: Map<string, InvoiceItem[]>;
  invoicesLoading: boolean;
  invoicesError: string | null;
  clientPayments: ClientPayment[];
  driverPayments: DriverPayment[];
  paymentsLoading: boolean;
  paymentsError: string | null;
  expenses: ShipmentExpense[];
  expensesLoading: boolean;
  expensesError: string | null;
  expenseFilters: ExpenseFilters;
  setExpenseFilters: (filters: ExpenseFilters) => void;
  createExpense: (input: ShipmentExpenseInput) => Promise<ShipmentExpense>;
  updateExpense: (expenseId: string, input: Partial<ShipmentExpenseInput>) => Promise<ShipmentExpense | null>;
  deleteExpense: (expenseId: string) => Promise<void>;
  deleteInvoice: (invoiceId: string) => Promise<void>;
  deleteClientPayment: (paymentId: string) => Promise<void>;
  deleteDriverPayment: (paymentId: string) => Promise<void>;
}) {
  const { role } = useAuth();
  const [tab, setTab] = useState<FinanceTab>("Invoices");

  if (!env.demoMode && !canViewFinance(role)) {
    return (
      <>
        <PageTitle title="Finance" subtitle="Access restricted." />
        <EmptyState text="Your role does not have permission to view financial data. Contact your organization admin for access." />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Finance"
        subtitle="Track receivables, driver payouts, invoices, expenses, and profit."
        trailing={
          <PeriodSelector
            value={tab}
            options={["Overview", "Payments", "Invoices", "Expenses & Bills", "Profit"]}
            onChange={setTab}
          />
        }
      />
      {tab === "Overview" && (
        <FinanceOverview
          shipments={shipments}
          stats={stats}
          expenses={expenses}
          invoices={invoices}
          clientPayments={clientPayments}
          driverPayments={driverPayments}
        />
      )}
      {tab === "Payments" && (
        <PaymentsPage
          shipments={shipments}
          invoices={invoices}
          clientPayments={clientPayments}
          driverPayments={driverPayments}
          loading={paymentsLoading}
          error={paymentsError}
          openPayment={openPayment}
          deleteClientPayment={deleteClientPayment}
          deleteDriverPayment={deleteDriverPayment}
          embedded
        />
      )}
      {tab === "Invoices" && (
        <InvoicesPage
          shipments={shipments}
          invoices={invoices}
          invoiceItems={invoiceItems}
          invoiceItemsByInvoice={invoiceItemsByInvoice}
          clientPayments={clientPayments}
          loading={invoicesLoading}
          error={invoicesError}
          preview={previewInvoice}
          generateInvoice={generateInvoice}
          markSent={markInvoiceSent}
          deleteInvoice={deleteInvoice}
          embedded
        />
      )}
      {tab === "Expenses & Bills" && (
        <ExpensesPage
          shipments={shipments}
          expenses={expenses}
          loading={expensesLoading}
          error={expensesError}
          filters={expenseFilters}
          setFilters={setExpenseFilters}
            createExpense={createExpense}
            updateExpense={updateExpense}
            deleteExpense={deleteExpense}
            embedded
          />
      )}
      {tab === "Profit" && <ProfitPage shipments={shipments} stats={stats} embedded />}
    </>
  );
}

function FinanceOverview({
  shipments,
  stats,
  expenses,
  invoices,
  clientPayments,
  driverPayments,
}: {
  shipments: Shipment[];
  stats: ReturnType<typeof buildStats>;
  expenses: ShipmentExpense[];
  invoices: Invoice[];
  clientPayments: ClientPayment[];
  driverPayments: DriverPayment[];
}) {
  const clientPaid = sumMoney(clientPayments.map(signedClientPaymentAmount));
  const activeInvoices = invoices.filter((invoice) => invoice.status !== "cancelled");
  const invoiceBalances = activeInvoices.map((invoice) => calculateInvoiceBalance(invoice, clientPayments));
  const invoiceTotal = sumMoney(activeInvoices.map((invoice) => invoice.totalAmount));
  const pendingInvoices = invoiceBalances.filter((balance) => balance.balance > 0).length;
  const expenseTotal = getApprovedExpensesTotal(expenses) || stats.expenses;
  const paymentBuckets = [
    { label: "Paid", count: invoiceBalances.filter((balance) => balance.status === "Paid").length, fill: "pos" },
    { label: "Pending", count: invoiceBalances.filter((balance) => ["Pending", "Partially Paid"].includes(balance.status)).length, fill: "warn" },
    { label: "Overdue", count: invoiceBalances.filter((balance) => balance.overdue).length, fill: "danger" },
  ];
  const customerProfit = profitBy(shipments, "customer").sort((a, b) => b.profit - a.profit).slice(0, 5);
  const receivables = invoiceTotal || stats.revenue;
  const outstanding = sumMoney(invoiceBalances.map((balance) => balance.balance));
  const driverPayables = sumMoney(shipments.map((shipment) => shipment.pending));

  return (
    <>
      <KpiGrid
        items={[
          ["Total Receivables", money(receivables), `${money(outstanding)} still open`],
          ["Driver Payables", money(stats.driverCost), `${money(driverPayables)} due`],
          ["Expenses", money(expenseTotal), "Approved actual cost summary"],
          ["Estimated Profit", money(stats.netProfit), `${stats.margin}% margin`],
        ]}
      />
      <div className="charts-row">
        <Card title="Payment Snapshot">
          <div className="pipeline">
            {paymentBuckets.map((bucket) => (
              <PipelineRow
                key={bucket.label}
                label={bucket.label}
                count={bucket.count}
                total={shipments.length}
                fill={bucket.fill}
              />
            ))}
            <div className="pipe-row">
              <span className="label">Pending invoices</span>
              <span className="count num">{pendingInvoices}</span>
            </div>
          </div>
        </Card>
        <Card title="Profit Snapshot">
          <div className="pipeline">
            {customerProfit.length ? (
              customerProfit.map((item) => (
                <PipelineRow
                  key={item.name}
                  label={labelize(item.name)}
                  count={item.profit}
                  total={Math.max(...customerProfit.map((row) => row.profit), 1)}
                  fill="pos"
                  value={money(item.profit)}
                />
              ))
            ) : (
              <p className="empty-state">No profit data yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function PipelineRow({
  label,
  count,
  total,
  fill,
  value,
}: {
  label: string;
  count: number;
  total: number;
  fill?: string;
  value?: string;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="pipe-row">
        <span className="label">{label}</span>
        <span className="count num">
          {value ?? count}
          <span className="pct">{pct}%</span>
        </span>
      </div>
      <div className="pipe-bar">
        <div className={`fill ${fill ?? ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
