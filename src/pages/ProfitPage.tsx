import type { Shipment } from "../types/domain";
import { buildStats, profitBy } from "../utils/calculations";
import { money } from "../utils/formatters";
import { Card, DataTable, KpiGrid, PageTitle } from "../components/ui";

export function ProfitPage({ shipments, stats, embedded = false }: { shipments: Shipment[]; stats: ReturnType<typeof buildStats>; embedded?: boolean }) {
  const best = [...shipments].sort((a, b) => b.netProfit - a.netProfit)[0];
  const byCustomer = profitBy(shipments, "customer").sort((a, b) => b.profit - a.profit).slice(0, 6);
  const byDestination = profitBy(shipments, "destination").sort((a, b) => b.profit - a.profit).slice(0, 6);
  return (
    <>
      {!embedded && <PageTitle title="Profit Dashboard" subtitle="Margin, route, customer, and shipment profitability." />}
      <KpiGrid
        items={[
          ["Total Profit", money(stats.netProfit), "Estimated after driver cost"],
          ["Margin", `${stats.margin}%`, "Revenue margin"],
          ["Top Customer", best?.customer ?? "-", best ? money(best.netProfit) : "No shipments"],
          ["Top Route", best ? `${best.loadingPoint} to ${best.destination}` : "-", best ? money(best.netProfit) : "No shipments"],
        ]}
      />
      <div className="charts-row">
        <Card title="By Customer">
          <ProfitPipeline rows={byCustomer} />
        </Card>
        <Card title="By Destination">
          <ProfitPipeline rows={byDestination} />
        </Card>
      </div>
      <DataTable
        title="Most Profitable Shipments"
        columns={["Invoice No", "Customer", "Loading Point", "Destination", "Company Total", "Driver Total", "Net Profit", "Profit Margin"]}
        rows={[...shipments].sort((a, b) => b.netProfit - a.netProfit).map((row) => [
          <span className="num invoice-cell">{row.invoice}</span>,
          row.customer,
          row.loadingPoint,
          row.destination,
          <span className="num">{money(row.companyTotal)}</span>,
          <span className="num">{money(row.driverTotal)}</span>,
          <span className="num profit-cell">{money(row.netProfit)}</span>,
          <span className="num">{row.companyTotal ? `${Math.round((row.netProfit / row.companyTotal) * 100)}%` : "0%"}</span>,
        ])}
      />
    </>
  );
}

function ProfitPipeline({ rows }: { rows: { name: string; profit: number }[] }) {
  const max = Math.max(...rows.map((row) => row.profit), 1);
  if (!rows.length) return <div className="empty-state">No profit data yet.</div>;

  return (
    <div className="pipeline">
      {rows.map((row) => {
        const pct = Math.max(2, Math.round((row.profit / max) * 100));
        return (
          <div key={row.name}>
            <div className="pipe-row">
              <span className="label">{row.name}</span>
              <span className="count num">{money(row.profit)}</span>
            </div>
            <div className="pipe-bar">
              <div className="fill pos" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
