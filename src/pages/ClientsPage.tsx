import { useMemo, useState, type FormEvent } from "react";
import { Eye, Pencil, Search, Trash2 } from "lucide-react";
import { env } from "../config/env";
import { useAuth } from "../hooks/useAuth";
import { useClients } from "../hooks/useClients";
import type { Client, ClientInput, Shipment, ClientPayment } from "../types/domain";
import { formatDate, money } from "../utils/formatters";
import { sum } from "../utils/calculations";
import { PageTitle, StatusBadge, EmptyState, Modal } from "../components/ui";
import { canManageClients } from "../utils/permissions";
import { ShipmentAttachmentReadOnlyList } from "../components/shipments/ShipmentAttachmentReadOnlyList";
import { signedClientPaymentAmount, sumMoney } from "../domain/financials";

export function ClientsPage({ shipments, clientPayments = [], embedded = false }: { shipments: Shipment[]; clientPayments?: ClientPayment[]; embedded?: boolean }) {
  const { role } = useAuth();
  const { clients, loading, error, createClient, updateClient, deleteClient } = useClients(shipments);
  const [dialogClient, setDialogClient] = useState<Client | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentClient, setDocumentClient] = useState<(Client & { rows: Shipment[] }) | null>(null);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const canManage = env.demoMode || canManageClients(role);

  const clientRows = useMemo(() => {
    return clients.map((client) => {
      const rows = shipments.filter((shipment) => shipment.clientId === client.id);
      const revenue = sum(rows, "companyTotal");
      const paid = sumMoney(clientPayments.filter((payment) => payment.clientId === client.id).map(signedClientPaymentAmount));
      const pending = sumMoney(rows.map((shipment) => shipment.clientBalance ?? shipment.companyTotal));
      return {
        ...client,
        rows,
        revenue,
        pending,
        paid,
        last: rows.map((row) => row.date).sort().at(-1) || client.updatedAt,
      };
    });
  }, [clients, shipments, clientPayments]);
  const visibleClients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return clientRows;
    return clientRows.filter((client) =>
      [client.name, client.contactPerson, client.phone, client.email, client.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [clientRows, search]);

  const openCreateDialog = () => {
    setActionError("");
    setDialogClient(null);
    setDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setActionError("");
    setDialogClient(client);
    setDialogOpen(true);
  };

  const saveClient = async (input: ClientInput) => {
    setActionError("");
    try {
      if (dialogClient) {
        await updateClient(dialogClient.id, input);
      } else {
        await createClient(input);
      }
      setDialogOpen(false);
    } catch (clientError) {
      setActionError(clientError instanceof Error ? clientError.message : "Unable to save client.");
    }
  };

  const removeClient = async (client: Client) => {
    setActionError("");
    try {
      await deleteClient(client.id);
    } catch (clientError) {
      setActionError(clientError instanceof Error ? clientError.message : "Unable to delete client.");
    }
  };

  return (
    <>
      {!embedded && (
        <PageTitle
          title="Clients"
          subtitle="Customer balances, shipment history, invoices, and payment status."
        />
      )}
      <section className="filter-card">
        <div className="filter-toolbar">
          <div>
            <h3>Clients</h3>
            <p>Customer balances, shipment history, invoices, and payment status.</p>
          </div>
          {canManage && (
            <button className="btn-primary" onClick={openCreateDialog}>
              Add Client
            </button>
          )}
        </div>
        <div className="filter-grid filter-grid-primary">
          <label className="field">
            <span>Search clients</span>
            <div className="field-with-icon">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Company, contact, phone, email..."
              />
            </div>
          </label>
        </div>
      </section>
      {loading && <EmptyState text="Loading clients..." />}
      {(error || actionError) && <EmptyState text={error || actionError} />}
      <div className="table-card">
        <div className="table-title">
          <div>
            <h3>Client records</h3>
            <p>Master customer list with shipment-linked financial context.</p>
          </div>
          <span className="status num">{visibleClients.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th className="num text-right">Shipments</th>
                <th className="num text-right">Revenue</th>
                <th className="num text-right">Paid</th>
                <th className="num text-right">Pending</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <span className="customer-cell">{client.name}</span>
                  </td>
                  <td>
                    <span className="route-cell">
                      {client.contactPerson || "No contact"}
                      {client.phone ? ` / ${client.phone}` : ""}
                    </span>
                  </td>
                  <td className="num">{client.rows.length}</td>
                  <td className="num">{money(client.revenue)}</td>
                  <td className="num">{money(client.paid)}</td>
                  <td className="num">{money(client.pending)}</td>
                  <td className="num">{formatDate(client.last)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={client.status} />
                      <StatusBadge status={client.pending ? "Pending" : "Paid"} />
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button className="icon-btn" aria-label="Open client documents" onClick={() => setDocumentClient(client)}>
                        <Eye size={14} />
                      </button>
                      {canManage && (
                        <>
                          <button className="icon-btn" onClick={() => openEditDialog(client)} aria-label="Edit client">
                            <Pencil size={14} />
                          </button>
                          <button className="icon-btn" onClick={() => void removeClient(client)} aria-label="Delete client">
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
          {visibleClients.length === 0 && <EmptyState text="No clients match the current search." />}
        </div>
      </div>
      {dialogOpen && (
        <ClientDialog
          client={dialogClient}
          error={actionError}
          onClose={() => setDialogOpen(false)}
          onSave={saveClient}
        />
      )}
      {documentClient && (
        <Modal title={`${documentClient.name} - Recent Shipment Documents`} onClose={() => setDocumentClient(null)} size="wide">
          <ShipmentAttachmentReadOnlyList
            shipmentIds={documentClient.rows.map((shipment) => shipment.id)}
            shipments={documentClient.rows}
            limit={10}
            title="Recent Shipment Documents"
            emptyState="No shipment documents found for this client yet."
          />
        </Modal>
      )}
    </>
  );
}

function ClientDialog({
  client,
  error,
  onClose,
  onSave,
}: {
  client: Client | null;
  error: string;
  onClose: () => void;
  onSave: (input: ClientInput) => Promise<void>;
}) {
  const [form, setForm] = useState<ClientInput>({
    name: client?.name ?? "",
    contactPerson: client?.contactPerson ?? "",
    phone: client?.phone ?? "",
    email: client?.email ?? "",
    address: client?.address ?? "",
    notes: client?.notes ?? "",
    status: client?.status ?? "active",
  });
  const [saving, setSaving] = useState(false);

  const update = (key: keyof ClientInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        contactPerson: form.contactPerson?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes?.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={client ? "Edit Client" : "Add Client"}
      onClose={onClose}
      size="large"
      footer={
        <>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="client-form" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Client"}
          </button>
        </>
      }
    >
      <form id="client-form" className="form-layout" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Client Details</h3>
            <p>Store the customer contact information used across shipments and billing.</p>
          </div>
          <div className="form-grid">
        <label className="field">
          <span>Company Name</span>
          <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
        </label>
        <label className="field">
          <span>Contact Person</span>
          <input value={form.contactPerson ?? ""} onChange={(event) => update("contactPerson", event.target.value)} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email ?? ""} onChange={(event) => update("email", event.target.value)} />
        </label>
        <label className="field form-wide">
          <span>Address</span>
          <input value={form.address ?? ""} onChange={(event) => update("address", event.target.value)} />
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
