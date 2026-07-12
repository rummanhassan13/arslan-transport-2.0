import { useState, type ChangeEvent } from "react";
import { Download, Eye, FileText, Image, Trash2, UploadCloud } from "lucide-react";
import type { ExpenseAttachment, ExpenseAttachmentInput } from "../types/domain";
import { env } from "../config/env";
import { formatDate } from "../utils/formatters";
import { formatFileSize, getAttachmentKind, validateAttachmentFile } from "../utils/fileValidation";
import { EmptyState, Modal } from "./ui";

export function AttachmentCard({
  attachment,
  canManage,
  onPreview,
  onDownload,
  onDelete,
}: {
  attachment: ExpenseAttachment;
  canManage: boolean;
  onPreview: (attachment: ExpenseAttachment) => void;
  onDownload: (attachment: ExpenseAttachment) => void;
  onDelete: (attachmentId: string) => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  return (
    <div className="image-card">
      <div className="thumb-card h-24">
        {kind === "pdf" ? <FileText size={24} /> : kind === "image" ? <Image size={24} /> : <UploadCloud size={24} />}
        <span>{kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File"}</span>
      </div>
      <strong>{attachment.fileName}</strong>
      <small className="attachment-meta">{attachment.fileType || "Unknown type"}</small>
      <small className="attachment-meta">{formatFileSize(attachment.fileSize)}</small>
      <small className="attachment-meta">Uploaded {formatDate(attachment.createdAt)}</small>
      <div className="attachment-actions">
        <button className="table-action" onClick={() => onPreview(attachment)}>
          <Eye size={13} /> Preview
        </button>
        <button className="table-action" onClick={() => onDownload(attachment)}>
          <Download size={13} /> Download
        </button>
        {canManage && (
          <button className="table-action" onClick={() => onDelete(attachment.id)}>
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function AttachmentList({
  attachments,
  canManage,
  getSignedDownloadUrl,
  onDelete,
}: {
  attachments: ExpenseAttachment[];
  canManage: boolean;
  getSignedDownloadUrl?: (attachmentId: string) => Promise<string>;
  onDelete: (attachmentId: string) => void;
}) {
  const [previewAttachment, setPreviewAttachment] = useState<ExpenseAttachment | null>(null);
  const [signedUrl, setSignedUrl] = useState("");
  const [message, setMessage] = useState("");

  const preview = async (attachment: ExpenseAttachment) => {
    setMessage("");
    setSignedUrl("");
    setPreviewAttachment(attachment);
    if (!getSignedDownloadUrl) return;
    try {
      setSignedUrl(await getSignedDownloadUrl(attachment.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create preview URL.");
    }
  };

  const download = async (attachment: ExpenseAttachment) => {
    setMessage("");
    if (!getSignedDownloadUrl) {
      setMessage("Download requires signed URLs from the storage phase.");
      return;
    }
    try {
      const url = await getSignedDownloadUrl(attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create download URL.");
    }
  };

  return (
    <>
      {message && <p className="inline-alert">{message}</p>}
      <div className="attachment-grid">
        {attachments.length === 0 && <EmptyState text="No attachment metadata yet." />}
        {attachments.map((attachment) => (
          <AttachmentCard
            key={attachment.id}
            attachment={attachment}
            canManage={canManage}
            onPreview={(item) => void preview(item)}
            onDownload={(item) => void download(item)}
            onDelete={onDelete}
          />
        ))}
      </div>
      {previewAttachment && <AttachmentPreviewModal attachment={previewAttachment} signedUrl={signedUrl} message={message} onClose={() => setPreviewAttachment(null)} />}
    </>
  );
}

export function AttachmentUploadPlaceholder({
  shipmentId,
  expenseId,
  canManage,
  onCreateMetadata,
  onUploadFile,
}: {
  shipmentId: string;
  expenseId?: string | null;
  canManage: boolean;
  onCreateMetadata: (input: ExpenseAttachmentInput) => Promise<void>;
  onUploadFile?: (file: File, metadata: Pick<ExpenseAttachmentInput, "shipmentId" | "expenseId">) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage("");
    if (!file) return;

    const validation = validateAttachmentFile(file);
    if (!validation.ok) {
      setMessage(validation.error || "Unsupported attachment.");
      return;
    }

    setUploading(true);
    try {
      if (onUploadFile) {
        await onUploadFile(file, { shipmentId, expenseId: expenseId ?? null });
        setMessage(env.demoMode ? "Mock attachment metadata added. No file was uploaded." : "Attachment uploaded privately and metadata saved.");
        return;
      }

      await onCreateMetadata({
        shipmentId,
        expenseId: expenseId ?? null,
        storageProvider: "r2",
        bucketName: "demo-expense-attachments",
        objectKey: `demo/${shipmentId}/${file.name}`,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        compressed: false,
      });
      setMessage("Mock attachment metadata added. No file was uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload attachment.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-box">
      <UploadCloud size={22} />
      <strong>Expense attachment upload</strong>
      <span>Images: JPG, PNG, WebP up to 10MB. PDFs up to 20MB.</span>
      <span>Images will be compressed before upload in the storage phase. PDFs are validated but not compressed in the MVP.</span>
      {canManage ? (
        <label className="table-action mt-2">
          {uploading ? "Uploading..." : env.demoMode ? "Select mock file" : "Upload attachment"}
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={selectFile} />
        </label>
      ) : (
        <span className="muted-note">View only</span>
      )}
      {message && <p className="upload-message">{message}</p>}
    </div>
  );
}

export function AttachmentPreviewModal({
  attachment,
  signedUrl,
  message,
  onClose,
}: {
  attachment: ExpenseAttachment;
  signedUrl: string;
  message: string;
  onClose: () => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  return (
    <Modal title={`Attachment Preview - ${attachment.fileName}`} onClose={onClose} size="wide">
      <div className="attachment-preview">
        {signedUrl ? (
          kind === "pdf" ? (
            <iframe className="attachment-viewer" src={signedUrl} title={attachment.fileName} />
          ) : kind === "image" ? (
            <img className="attachment-image-preview" src={signedUrl} alt={attachment.fileName} />
          ) : (
            <div className="thumb-card h-56"><UploadCloud size={36} /><span>Preview unavailable for this file type.</span></div>
          )
        ) : (
          <div className="thumb-card h-56">
            {kind === "pdf" ? <FileText size={36} /> : kind === "image" ? <Image size={36} /> : <UploadCloud size={36} />}
            <span>{message || "Creating secure preview URL..."}</span>
          </div>
        )}
        <p className="attachment-note">
          No public URL is stored. Preview and download use short-lived signed URLs.
        </p>
      </div>
    </Modal>
  );
}
