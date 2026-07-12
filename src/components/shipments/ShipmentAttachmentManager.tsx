import { useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, FileText, Image, RefreshCcw, Trash2, UploadCloud } from "lucide-react";
import { SHIPMENT_ATTACHMENT_CATEGORIES, getShipmentAttachmentCategoryLabel } from "../../constants/attachmentCategories";
import { env } from "../../config/env";
import { useShipmentAttachments } from "../../hooks/useShipmentAttachments";
import {
  createShipmentAttachmentDownloadUrl,
  createShipmentAttachmentUploadUrl,
  uploadFileToSignedUrl,
} from "../../services/shipmentAttachments";
import type { ShipmentAttachment, ShipmentAttachmentCategory } from "../../types/domain";
import type { ShipmentExpense } from "../../types/domain";
import { getExpenseActualCost } from "../../utils/calculations";
import { formatDate } from "../../utils/formatters";
import { labelize, money } from "../../utils/formatters";
import { formatFileSize, getAttachmentKind, validateAttachmentFile } from "../../utils/fileValidation";
import { EmptyState, Modal, StatusBadge } from "../ui";

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
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");
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
      const uploadTarget = await createShipmentAttachmentUploadUrl({
        shipmentId,
        shipmentExpenseId,
        category,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      await uploadFileToSignedUrl(file, uploadTarget.signedUploadUrl, uploadTarget.headers);
      await createAttachmentMetadata({
        shipmentId,
        shipmentExpenseId,
        category,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storageKey: uploadTarget.storageKey,
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

  const openAttachment = async (attachment: ShipmentAttachment, mode: "preview" | "download") => {
    setPreviewMessage("");
    setPreviewUrl("");

    if (env.demoMode) {
      setPreviewAttachment(mode === "preview" ? attachment : null);
      setPreviewMessage("Demo mode stores mock document metadata only. Real preview/download is available in Supabase + R2 mode.");
      return;
    }

    try {
      const signed = await createShipmentAttachmentDownloadUrl(attachment.id);
      if (mode === "download") {
        window.open(signed.signedDownloadUrl, "_blank", "noopener,noreferrer");
        return;
      }
      setPreviewAttachment(attachment);
      setPreviewMessage("Loading secure preview...");

      const response = await fetch(signed.signedDownloadUrl);
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
      setPreviewMessage("");
    } catch (downloadError) {
      const text = downloadError instanceof Error ? downloadError.message : "Unable to create signed download URL.";
      if (mode === "preview") {
        setPreviewAttachment(attachment);
        setPreviewMessage(text);
      } else {
        setMessage(text);
      }
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
                    onPreview={() => void openAttachment(attachment, "preview")}
                    onDownload={() => void openAttachment(attachment, "download")}
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
          signedUrl={previewUrl}
          message={previewMessage}
          onClose={() => {
            if (previewUrl && previewUrl.startsWith("blob:")) {
              URL.revokeObjectURL(previewUrl);
            }
            setPreviewAttachment(null);
            setPreviewUrl("");
            setPreviewMessage("");
          }}
        />
      )}
    </div>
  );
}

function ShipmentDocumentCard({
  attachment,
  linkedExpense,
  readOnly,
  onPreview,
  onDownload,
  onDelete,
}: {
  attachment: ShipmentAttachment;
  linkedExpense: ShipmentExpense | null;
  readOnly: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  return (
    <div className="image-card">
      <div className="thumb-card h-24">
        {kind === "pdf" ? <FileText size={24} /> : kind === "image" ? <Image size={24} /> : <UploadCloud size={24} />}
        <span>{kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File"}</span>
      </div>
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
        <button className="table-action" type="button" onClick={onDownload}>
          <Download size={13} /> Download
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

function ShipmentDocumentPreviewModal({
  attachment,
  signedUrl,
  message,
  onClose,
}: {
  attachment: ShipmentAttachment;
  signedUrl: string;
  message: string;
  onClose: () => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  return (
    <Modal 
      title={`Document Preview - ${attachment.fileName}`} 
      onClose={onClose} 
      size="wide"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} type="button">Close</button>
          {signedUrl && (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="btn-primary" download={attachment.fileName}>
              <Download size={14} /> Download File
            </a>
          )}
        </>
      }
    >
      <div className="attachment-preview">
        {signedUrl ? (
          kind === "pdf" ? (
            <iframe className="attachment-viewer" src={signedUrl} title={attachment.fileName} />
          ) : kind === "image" ? (
            <img className="attachment-image-preview" src={signedUrl} alt={attachment.fileName} />
          ) : (
            <div className="thumb-card h-56">
              <UploadCloud size={36} />
              <span>Preview unavailable for this file type.</span>
            </div>
          )
        ) : (
          <div className="thumb-card h-56">
            {kind === "pdf" ? <FileText size={36} /> : kind === "image" ? <Image size={36} /> : <UploadCloud size={36} />}
            <span>{message || "Creating secure preview URL..."}</span>
          </div>
        )}
        <p className="attachment-note">Documents are stored privately. Preview and download use short-lived signed URLs.</p>
      </div>
    </Modal>
  );
}
