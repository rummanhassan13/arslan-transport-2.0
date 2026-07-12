import { useState, type FormEvent } from "react";
import { env } from "../config/env";
import { Card, DataTable, EmptyState, Modal, PageTitle, StatusBadge } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useTruckTypes } from "../hooks/useTruckTypes";
import { useVehicles } from "../hooks/useVehicles";
import type { Shipment, TruckType, TruckTypeInput, Vehicle, VehicleInput } from "../types/domain";
import { canManageTruckTypes, canManageVehicles } from "../utils/permissions";

export function SettingsPage({ shipments }: { shipments: Shipment[] }) {
  const { role } = useAuth();
  const {
    truckTypes,
    loading: truckTypesLoading,
    error: truckTypesError,
    createTruckType,
    updateTruckType,
    deleteTruckType,
  } = useTruckTypes(shipments);
  const {
    vehicles,
    loading: vehiclesLoading,
    error: vehiclesError,
    createVehicle,
    updateVehicle,
    deleteVehicle,
  } = useVehicles(shipments, truckTypes);
  const [truckTypeDialog, setTruckTypeDialog] = useState<TruckType | null | "new">(null);
  const [vehicleDialog, setVehicleDialog] = useState<Vehicle | null | "new">(null);
  const [actionError, setActionError] = useState("");
  const canManageTypes = env.demoMode || canManageTruckTypes(role);
  const canManageVehicleRows = env.demoMode || canManageVehicles(role);

  const settings = [
    ["Company Profile", "Arslan Transport name, contact, tax and billing details."],
    ["Invoice Sequence", "Automatic invoice number sequence configuration without prefix."],
    ["Expense Categories", "Gate Pass, Fashah, NAQL, Advance, loading charges."],
    ["Payment Statuses", "Paid, Pending, Partially Paid, Overdue, Advance Paid."],
    ["User Roles", "Admin, Accountant, Dispatcher, Viewer placeholders."],
    ["Storage Setup", "Database: Supabase. Image Storage: Cloudflare R2. Frontend Hosting: Hostinger. Image Compression: Enabled before upload."],
  ];

  const saveTruckType = async (input: TruckTypeInput) => {
    setActionError("");
    try {
      if (truckTypeDialog && truckTypeDialog !== "new") {
        await updateTruckType(truckTypeDialog.id, input);
      } else {
        await createTruckType(input);
      }
      setTruckTypeDialog(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save truck type.");
    }
  };

  const saveVehicle = async (input: VehicleInput) => {
    setActionError("");
    try {
      if (vehicleDialog && vehicleDialog !== "new") {
        await updateVehicle(vehicleDialog.id, input);
      } else {
        await createVehicle(input);
      }
      setVehicleDialog(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save vehicle.");
    }
  };

  return (
    <>
      <PageTitle title="Settings" subtitle="Configuration placeholders for the future production setup." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {settings.map(([title, text]) => (
          <Card key={title} title={title}>
            <p className="settings-copy">{text}</p>
          </Card>
        ))}
      </div>

      {(vehiclesError || truckTypesError || actionError) && <EmptyState text={vehiclesError || truckTypesError || actionError} />}

      <DataTable
        title="Vehicles"
        columns={["Vehicle No", "Truck Type", "Assigned Driver", "Status", "Notes", "Actions"]}
        rows={vehicles.map((vehicle) => [
          vehicle.vehicleNumber,
          vehicle.truckTypeName || "-",
          vehicle.driverName || "-",
          <StatusBadge status={vehicle.status} />,
          vehicle.notes || "-",
          <div className="flex flex-wrap gap-2">
            {canManageVehicleRows ? (
              <>
                <button className="table-action" onClick={() => setVehicleDialog(vehicle)}>
                  Edit
                </button>
                <button className="table-action" onClick={() => void deleteVehicle(vehicle.id)}>
                  Delete
                </button>
              </>
            ) : (
              <span className="muted-note">View only</span>
            )}
          </div>,
        ])}
      />
      {vehiclesLoading && <EmptyState text="Loading vehicles..." />}
      {canManageVehicleRows && (
        <button className="btn-primary w-fit" onClick={() => setVehicleDialog("new")}>
          Add Vehicle
        </button>
      )}

      <DataTable
        title="Truck Types"
        columns={["Name", "Description", "Status", "Actions"]}
        rows={truckTypes.map((truckType) => [
          truckType.name,
          truckType.description || "-",
          <StatusBadge status={truckType.status} />,
          <div className="flex flex-wrap gap-2">
            {canManageTypes ? (
              <>
                <button className="table-action" onClick={() => setTruckTypeDialog(truckType)}>
                  Edit
                </button>
                <button className="table-action" onClick={() => void deleteTruckType(truckType.id)}>
                  Delete
                </button>
              </>
            ) : (
              <span className="muted-note">View only</span>
            )}
          </div>,
        ])}
      />
      {truckTypesLoading && <EmptyState text="Loading truck types..." />}
      {canManageTypes && (
        <button className="btn-primary w-fit" onClick={() => setTruckTypeDialog("new")}>
          Add Truck Type
        </button>
      )}

      {truckTypeDialog && (
        <TruckTypeDialog
          truckType={truckTypeDialog === "new" ? null : truckTypeDialog}
          error={actionError}
          onClose={() => setTruckTypeDialog(null)}
          onSave={saveTruckType}
        />
      )}
      {vehicleDialog && (
        <VehicleDialog
          vehicle={vehicleDialog === "new" ? null : vehicleDialog}
          truckTypes={truckTypes}
          error={actionError}
          onClose={() => setVehicleDialog(null)}
          onSave={saveVehicle}
        />
      )}
    </>
  );
}

function TruckTypeDialog({
  truckType,
  error,
  onClose,
  onSave,
}: {
  truckType: TruckType | null;
  error: string;
  onClose: () => void;
  onSave: (input: TruckTypeInput) => Promise<void>;
}) {
  const [form, setForm] = useState<TruckTypeInput>({
    name: truckType?.name ?? "",
    description: truckType?.description ?? "",
    status: truckType?.status ?? "active",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description?.trim() || null,
        status: form.status ?? "active",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={truckType ? "Edit Truck Type" : "Add Truck Type"}
      onClose={onClose}
      size="medium"
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="truck-type-form" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Truck Type"}
          </button>
        </>
      }
    >
      <form id="truck-type-form" className="form-layout" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Truck Type Details</h3>
            <p>Define reusable equipment categories for vehicles and shipments.</p>
          </div>
          <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TruckTypeInput["status"] }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="field form-wide">
          <span>Description</span>
          <textarea value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </label>
        {error && <p className="form-error">{error}</p>}
          </div>
        </section>
      </form>
    </Modal>
  );
}

function VehicleDialog({
  vehicle,
  truckTypes,
  error,
  onClose,
  onSave,
}: {
  vehicle: Vehicle | null;
  truckTypes: TruckType[];
  error: string;
  onClose: () => void;
  onSave: (input: VehicleInput) => Promise<void>;
}) {
  const [form, setForm] = useState<VehicleInput>({
    vehicleNumber: vehicle?.vehicleNumber ?? "",
    truckTypeId: vehicle?.truckTypeId ?? "",
    driverId: vehicle?.driverId ?? null,
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
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
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
              <option key={truckType.id} value={truckType.id}>
                {truckType.name}
              </option>
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
        <label className="field">
          <span>Driver Assignment</span>
          <input value={vehicle?.driverName ?? "Managed after Drivers/Vehicles linking phase"} disabled />
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
