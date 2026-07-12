import { useMemo, useState, type FormEvent } from "react";
import { Eye, Pencil, Search, Trash2 } from "lucide-react";
import { env } from "../config/env";
import { useAuth } from "../hooks/useAuth";
import { useDrivers } from "../hooks/useDrivers";
import type { Driver, DriverInput, Shipment, DriverPayment } from "../types/domain";
import { money } from "../utils/formatters";
import { EmptyState, Modal, PageTitle, StatusBadge } from "../components/ui";
import { canManageDrivers } from "../utils/permissions";
import { ShipmentAttachmentReadOnlyList } from "../components/shipments/ShipmentAttachmentReadOnlyList";
import { signedDriverPaymentAmount, sumMoney } from "../domain/financials";

export function DriversPage({ shipments, driverPayments = [], embedded = false }: { shipments: Shipment[]; driverPayments?: DriverPayment[]; embedded?: boolean }) {
  const { role } = useAuth();
  const { drivers, loading, error, createDriver, updateDriver, deleteDriver } = useDrivers(shipments);
  const [dialogDriver, setDialogDriver] = useState<Driver | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentDriver, setDocumentDriver] = useState<(Driver & { rows: Shipment[] }) | null>(null);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const canManage = env.demoMode || canManageDrivers(role);

  const driverRows = useMemo(() => {
    return drivers.map((driver) => {
      const rows = shipments.filter((shipment) =>
        shipment.assignments?.some((assignment) => assignment.driverId === driver.id) ||
        (!shipment.assignments?.length && shipment.driverId === driver.id),
      );
      const totalEarnings = sumMoney(rows.map((shipment) => {
        const assignments = shipment.assignments?.filter((assignment) => assignment.driverId === driver.id) ?? [];
        return assignments.length
          ? sumMoney(assignments.map((assignment) => (assignment.pending ?? assignment.driverRate) + (assignment.totalPaid ?? 0)))
          : shipment.driverTotal;
      }));
      const driverPaid = sumMoney(driverPayments.filter((payment) => payment.driverId === driver.id).map(signedDriverPaymentAmount));
      const pending = sumMoney(rows.map((shipment) => {
        const assignments = shipment.assignments?.filter((assignment) => assignment.driverId === driver.id) ?? [];
        return assignments.length ? sumMoney(assignments.map((assignment) => assignment.pending ?? assignment.driverRate)) : shipment.pending;
      }));
      
      return {
        ...driver,
        rows,
        cell: driver.phone ?? rows[0]?.cellNo ?? "",
        vehicle: rows[0]?.vehicleNo ?? "-",
        truck: rows[0]?.truckType ?? "-",
        total: totalEarnings,
        advance: sumMoney(driverPayments.filter((payment) => payment.driverId === driver.id && payment.paymentType === "advance").map(signedDriverPaymentAmount)),
        pending: pending,
      };
    });
  }, [drivers, shipments, driverPayments]);
  const visibleDrivers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return driverRows;
    return driverRows.filter((driver) =>
      [driver.name, driver.cell, driver.vehicle, driver.truck, driver.cnic, driver.licenseNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [driverRows, search]);

  const openCreateDialog = () => {
    setActionError("");
    setDialogDriver(null);
    setDialogOpen(true);
  };

  const openEditDialog = (driver: Driver) => {
    setActionError("");
    setDialogDriver(driver);
    setDialogOpen(true);
  };

  const saveDriver = async (input: DriverInput) => {
    setActionError("");
    try {
      if (dialogDriver) {
        await updateDriver(dialogDriver.id, input);
      } else {
        await createDriver(input);
      }
      setDialogOpen(false);
    } catch (driverError) {
      setActionError(driverError instanceof Error ? driverError.message : "Unable to save driver.");
    }
  };

  const removeDriver = async (driver: Driver) => {
    setActionError("");
    try {
      await deleteDriver(driver.id);
    } catch (driverError) {
      setActionError(driverError instanceof Error ? driverError.message : "Unable to delete driver.");
    }
  };

  return (
    <>
      {!embedded && (
        <PageTitle
          title="Drivers"
          subtitle="Driver settlements, vehicle assignment, advances, and balances."
        />
      )}
      <section className="filter-card">
        <div className="filter-toolbar" style={{ justifyContent: "flex-end" }}>
          {canManage && (
            <button className="btn-primary" onClick={openCreateDialog}>
              Add Driver
            </button>
          )}
        </div>
        <div className="filter-grid filter-grid-primary">
          <label className="field">
            <span>Search drivers</span>
            <div className="field-with-icon">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Driver, phone, vehicle, truck..."
              />
            </div>
          </label>
        </div>
      </section>
      {loading && <EmptyState text="Loading drivers..." />}
      {(error || actionError) && <EmptyState text={error || actionError} />}
      <div className="table-card">
        <div className="table-title">
          <div>
            <h3>Driver records</h3>
            <p>Driver contacts, assigned equipment, trips, and settlement balances.</p>
          </div>
          <span className="status num">{visibleDrivers.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Cell No</th>
                <th>Vehicle</th>
                <th>Truck</th>
                <th className="num text-right">Trips</th>
                <th className="num text-right">Driver Total</th>
                <th className="num text-right">Advance</th>
                <th className="num text-right">Pending</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleDrivers.map((driver) => (
                <tr key={driver.id}>
                  <td>
                    <span className="av-name">
                      <span className="av">{initials(driver.name)}</span>
                      <div className="flex flex-col">
                        <span className="customer-cell leading-tight">{driver.name}</span>
                        {driver.providerName && (
                          <span className="text-[11px] text-ink-3 font-medium mt-0.5">{driver.providerName}</span>
                        )}
                      </div>
                    </span>
                  </td>
                  <td className="num">{driver.cell || "-"}</td>
                  <td className="num">{driver.vehicle}</td>
                  <td>{driver.truck}</td>
                  <td className="num">{driver.rows.length}</td>
                  <td className="num">{money(driver.total)}</td>
                  <td className="num">{money(driver.advance)}</td>
                  <td className="num">{money(driver.pending)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={driver.status} />
                      <StatusBadge status={driver.pending ? "Pending" : "Paid"} />
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button className="icon-btn" aria-label="Open driver documents" onClick={() => setDocumentDriver(driver)}>
                        <Eye size={14} />
                      </button>
                      {canManage && (
                        <>
                          <button className="icon-btn" onClick={() => openEditDialog(driver)} aria-label="Edit driver">
                            <Pencil size={14} />
                          </button>
                          <button className="icon-btn" onClick={() => void removeDriver(driver)} aria-label="Delete driver">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleDrivers.length === 0 && <EmptyState text="No drivers match the current search." />}
        </div>
      </div>
      {dialogOpen && (
        <DriverDialog
          driver={dialogDriver}
          error={actionError}
          onClose={() => setDialogOpen(false)}
          onSave={saveDriver}
        />
      )}
      {documentDriver && (
        <Modal title={`${documentDriver.name} - Recent Shipment Documents`} onClose={() => setDocumentDriver(null)} size="wide">
          <ShipmentAttachmentReadOnlyList
            shipmentIds={documentDriver.rows.map((shipment) => shipment.id)}
            shipments={documentDriver.rows}
            limit={10}
            title="Recent Shipment Documents"
            emptyState="No shipment documents found for this driver yet."
          />
        </Modal>
      )}
    </>
  );
}

function DriverDialog({
  driver,
  error,
  onClose,
  onSave,
}: {
  driver: Driver | null;
  error: string;
  onClose: () => void;
  onSave: (input: DriverInput) => Promise<void>;
}) {
  const [form, setForm] = useState<DriverInput>({
    name: driver?.name ?? "",
    phone: driver?.phone ?? "",
    cnic: driver?.cnic ?? "",
    licenseNumber: driver?.licenseNumber ?? "",
    providerName: driver?.providerName ?? "",
    notes: driver?.notes ?? "",
    status: driver?.status ?? "active",
  });
  const [saving, setSaving] = useState(false);

  const update = (key: keyof DriverInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        phone: form.phone?.trim() || null,
        cnic: form.cnic?.trim() || null,
        licenseNumber: form.licenseNumber?.trim() || null,
        providerName: form.providerName?.trim() || null,
        notes: form.notes?.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={driver ? "Edit Driver" : "Add Driver"}
      onClose={onClose}
      size="large"
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="driver-form" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Driver"}
          </button>
        </>
      }
    >
      <form id="driver-form" className="form-layout" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Driver Details</h3>
            <p>Maintain the driver profile used for trip assignment and settlement records.</p>
          </div>
          <div className="form-grid">
        <label className="field">
          <span>Driver Name</span>
          <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
        </label>
        <label className="field">
          <span>Cell No</span>
          <input value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} />
        </label>
        <label className="field">
          <span>CNIC</span>
          <input value={form.cnic ?? ""} onChange={(event) => update("cnic", event.target.value)} />
        </label>
        <label className="field">
          <span>License Number</span>
          <input value={form.licenseNumber ?? ""} onChange={(event) => update("licenseNumber", event.target.value)} />
        </label>
        <label className="field">
          <span>Driver Provider / Company</span>
          <input value={form.providerName ?? ""} onChange={(event) => update("providerName", event.target.value)} placeholder="e.g. Self, Logistics Co, Vendor Name" />
        </label>
        <label className="field form-wide">
          <span>Notes</span>
          <textarea value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
          </div>
        </section>
      </form>
    </Modal>
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
