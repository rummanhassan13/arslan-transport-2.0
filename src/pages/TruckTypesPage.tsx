import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { env } from "../config/env";
import { EmptyState, Modal, StatusBadge } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useTruckTypes } from "../hooks/useTruckTypes";
import type { Shipment, TruckType, TruckTypeInput } from "../types/domain";
import { canManageTruckTypes } from "../utils/permissions";

export function TruckTypesPage({ shipments }: { shipments: Shipment[] }) {
  const { role } = useAuth();
  const { truckTypes, loading, error, createTruckType, updateTruckType, deleteTruckType } = useTruckTypes(shipments);
  const [dialogTruckType, setDialogTruckType] = useState<TruckType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const canManage = env.demoMode || canManageTruckTypes(role);

  const visibleTruckTypes = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return truckTypes;
    return truckTypes.filter((truckType) =>
      [truckType.name, truckType.description, truckType.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [search, truckTypes]);

  const openCreateDialog = () => {
    setActionError("");
    setDialogTruckType(null);
    setDialogOpen(true);
  };

  const openEditDialog = (truckType: TruckType) => {
    setActionError("");
    setDialogTruckType(truckType);
    setDialogOpen(true);
  };

  const saveTruckType = async (input: TruckTypeInput) => {
    setActionError("");
    try {
      if (dialogTruckType) {
        await updateTruckType(dialogTruckType.id, input);
      } else {
        await createTruckType(input);
      }
      setDialogOpen(false);
    } catch (truckTypeError) {
      setActionError(truckTypeError instanceof Error ? truckTypeError.message : "Unable to save truck type.");
    }
  };

  const removeTruckType = async (truckType: TruckType) => {
    setActionError("");
    try {
      await deleteTruckType(truckType.id);
    } catch (truckTypeError) {
      setActionError(truckTypeError instanceof Error ? truckTypeError.message : "Unable to delete truck type.");
    }
  };

  return (
    <>
      <section className="filter-card">
        <div className="filter-toolbar">
          <div>
            <h3>Truck Types</h3>
            <p>Reusable equipment categories for vehicles and shipments.</p>
          </div>
          {canManage && (
            <button className="btn-primary" onClick={openCreateDialog}>
              Add Truck Type
            </button>
          )}
        </div>
        <div className="filter-grid filter-grid-primary">
          <label className="field">
            <span>Search truck types</span>
            <div className="field-with-icon">
              <Search size={14} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, description, status..." />
            </div>
          </label>
        </div>
      </section>
      {(loading || error || actionError) && <EmptyState text={loading ? "Loading truck types..." : error || actionError || ""} />}
      <div className="table-card">
        <div className="table-title">
          <div>
            <h3>Truck type records</h3>
            <p>Controlled equipment labels used across the operations workflow.</p>
          </div>
          <span className="status num">{visibleTruckTypes.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTruckTypes.map((truckType) => (
                <tr key={truckType.id}>
                  <td><span className="customer-cell">{truckType.name}</span></td>
                  <td>{truckType.description || "-"}</td>
                  <td><StatusBadge status={truckType.status} /></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canManage ? (
                        <>
                          <button className="icon-btn" onClick={() => openEditDialog(truckType)} aria-label="Edit truck type">
                            <Pencil size={14} />
                          </button>
                          <button className="icon-btn" onClick={() => void removeTruckType(truckType)} aria-label="Delete truck type">
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
          {visibleTruckTypes.length === 0 && <EmptyState text="No truck types match the current search." />}
        </div>
      </div>
      {dialogOpen && (
        <TruckTypeDialog
          truckType={dialogTruckType}
          error={actionError}
          onClose={() => setDialogOpen(false)}
          onSave={saveTruckType}
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
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
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
