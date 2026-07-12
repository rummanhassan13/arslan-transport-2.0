import { useMemo, useState } from "react";
import { CalendarDays, Eye, MoveRight, Pencil, Search, Trash2, Truck as TruckIcon, UserRound, X } from "lucide-react";
import type { Shipment, ShipmentFilters, DriverPayment, Client } from "../types/domain";
import { env } from "../config/env";
import { useAuth } from "../hooks/useAuth";
import { filterShipments, sum } from "../utils/calculations";
import { formatDate, money } from "../utils/formatters";
import { EmptyState, KpiGrid, PageTitle, SkeletonTable, StatusBadge } from "../components/ui";
import { canManageShipments } from "../utils/permissions";


export function ShipmentsPage({
  shipments,
  clients,
  query,
  setQuery,
  loading,
  error,
  openSummary,
  onEditShipment,
  deleteShipment,
  driverPayments,
}: {
  shipments: Shipment[];
  clients?: Client[];
  query: string;
  setQuery?: (query: string) => void;
  loading?: boolean;
  error?: string | null;
  openSummary: (shipment: Shipment) => void;
  onEditShipment: (shipment: Shipment) => void;
  deleteShipment?: (shipmentId: string) => Promise<void>;
  driverPayments?: DriverPayment[];
}) {
  const { role } = useAuth();
  const [datePreset, setDatePreset] = useState<"this_month" | "last_month" | "custom">("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [actionError, setActionError] = useState("");
  const canManage = env.demoMode || canManageShipments(role);

  const dateRange = useMemo(() => {
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

  const dateFiltered = useMemo(() => {
    return shipments.filter((s) => {
      if (dateRange.start && s.date < dateRange.start) return false;
      if (dateRange.end && s.date > dateRange.end) return false;
      return true;
    });
  }, [shipments, dateRange]);

  const filters: ShipmentFilters = {
    clientId: customerFilter,
    driver: "",
    destination: "",
    invoiceStatus: "",
    clientPaymentStatus: "",
    driverPaymentStatus: "",
  };

  const filtered = filterShipments(dateFiltered, query, filters);
  const profitAmount = sum(filtered, "netProfit");
  const overdueCount = filtered.filter(
    (row) => row.invoiceStatus === "Overdue" || row.clientPaymentStatus === "Overdue" || row.driverPaymentStatus === "Overdue",
  ).length;

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const parseInvoice = (inv: string) => {
        const match = inv.trim().match(/^(.*?)(-?\d+)$/);
        if (match) {
          return { prefix: match[1], num: parseInt(match[2], 10) };
        }
        return { prefix: inv, num: 0 };
      };

      const parsedA = parseInvoice(a.invoice || "");
      const parsedB = parseInvoice(b.invoice || "");

      if (parsedA.prefix !== parsedB.prefix) {
        return parsedB.prefix.localeCompare(parsedA.prefix);
      }
      return parsedB.num - parsedA.num;
    });
  }, [filtered]);
  const removeShipment = async (shipmentId: string) => {
    setActionError("");
    try {
      await deleteShipment?.(shipmentId);
    } catch (shipmentError) {
      setActionError(shipmentError instanceof Error ? shipmentError.message : "Unable to delete shipment.");
    }
  };

  return (
    <>
      <PageTitle title="Shipments" subtitle="Search, filter, and review every trip from one operations table." />
      <KpiGrid
        items={[
          ["Total shipments", filtered.length.toString(), `${shipments.length} records in this workspace`],
          ["Revenue", money(sum(filtered, "companyTotal")), "Company billing total"],
          ["Profit", money(profitAmount), "Revenue minus cost"],
        ]}
      />
      {loading && <SkeletonTable rows={6} />}
      {(error || actionError) && <EmptyState text={error || actionError} />}
      <ShipmentTable 
        shipments={sortedFiltered} 
        openSummary={openSummary}
        onEditShipment={onEditShipment}
        canManage={canManage} 
        deleteShipment={removeShipment}
        query={query}
        setQuery={setQuery}
        customerFilter={customerFilter}
        setCustomerFilter={setCustomerFilter}
        clients={clients}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        driverPayments={driverPayments}
      />
    </>
  );
}

