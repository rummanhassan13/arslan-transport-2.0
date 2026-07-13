import { useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, LoaderCircle, RefreshCcw, Trash2, UploadCloud } from "lucide-react";
import { SHIPMENT_ATTACHMENT_CATEGORIES, getShipmentAttachmentCategoryLabel } from "../../constants/attachmentCategories";
import { env } from "../../config/env";
import { useShipmentAttachments } from "../../hooks/useShipmentAttachments";
import { uploadShipmentAttachmentFile } from "../../services/shipmentAttachments";
import type { ShipmentAttachment, ShipmentAttachmentCategory } from "../../types/domain";
import type { ShipmentExpense } from "../../types/domain";
import { getExpenseActualCost } from "../../utils/calculations";
import { formatDate } from "../../utils/formatters";
import { labelize, money } from "../../utils/formatters";
import { formatFileSize, validateAttachmentFile } from "../../utils/fileValidation";
import { EmptyState, StatusBadge } from "../ui";
import {
  downloadShipmentDocument,
  ShipmentDocumentPreviewModal,
  ShipmentDocumentThumbnail,
} from "./ShipmentDocumentViewer";

export function ShipmentAttachmentManager({
  shipmentId,
  readOnly = false,
  defaultCategory = "other",
  shipmentExpenseId = null,
  linkedExpenses = [],
  compact = false,
}: {
  shipmentId?: string | null;
  organizationId?: string | null;
  readOnly?: boolean;
  defaultCategory?: ShipmentAttachmentCategory;
  shipmentExpenseId?: string | null;
  linkedExpenses?: ShipmentExpense[];
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<ShipmentAttachmentCategory>(defaultCategory);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ShipmentAttachment | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const {
    attachments,
    loading,
    error,
    refreshAttachments,
    createAttachmentMetadata,
    deleteAttachment,
  } = useShipmentAttachments(shipmentId ?? undefined);
  const visibleAttachments = shipmentExpenseId
    ? attachments.filter((attachment) => attachment.shipmentExpenseId === shipmentExpenseId)
    : attachments;

  const canUpload = Boolean(shipmentId) && !readOnly;

  const uploadSelectedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage("");
    if (!file) return;
    if (!shipmentId) {
      setMessage("Save the shipment first to add documents.");
      return;
    }

    const validation = validateAttachmentFile(file);
    if (!validation.ok) {
      setMessage(validation.error || "Unsupported document.");
      return;
    }

    setUploading(true);
    try {
      const uploadResult = await uploadShipmentAttachmentFile(file, {
        shipmentId,
        shipmentExpenseId,
        category,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      await createAttachmentMetadata({
        shipmentId,
        shipmentExpenseId,
        category,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storageKey: uploadResult.storageKey,
        notes: notes.trim() || null,
      });
      setNotes("");
      setMessage(env.demoMode ? "Mock document metadata added for this shipment." : "Document uploaded and linked to this shipment.");
      await refreshAttachments();
    } catch (uploadError) {
      setMessage(uploadError instanceof Error ? uploadError.message : "Unable to upload shipment document.");
    } finally {
      setUploading(false);
    }
  };

  const downloadAttachment = async (attachment: ShipmentAttachment) => {
    setMessage("");
    setDownloadingAttachmentId(attachment.id);
    try {
      await downloadShipmentDocument(attachment);
    } catch (downloadError) {
      setMessage(downloadError instanceof Error ? downloadError.message : "Unable to download shipment document.");
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  const removeAttachment = async (attachment: ShipmentAttachment) => {
    setMessage("");
    try {
      await deleteAttachment(attachment.id);
      setMessage("Document removed from this shipment.");
      await refreshAttachments();
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : "Unable to remove shipment document.");
    }
  };

  return (
    <div className={`shipment-documents ${compact ? "shipment-documents-compact" : ""}`}>
      {!shipmentId && <EmptyState text="Save the shipment first to add documents." />}
      {shipmentId && (
        <>
          {!readOnly && (
            <div className="filter-card">
              <div className="filter-toolbar">
                <div>
                  <h3>Upload Document</h3>
                  <p>Attach bills, slips, receipts, PDFs, and supporting documents to this shipment.</p>
                </div>
                <button className="btn-primary" type="button" disabled={!canUpload || uploading} onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud size={15} />
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Category</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value as ShipmentAttachmentCategory)}>
                    {SHIPMENT_ATTACHMENT_CATEGORIES.map((option) => (
                      <option key={option} value={option}>
                        {getShipmentAttachmentCategoryLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field form-grid-full">
                  <span>Notes</span>
                  <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional document note" />
                </label>
              </div>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={uploadSelectedFile}
              />
              <p className="muted-note">JPG, PNG, WebP up to 5MB. PDF up to 10MB. Files are linked to the shipment only.</p>
            </div>
          )}
          {readOnly && <p className="muted-note">View-only access. You can preview and download documents, but cannot upload or remove them.</p>}
          {(message || error) && <p className="inline-alert">{message || error}</p>}
          <div className="table-card">
            <div className="table-title">
              <div>
                <h3>Shipment Documents</h3>
                <p>{visibleAttachments.length ? `${visibleAttachments.length} document${visibleAttachments.length === 1 ? "" : "s"} linked here.` : "No documents uploaded for this shipment yet."}</p>
              </div>
              <button className="icon-btn" type="button" onClick={() => void refreshAttachments()} aria-label="Refresh documents">
                <RefreshCcw size={15} />
              </button>
            </div>
            {loading ? (
              <EmptyState text="Loading shipment documents..." />
            ) : visibleAttachments.length ? (
              <div className="attachment-grid">
                {visibleAttachments.map((attachment) => (
                  <ShipmentDocumentCard
                    key={attachment.id}
                    attachment={attachment}
                    linkedExpense={linkedExpenses.find((expense) => expense.id === attachment.shipmentExpenseId) ?? null}
                    readOnly={readOnly}
                    downloading={downloadingAttachmentId === attachment.id}
                    onPreview={() => setPreviewAttachment(attachment)}
                    onDownload={() => void downloadAttachment(attachment)}
                    onDelete={() => void removeAttachment(attachment)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState text="No documents uploaded for this shipment yet." />
            )}
          </div>
        </>
      )}
      {previewAttachment && (
        <ShipmentDocumentPreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}

function ShipmentDocumentCard({
  attachment,
  linkedExpense,
  readOnly,
  downloading,
  onPreview,
  onDownload,
  onDelete,
}: {
  attachment: ShipmentAttachment;
  linkedExpense: ShipmentExpense | null;
  readOnly: boolean;
  downloading: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="image-card">
      <ShipmentDocumentThumbnail attachment={attachment} onOpen={onPreview} />
      <strong>{attachment.fileName}</strong>
      <StatusBadge status={getShipmentAttachmentCategoryLabel(attachment.category)} />
      <small className="attachment-meta">{attachment.fileType}</small>
      <small className="attachment-meta">{formatFileSize(attachment.fileSize)}</small>
      <small className="attachment-meta">Uploaded {formatDate(attachment.createdAt)}</small>
      {linkedExpense && <small className="attachment-meta">Linked expense: {labelize(linkedExpense.category)} - {money(getExpenseActualCost(linkedExpense))}</small>}
      {attachment.notes && <small className="attachment-meta">{attachment.notes}</small>}
      <div className="attachment-actions">
        <button className="table-action" type="button" onClick={onPreview}>
          <Eye size={13} /> Preview
        </button>
        <button className="table-action" disabled={downloading} type="button" onClick={onDownload}>
          {downloading ? <LoaderCircle className="document-spinner" size={13} /> : <Download size={13} />}
          {downloading ? "Preparing" : "Download"}
        </button>
        {!readOnly && (
          <button className="table-action" type="button" onClick={onDelete}>
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
