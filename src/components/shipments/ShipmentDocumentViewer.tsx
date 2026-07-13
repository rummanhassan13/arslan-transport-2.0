import { useCallback, useEffect, useState } from "react";
import { Download, Eye, FileText, FileWarning, Image, LoaderCircle, RefreshCcw } from "lucide-react";
import { env } from "../../config/env";
import { createShipmentAttachmentDownloadUrl } from "../../services/shipmentAttachments";
import type { ShipmentAttachment } from "../../types/domain";
import { getAttachmentKind } from "../../utils/fileValidation";
import { Modal } from "../ui";

function useShipmentDocumentUrl(attachmentId: string) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");

    if (env.demoMode) {
      setLoading(false);
      setError("Preview is available when connected to Supabase and R2.");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void createShipmentAttachmentDownloadUrl(attachmentId, "inline")
      .then((result) => {
        if (!active) return;
        setUrl(result.signedDownloadUrl);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load this document.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attachmentId, attempt]);

  return { url, loading, error, retry };
}

export function ShipmentDocumentThumbnail({
  attachment,
  onOpen,
}: {
  attachment: ShipmentAttachment;
  onOpen: () => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  const { url, loading, error } = useShipmentDocumentUrl(attachment.id);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => setMediaFailed(false), [url]);

  const unavailable = Boolean(error || mediaFailed);
  const label = kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File";

  const activateFromKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      aria-label={`Preview ${attachment.fileName}`}
      className="document-thumbnail-button"
      onClick={onOpen}
      onKeyDown={activateFromKeyboard}
      role="button"
      tabIndex={0}
    >
      {kind === "image" && url && !mediaFailed && (
        <img
          alt=""
          className="document-thumbnail-image"
          loading="lazy"
          onError={() => setMediaFailed(true)}
          src={url}
        />
      )}
      {kind === "pdf" && url && !mediaFailed && (
        <iframe
          aria-hidden="true"
          className="document-thumbnail-pdf"
          loading="lazy"
          onError={() => setMediaFailed(true)}
          src={`${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          tabIndex={-1}
          title={`${attachment.fileName} thumbnail`}
        />
      )}
      {(loading || unavailable || !url || kind === "other") && (
        <span className="document-thumbnail-state" aria-hidden="true">
          {loading ? (
            <LoaderCircle className="document-spinner" size={26} />
          ) : unavailable ? (
            <FileWarning size={28} />
          ) : kind === "pdf" ? (
            <FileText size={32} />
          ) : kind === "image" ? (
            <Image size={32} />
          ) : (
            <FileText size={32} />
          )}
          <span>{loading ? "Loading preview" : unavailable ? "Preview unavailable" : label}</span>
        </span>
      )}
      <span className="document-thumbnail-badge">{label}</span>
      <span className="document-thumbnail-overlay" aria-hidden="true">
        <Eye size={18} />
        Open preview
      </span>
    </div>
  );
}

export async function downloadShipmentDocument(attachment: ShipmentAttachment) {
  const result = await createShipmentAttachmentDownloadUrl(attachment.id, "attachment");
  const link = document.createElement("a");
  link.href = result.signedDownloadUrl;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function ShipmentDocumentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: ShipmentAttachment;
  onClose: () => void;
}) {
  const kind = getAttachmentKind(attachment.fileType);
  const { url, loading, error, retry } = useShipmentDocumentUrl(attachment.id);
  const [mediaError, setMediaError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => setMediaError(""), [url]);

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadShipmentDocument(attachment);
    } catch (downloadFailure) {
      setDownloadError(downloadFailure instanceof Error ? downloadFailure.message : "Unable to download this document.");
    } finally {
      setDownloading(false);
    }
  };

  const previewError = error || mediaError;

  return (
    <Modal
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} type="button">Close</button>
          <button className="btn-primary" disabled={downloading} onClick={() => void download()} type="button">
            {downloading ? <LoaderCircle className="document-spinner" size={15} /> : <Download size={15} />}
            {downloading ? "Preparing..." : "Download"}
          </button>
        </>
      }
      onClose={onClose}
      size="page"
      title={attachment.fileName}
    >
      <div className="document-preview-shell" aria-busy={loading}>
        {loading && (
          <div className="document-preview-state">
            <LoaderCircle className="document-spinner" size={30} />
            <strong>Loading secure preview</strong>
            <span>Preparing the document for viewing.</span>
          </div>
        )}
        {!loading && previewError && (
          <div className="document-preview-state document-preview-error" role="alert">
            <FileWarning size={32} />
            <strong>Preview could not be loaded</strong>
            <span>{previewError}</span>
            <button className="btn-ghost" onClick={retry} type="button">
              <RefreshCcw size={15} /> Retry
            </button>
          </div>
        )}
        {!loading && !previewError && url && kind === "image" && (
          <img
            alt={attachment.fileName}
            className="document-preview-image"
            onError={() => setMediaError("The image could not be displayed. Try downloading the file instead.")}
            src={url}
          />
        )}
        {!loading && !previewError && url && kind === "pdf" && (
          <iframe
            className="document-preview-pdf"
            src={`${url}#page=1&toolbar=1&navpanes=0&view=FitH`}
            title={attachment.fileName}
          />
        )}
        {!loading && !previewError && kind === "other" && (
          <div className="document-preview-state">
            <FileText size={32} />
            <strong>Preview is not available for this file type</strong>
            <span>Use Download to open the original file.</span>
          </div>
        )}
      </div>
      {downloadError && <p className="inline-alert" role="alert">{downloadError}</p>}
    </Modal>
  );
}
