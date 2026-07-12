import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Plus, MoveRight } from "lucide-react";
import type { Shipment, View } from "../types/domain";
import { buildStats, isDateInRange, monthlyData } from "../utils/calculations";
import { money } from "../utils/formatters";
import { Card, PageTitle, SkeletonCard, StatusBadge, SummaryCard } from "../components/ui";

export function DashboardPage({
  shipments,
  openShipment,
  setView,
}: {
  shipments: Shipment[];
  openShipment: () => void;
  setView: (view: View) => void;
}) {
  const [datePreset, setDatePreset] = useState<"this_month" | "last_month" | "custom">("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const periodRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return { start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`, end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` };
    }
    if (datePreset === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return { start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`, end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` };
    }
    return { start: customFrom, end: customTo };
  }, [datePreset, customFrom, customTo]);

  const periodShipments = useMemo(
    () => shipments.filter((shipment) => {
      const d = shipment.shipmentDate ?? shipment.date;
      if (periodRange.start && d < periodRange.start) return false;
      if (periodRange.end && d > periodRange.end) return false;
      return true;
    }),
    [periodRange, shipments],
  );
  const periodStats = useMemo(() => buildStats(periodShipments), [periodShipments]);
  const monthly = useMemo(() => monthlyData(periodShipments), [periodShipments]);
  const revSeries = monthly.map((m) => m.revenue);
  const profitSeries = monthly.map((m) => m.netProfit);
  const pendingDispatch = periodShipments.filter((shipment) => (shipment.status ?? "pending") === "pending").length;

  return (
    <>
      <PageTitle
        title="Operations overview"
        subtitle={`${periodShipments.length} shipments in period · ${shipments.length} total tracked`}
        trailing={
          <div className="table-filters !p-0 !border-none !bg-transparent">
            <div className="preset-group">
              <button className={`date-preset-btn ${datePreset === "this_month" ? "active" : ""}`} onClick={() => setDatePreset("this_month")}>This Month</button>
              <button className={`date-preset-btn ${datePreset === "last_month" ? "active" : ""}`} onClick={() => setDatePreset("last_month")}>Last Month</button>
              <button className={`date-preset-btn ${datePreset === "custom" ? "active" : ""}`} onClick={() => setDatePreset("custom")}>Custom</button>
            </div>
            
            {datePreset === "custom" && (
              <div className="custom-date-range">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <span>-</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            )}
          </div>
        }
      />

      <div className="kpi-grid">
        <HeroKpi
          label="Revenue"
          value={money(periodStats.revenue)}
          delta={`${periodShipments.length} shipments`}
          deltaDir="up"
          meta={datePreset === "this_month" ? "this month" : datePreset === "last_month" ? "last month" : "selected period"}
          spark={revSeries.length ? revSeries : [0]}
        />
        <HeroKpi
          label="Net Profit"
          value={money(periodStats.netProfit)}
          delta={`${periodStats.margin}%`}
          deltaDir={periodStats.netProfit >= 0 ? "up" : "down"}
          meta="margin this period"
          spark={profitSeries.length ? profitSeries : [0]}
        />
        <SummaryCard
          title="Active Shipments"
          value={periodStats.active.toString()}
          note={`${pendingDispatch} pending dispatch`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
        <Card title="Operational pipeline">
          <Pipeline shipments={periodShipments} />
        </Card>
        <Card title="Quick actions">
          <div className="flex flex-col gap-3">
            {(
              [
                ["New shipment", "Shipments", openShipment],
                ["Open directory", "Directory", () => setView("Directory")],
                ["Finance workspace", "Finance", () => setView("Finance")],
                ["Generate invoice", "Finance", () => setView("Finance")],
              ] as [string, string, () => void][]
            ).map(([label, hint, action]) => (
              <button
                key={label}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-line bg-surface hover:bg-surface-soft transition-all text-left group"
                onClick={action}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center group-hover:scale-105 transition-transform flex-shrink-0">
                    <Plus size={18} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13.5px] font-semibold text-ink leading-tight">{label}</span>
                    <span className="text-[11.5px] text-ink-3 font-medium mt-0.5">{hint}</span>
                  </div>
                </div>
                <MoveRight size={15} className="text-ink-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

/* â”€â”€â”€ Hero KPI with sparkline + delta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function HeroKpi({
  label,
  value,
  delta,
  deltaDir,
  meta,
  spark,
}: {
  label: string;
  value: string;
  delta: string;
  deltaDir: "up" | "down";
  meta: string;
  spark: number[];
}) {
  return (
    <div className="summary-card summary-card-featured">
      <p>{label}</p>
      <strong className="num">{value}</strong>
      <Sparkline values={spark} />
      <div className="kpi-meta-row">
        <span className={`delta delta-${deltaDir}`}>
          {deltaDir === "up" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {delta}
        </span>
        <span className="kpi-meta-text">{meta}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, height = 32 }: { values: number[]; height?: number }) {
  if (!values.length) return null;
  const w = 200, h = height, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
  const path = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");
  const area = path + ` L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <svg className="kpi-hero-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


/* â”€â”€â”€ Pipeline (shipment status distribution) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function Pipeline({ shipments }: { shipments: Shipment[] }) {
  const buckets: { label: string; key: string; fill: string }[] = [
    { label: "Pending", key: "pending", fill: "warn" },
    { label: "In transit", key: "in_transit", fill: "" },
    { label: "Delivered", key: "delivered", fill: "pos" },
    { label: "Completed", key: "completed", fill: "pos" },
  ];
  const counts = buckets.map((b) => ({
    ...b,
    count: shipments.filter((shipment) => (shipment.status ?? "pending") === b.key).length,
  }));
  const total = counts.reduce((sum, c) => sum + c.count, 0) || 1;
  return (
    <div className="pipeline">
      {counts.map((c) => {
        const pct = Math.round((c.count / total) * 100);
        return (
          <div key={c.label}>
            <div className="pipe-row">
              <span className="label">{c.label}</span>
              <span className="count">
                {c.count}
                <span className="pct">{pct}%</span>
              </span>
            </div>
            <div className="pipe-bar">
              <div className={`fill ${c.fill}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
