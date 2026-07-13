import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Image, Paperclip, UploadCloud } from "lucide-react";
import { getShipmentAttachmentCategoryLabel } from "../../constants/attachmentCategories";
import { env } from "../../config/env";
import { useAuth } from "../../hooks/useAuth";
import {
  downloadShipmentAttachmentFile,
  listAttachmentsForShipmentIds,
} from "../../services/shipmentAttachments";
import type { Shipment, ShipmentAttachment } from "../../types/domain";
import { formatDate } from "../../utils/formatters";
import { formatFileSize, getAttachmentKind } from "../../utils/fileValidation";
import { EmptyState, Modal, StatusBadge } from "../ui";

const DEMO_SHIPMENT_ATTACHMENTS_KEY = "transportflow_demo_shipment_attachments";

function readDemoShipmentAttachments(): ShipmentAttachment[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_SHIPMENT_ATTACHMENTS_KEY) ?? "[]") as ShipmentAttachment[];
  } catch {
    return [];
  }
}

export function ShipmentAttachmentReadOnlyList({
  shipmentId,
  shipmentIds,
  shipments = [],
  limit = 10,
  title = "Related Shipment Documents",
  emptyState = "No shipment documents found.",
  compact = false,
}: {
  shipmentId?: string | null;
  shipmentIds?: string[];
  shipments?: Shipment[];
  limit?: number;
  title?: string;
  emptyState?: string;
  compact?: boolean;
}) {
  const { activeOrganization } = useAuth();
  const organizationId = activeOrganization?.id ?? null;
  const ids = useMemo(
    () => Array.from(new Set([...(shipmentIds ?? []), ...(shipmentId ? [shipmentId] : [])].filter(Boolean) as string[])),
    [shipmentId, shipmentIds],
  );
  const shipmentMap = useMemo(() => new Map(shipments.map((shipment) => [shipment.id, shipment])), [shipments]);
  const [attachments, setAttachments] = useState<ShipmentAttachment[]>([]);
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<ShipmentAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMessage, setPreviewMessage] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    if (ids.length === 0) {
      setAttachments([]);
      setLoading(false);
      return;
    }

    if (env.demoMode) {
      setAttachments(
        readDemoShipmentAttachments()
          .filter((attachment) => ids.includes(attachment.shipmentId) && !attachment.deletedAt)
          .slice(0, limit),
      );
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setAttachments([]);
      setError("No active organization is available for loading shipment documents.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setAttachments(await listAttachmentsForShipmentIds(organizationId, ids, limit));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load shipment document references.");
    } finally {
      setLoading(false);
    }
  }, [ids, limit, organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openAttachment = async (attachment: ShipmentAttachment, mode: "preview" | "download") => {
    setPreviewMessage("");
    setPreviewUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return "";
    });

    if (env.demoMode) {
      if (mode === "preview") {
        setPreviewAttachment(attachment);
        setPreviewMessage("Demo mode stores mock document metadata only. Real preview/download is available in Supabase + R2 mode.");
      } else {
        setError("Demo mode stores mock document metadata only. Real download is available in Supabase + R2 mode.");
      }
      return;
    }

    try {
      const blob = await downloadShipmentAttachmentFile(attachment.id);
      const objectUrl = URL.createObjectURL(blob);
      if (mode === "download") {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = attachment.fileName;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return;
      }
      setPreviewAttachment(attachment);
      setPreviewUrl(objectUrl);
    } catch (downloadError) {
      const text = downloadError instanceof Error ? downloadError.message : "Unable to download shipment document.";
      if (mode === "preview") {
        setPreviewAttachment(attachment);
        setPreviewMessage(text);
      } else {
        setError(text);
      }
    }
  };

  if (!loading && !error && attachments.length === 0 && compact) {
    return <EmptyState text={emptyState} />;
  }

  return (
    <section className={compact ? "shipment-documents shipment-documents-compact" : "table-card"}>
      {!compact && (
        <div className="table-title">
          <div>
            <h3>{title}</h3>
            <p>Read-only shipment-owned files linked through related shipment records.</p>
          </div>
          <span className="status num">{attachments.length} docs</span>
        </div>
      )}
      {error && <p className="inline-alert">{error}</p>}
      {loading ? (
        <EmptyState text="Loading shipment documents..." />
      ) : attachments.length ? (
        <div className="attachment-grid">
          {attachments.map((attachment) => (
            <ReadOnlyAttachmentCard
              key={attachment.id}
              attachment={attachment}
              shipment={shipmentMap.get(attachment.shipmentId) ?? null}
              onPreview={() => void openAttachment(attachment, "preview")}
              onDownload={() => void openAttachment(attachment, "download")}
            />
          ))}
        </div>
      ) : (
        <EmptyState text={emptyState} />
      )}
      {previewAttachment && (
        <ReadOnlyAttachmentPreview
          attachment={previewAttachment}
          signedUrl={previewUrl}
          message={previewMessage}
          onClose={() => {
            if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
            setPreviewAttachment(null);
            setPreviewUrl("");
            setPreviewMessage("");
          }}
        />
      )}
    </section>
  );
}

function ReadOnlyAttachmentCard({
  attachment,
  shipment,
  onPreview,
  onDownload,
}: {
  attachment: ShipmentAttachment;
  shipment: Shipment | null;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  return (
    <div className="image-card">
      <div className="thumb-card h-24">
        {kind === "pdf" ? <FileText size={24} /> : kind === "image" ? <Image size={24} /> : <Paperclip size={24} />}
        <span>{kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File"}</span>
      </div>
      <strong>{attachment.fileName}</strong>
      <StatusBadge status={getShipmentAttachmentCategoryLabel(attachment.category)} />
      {shipment && <small className="attachment-meta">Shipment: {shipment.invoice || shipment.shipmentNo || shipment.id}</small>}
      <small className="attachment-meta">{formatFileSize(attachment.fileSize)}</small>
      <small className="attachment-meta">Uploaded {formatDate(attachment.createdAt)}</small>
      <div className="attachment-actions">
        <button className="table-action" type="button" onClick={onPreview}>
          <Eye size={13} /> Preview
        </button>
        <button className="table-action" type="button" onClick={onDownload}>
          <Download size={13} /> Download
        </button>
      </div>
    </div>
  );
}

function ReadOnlyAttachmentPreview({
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
    <Modal title={`Document Preview - ${attachment.fileName}`} onClose={onClose} size="wide">
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
            {kind === "pdf" ? <FileText size={36} /> : kind === "image" ? <Image size={36} /> : <Paperclip size={36} />}
            <span>{message || "Creating secure preview URL..."}</span>
          </div>
        )}
        <p className="attachment-note">This is a read-only reference to a shipment-owned document.</p>
      </div>
    </Modal>
  );
}