function ShipmentTable({
  shipments,
  openSummary,
  onEditShipment,
  canManage,
  deleteShipment,
  query,
  setQuery,
  customerFilter,
  setCustomerFilter,
  clients = [],
  datePreset,
  setDatePreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  driverPayments,
}: {
  shipments: Shipment[];
  openSummary: (shipment: Shipment) => void;
  onEditShipment: (shipment: Shipment) => void;
  canManage: boolean;
  deleteShipment: (shipmentId: string) => Promise<void>;
  query: string;
  setQuery?: (query: string) => void;
  customerFilter: string;
  setCustomerFilter: (status: string) => void;
  clients?: Client[];
  datePreset: "this_month" | "last_month" | "custom";
  setDatePreset: (preset: "this_month" | "last_month" | "custom") => void;
  customFrom: string;
  setCustomFrom: (date: string) => void;
  customTo: string;
  setCustomTo: (date: string) => void;
  driverPayments?: DriverPayment[];
}) {
  const activeCount = (query ? 1 : 0) + (customerFilter ? 1 : 0);

  const clearAll = () => {
    setQuery?.("");
    setCustomerFilter("");
  };

  const activeClients = clients.filter((c) => c.status === "active");

  const confirmDelete = (row: Shipment) => {
    if (window.confirm(`Are you sure you want to delete shipment ${row.invoice || ""} (Driver: ${row.driverName})?`)) {
      void deleteShipment(row.id);
    }
  };

  return (
    <div className="table-card">
      <div className="table-title table-title-filters">
        <div className="table-title-text">
          <h3>Shipment register</h3>
          <p>
            {shipments.length} rows &bull; Click any row to view summary, or use actions to view deep details or edit.
          </p>
        </div>
        
        <div className="table-filters">
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

          <div className="compact-search">
            <Search size={14} />
            <input 
              value={query} 
              onChange={(e) => setQuery?.(e.target.value)} 
              placeholder="Search..." 
              disabled={!setQuery}
            />
          </div>

          <select className="compact-select" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">All Customers</option>
            {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {activeCount > 0 && (
            <button className="icon-btn text-ink-3 hover:text-ink" onClick={clearAll} title="Clear search and filter">
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="shipment-mobile-list">
        {shipments.map((row) => (
          <article key={row.id} className="shipment-mobile-card" onClick={() => openSummary(row)}>
            <div className="shipment-mobile-card-header">
              <div className="shipment-mobile-card-reference">
                <strong>{row.invoice}</strong>
                <span><CalendarDays size={12} /> {formatDate(row.date)}</span>
              </div>
              <StatusBadge status={row.invoiceStatus} label={row.invoiceStatus} />
            </div>
            <div className="shipment-mobile-card-client">{row.customer}</div>
            <div className="shipment-mobile-card-route">
              <span>{row.loadingPoint}</span>
              <MoveRight size={14} />
              <span>{row.destination}</span>
            </div>
            <div className="shipment-mobile-card-meta">
              <span><UserRound size={13} /> {row.assignments && row.assignments.length > 1 ? `${row.driverName} + ${row.assignments.length - 1}` : row.driverName}</span>
              <span><TruckIcon size={13} /> {row.vehicleNo}</span>
              <StatusBadge status={row.clientPaymentStatus} label={`Client ${row.clientPaymentStatus}`} />
              <StatusBadge status={row.driverPaymentStatus} label={`Driver ${row.driverPaymentStatus}`} />
            </div>
            <div className="shipment-mobile-card-footer">
              <div className="shipment-mobile-card-total">
                <span>Company total</span>
                <strong className="num">{money(row.companyTotal)}</strong>
              </div>
              <div className="shipment-mobile-card-actions" onClick={(event) => event.stopPropagation()}>
                <button className="icon-btn" onClick={() => openSummary(row)} aria-label={`View ${row.invoice}`} type="button"><Eye size={15} /></button>
                {canManage && (
                  <>
                    <button className="icon-btn" onClick={() => onEditShipment(row)} aria-label={`Edit ${row.invoice}`} type="button"><Pencil size={15} /></button>
                    <button className="icon-btn text-red-500" onClick={() => confirmDelete(row)} aria-label={`Delete ${row.invoice}`} type="button"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
        {shipments.length === 0 && <EmptyState text="No shipments match the current filters." />}
      </div>

      <div className="table-scroll shipment-desktop-table">
        <table>
          <thead>
            <tr>
              <th>Shipment</th>
              <th>Client & Route</th>
              <th>Assignment</th>
              <th className="num text-right">Company Total</th>
              <th className="num text-right">Driver Payable</th>
              <th className="num text-right">Profit</th>
              <th>Financial Status</th>
              <th className="text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((row) => (
              <tr key={row.id} onClick={() => openSummary(row)} className="cursor-pointer">
                <td>
                  <div className="flex flex-col gap-1">
                    <span className="invoice-cell">{row.invoice}</span>
                    <span className="text-[10px] text-ink-3 num">{formatDate(row.date)}</span>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-semibold text-ink">{row.customer}</span>
                    <span className="route-cell">{row.loadingPoint} <MoveRight size={11} /> {row.destination}</span>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col gap-1.5">
                    <span className="av-name"><span className="av">{initials(row.driverName)}</span>{row.assignments && row.assignments.length > 1 ? `${row.driverName} + ${row.assignments.length - 1} more` : row.driverName}</span>
                    <span className="text-[10px] text-ink-3">{row.vehicleNo} · {row.truckType}</span>
                  </div>
                </td>
                <td className="num">{money(row.companyTotal)}</td>
                <td className="num">{money(row.driverTotal)}</td>
                <td className="num">{money(row.netProfit)}</td>
                <td>
                  <div className="flex flex-col items-start gap-1.5">
                    <StatusBadge status={row.invoiceStatus} label={`Invoice · ${row.invoiceStatus}`} />
                    <StatusBadge status={row.clientPaymentStatus} label={`Client · ${row.clientPaymentStatus}`} />
                    <StatusBadge status={row.driverPaymentStatus} label={`Driver · ${row.driverPaymentStatus}`} />
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      className="icon-btn text-ink-3 hover:text-ink"
                      onClick={(e) => { e.stopPropagation(); openSummary(row); }}
                      title="View Summary"
                      aria-label="View Summary"
                      type="button"
                    >
                      <Eye size={15} />
                    </button>
                    {canManage && (
                      <>
                        <button 
                          className="icon-btn text-ink-3 hover:text-ink"
                          onClick={() => onEditShipment(row)}
                          title="Edit Shipment"
                          aria-label="Edit Shipment"
                          type="button"
                        >
                          <Pencil size={15} />
                        </button>
                        <button 
                          className="icon-btn text-ink-3 hover:text-red-500"
                          onClick={() => confirmDelete(row)}
                          title="Delete Shipment"
                          aria-label="Delete Shipment"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shipments.length === 0 && <EmptyState text="No shipments match the current filters." />}
      </div>
    </div>
  );
}


function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
