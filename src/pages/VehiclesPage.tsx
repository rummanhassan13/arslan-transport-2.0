import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { env } from "../config/env";
import { EmptyState, Modal, StatusBadge } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useDrivers } from "../hooks/useDrivers";
import { useTruckTypes } from "../hooks/useTruckTypes";
import { useVehicles } from "../hooks/useVehicles";
import type { Shipment, Vehicle, VehicleInput } from "../types/domain";
import { canManageVehicles } from "../utils/permissions";

export function VehiclesPage({ shipments }: { shipments: Shipment[] }) {
  const { role } = useAuth();
  const { drivers } = useDrivers(shipments);
  const { truckTypes } = useTruckTypes(shipments);
  const { vehicles, loading, error, createVehicle, updateVehicle, deleteVehicle } = useVehicles(shipments, truckTypes);
  const [dialogVehicle, setDialogVehicle] = useState<Vehicle | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const canManage = env.demoMode || canManageVehicles(role);

  const visibleVehicles = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return vehicles;
    return vehicles.filter((vehicle) =>
      [vehicle.vehicleNumber, vehicle.truckTypeName, vehicle.driverName, vehicle.notes, vehicle.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [search, vehicles]);

  const openCreateDialog = () => {
    setActionError("");
    setDialogVehicle(null);
    setDialogOpen(true);
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setActionError("");
    setDialogVehicle(vehicle);
    setDialogOpen(true);
  };

  const saveVehicle = async (input: VehicleInput) => {
    setActionError("");
    try {
      if (dialogVehicle) {
        await updateVehicle(dialogVehicle.id, input);
      } else {
        await createVehicle(input);
      }
      setDialogOpen(false);
    } catch (vehicleError) {
      setActionError(vehicleError instanceof Error ? vehicleError.message : "Unable to save vehicle.");
    }
  };

  const removeVehicle = async (vehicle: Vehicle) => {
    setActionError("");
    try {
      await deleteVehicle(vehicle.id);
    } catch (vehicleError) {
      setActionError(vehicleError instanceof Error ? vehicleError.message : "Unable to delete vehicle.");
    }
  };

  return (
    <>
      <section className="filter-card">
        <div className="filter-toolbar">
          <div>
            <h3>Vehicles</h3>
            <p>Fleet records linked to drivers, truck types, and shipments.</p>
          </div>
          {canManage && (
            <button className="btn-primary" onClick={openCreateDialog}>
              Add Vehicle
            </button>
          )}
        </div>
        <div className="filter-grid filter-grid-primary">
          <label className="field">
            <span>Search vehicles</span>
            <div className="field-with-icon">
              <Search size={14} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vehicle, driver, truck type..." />
            </div>
          </label>
        </div>
      </section>
      {(loading || error || actionError) && <EmptyState text={loading ? "Loading vehicles..." : error || actionError || ""} />}
      <div className="table-card">
        <div className="table-title">
          <div>
            <h3>Vehicle records</h3>
            <p>Readable fleet assignments without exposing raw IDs.</p>
          </div>
          <span className="status num">{visibleVehicles.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Vehicle No</th>
                <th>Truck Type</th>
                <th>Assigned Driver</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleVehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className="num">
                    <span className="invoice-cell">{vehicle.vehicleNumber}</span>
                  </td>
                  <td>{vehicle.truckTypeName || "-"}</td>
                  <td>{vehicle.driverName || "-"}</td>
                  <td><StatusBadge status={vehicle.status} /></td>
                  <td>{vehicle.notes || "-"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canManage ? (
                        <>
                          <button className="icon-btn" onClick={() => openEditDialog(vehicle)} aria-label="Edit vehicle">
                            <Pencil size={14} />
                          </button>
                          <button className="icon-btn" onClick={() => void removeVehicle(vehicle)} aria-label="Delete vehicle">
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <span className="status">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleVehicles.length === 0 && <EmptyState text="No vehicles match the current search." />}
        </div>
      </div>
      {dialogOpen && (
        <VehicleDialog
          vehicle={dialogVehicle}
          drivers={drivers}
          truckTypes={truckTypes}
          error={actionError}
          onClose={() => setDialogOpen(false)}
          onSave={saveVehicle}
        />
      )}
    </>
  );
}

function VehicleDialog({
  vehicle,
  drivers,
  truckTypes,
  error,
  onClose,
  onSave,
}: {
  vehicle: Vehicle | null;
  drivers: ReturnType<typeof useDrivers>["drivers"];
  truckTypes: ReturnType<typeof useTruckTypes>["truckTypes"];
  error: string;
  onClose: () => void;
  onSave: (input: VehicleInput) => Promise<void>;
}) {
  const [form, setForm] = useState<VehicleInput>({
    vehicleNumber: vehicle?.vehicleNumber ?? "",
    truckTypeId: vehicle?.truckTypeId ?? "",
    driverId: vehicle?.driverId ?? "",
    notes: vehicle?.notes ?? "",
    status: vehicle?.status ?? "active",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        vehicleNumber: form.vehicleNumber.trim(),
        truckTypeId: form.truckTypeId || null,
        driverId: form.driverId || null,
        notes: form.notes?.trim() || null,
        status: form.status ?? "active",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={vehicle ? "Edit Vehicle" : "Add Vehicle"}
      onClose={onClose}
      size="large"
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="vehicle-form" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Vehicle"}
          </button>
        </>
      }
    >
      <form id="vehicle-form" className="form-layout" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Vehicle Details</h3>
            <p>Maintain fleet records used for shipment assignment.</p>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Vehicle No</span>
              <input value={form.vehicleNumber} onChange={(event) => setForm((current) => ({ ...current, vehicleNumber: event.target.value }))} required />
            </label>
            <label className="field">
              <span>Truck Type</span>
              <select value={form.truckTypeId ?? ""} onChange={(event) => setForm((current) => ({ ...current, truckTypeId: event.target.value || null }))}>
                <option value="">No truck type</option>
                {truckTypes.map((truckType) => (
                  <option key={truckType.id} value={truckType.id}>{truckType.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Assigned Driver</span>
              <select value={form.driverId ?? ""} onChange={(event) => setForm((current) => ({ ...current, driverId: event.target.value || null }))}>
                <option value="">No driver assigned</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>{driver.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as VehicleInput["status"] }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="field form-wide">
              <span>Notes</span>
              <textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            {error && <p className="form-error">{error}</p>}
          </div>
        </section>
      </form>
    </Modal>
  );
}
