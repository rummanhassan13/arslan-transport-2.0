import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, LoaderCircle } from "lucide-react";
import { getShipmentAttachmentCategoryLabel } from "../../constants/attachmentCategories";
import { env } from "../../config/env";
import { useAuth } from "../../hooks/useAuth";
import { listAttachmentsForShipmentIds } from "../../services/shipmentAttachments";
import type { Shipment, ShipmentAttachment } from "../../types/domain";
import { formatDate } from "../../utils/formatters";
import { formatFileSize } from "../../utils/fileValidation";
import { EmptyState, StatusBadge } from "../ui";
import {
  downloadShipmentDocument,
  ShipmentDocumentPreviewModal,
  ShipmentDocumentThumbnail,
} from "./ShipmentDocumentViewer";

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
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

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

  const downloadAttachment = async (attachment: ShipmentAttachment) => {
    setError("");
    setDownloadingAttachmentId(attachment.id);
    try {
      await downloadShipmentDocument(attachment);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download shipment document.");
    } finally {
      setDownloadingAttachmentId(null);
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
              downloading={downloadingAttachmentId === attachment.id}
              onPreview={() => setPreviewAttachment(attachment)}
              onDownload={() => void downloadAttachment(attachment)}
            />
          ))}
        </div>
      ) : (
        <EmptyState text={emptyState} />
      )}
      {previewAttachment && (
        <ShipmentDocumentPreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </section>
  );
}

function ReadOnlyAttachmentCard({
  attachment,
  shipment,
  downloading,
  onPreview,
  onDownload,
}: {
  attachment: ShipmentAttachment;
  shipment: Shipment | null;
  downloading: boolean;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="image-card">
      <ShipmentDocumentThumbnail attachment={attachment} onOpen={onPreview} />
      <strong>{attachment.fileName}</strong>
      <StatusBadge status={getShipmentAttachmentCategoryLabel(attachment.category)} />
      {shipment && <small className="attachment-meta">Shipment: {shipment.invoice || shipment.shipmentNo || shipment.id}</small>}
      <small className="attachment-meta">{formatFileSize(attachment.fileSize)}</small>
      <small className="attachment-meta">Uploaded {formatDate(attachment.createdAt)}</small>
      <div className="attachment-actions">
        <button className="table-action" type="button" onClick={onPreview}>
          <Eye size={13} /> Preview
        </button>
        <button className="table-action" disabled={downloading} type="button" onClick={onDownload}>
          {downloading ? <LoaderCircle className="document-spinner" size={13} /> : <Download size={13} />}
          {downloading ? "Preparing" : "Download"}
        </button>
      </div>
    </div>
  );
}
