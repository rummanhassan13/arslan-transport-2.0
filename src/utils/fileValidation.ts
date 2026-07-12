import type { AttachmentKind } from "../types/domain";

export const allowedImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const allowedPdfMimeType = "application/pdf";
export const maxImageUploadSize = 5 * 1024 * 1024;
export const maxPdfUploadSize = 10 * 1024 * 1024;

export function getAttachmentKind(fileType: string | null | undefined): AttachmentKind {
  if (!fileType) return "other";
  if ((allowedImageMimeTypes as readonly string[]).includes(fileType)) return "image";
  if (fileType === allowedPdfMimeType) return "pdf";
  return "other";
}

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateAttachmentFile(file: File) {
  const kind = getAttachmentKind(file.type);

  if (kind === "other") {
    return {
      ok: false,
      error: "Unsupported file type. Upload JPG, PNG, WebP, or PDF files only.",
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      ok: false,
      error: "File size must be greater than zero.",
    };
  }

  if (kind === "image" && file.size > maxImageUploadSize) {
    return {
      ok: false,
      error: "Image is too large. Images must be 5MB or smaller.",
    };
  }

  if (kind === "pdf" && file.size > maxPdfUploadSize) {
    return {
      ok: false,
      error: "PDF is too large. PDFs must be 10MB or smaller.",
    };
  }

  return { ok: true, error: null };
}
