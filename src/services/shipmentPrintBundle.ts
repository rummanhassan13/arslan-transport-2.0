import { createShipmentAttachmentDownloadUrl } from "./shipmentAttachments";
import type { ShipmentAttachment } from "../types/domain";

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const IMAGE_PAGE_MARGIN = 18;

export type ShipmentPrintProgress = {
  phase: "rendering_invoice" | "loading_attachment" | "finalizing";
  completed: number;
  total: number;
  fileName?: string;
};

type BuildShipmentPrintBundleInput = {
  invoiceElement: HTMLElement;
  attachments: ShipmentAttachment[];
  signal?: AbortSignal;
  onProgress?: (progress: ShipmentPrintProgress) => void;
  captureInvoice?: (element: HTMLElement, signal?: AbortSignal) => Promise<Uint8Array>;
  loadAttachment?: (attachment: ShipmentAttachment, signal?: AbortSignal) => Promise<Uint8Array>;
  convertWebp?: (bytes: Uint8Array, signal?: AbortSignal) => Promise<Uint8Array>;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Shipment document preparation was cancelled.", "AbortError");
}

function bytesFromBlob(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function canvasToPngBytes(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The browser could not render the invoice as an image."));
        return;
      }
      void bytesFromBlob(blob).then(resolve, reject);
    }, "image/png");
  });
}

async function waitForInvoiceAssets(element: HTMLElement, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (document.fonts?.ready) await document.fonts.ready;

  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    try {
      await image.decode();
    } catch {
      throw new Error(`Invoice image "${image.alt || "unnamed image"}" could not be loaded.`);
    }
  }));
  throwIfAborted(signal);
}

export async function captureInvoiceAsPng(element: HTMLElement, signal?: AbortSignal) {
  await waitForInvoiceAssets(element, signal);
  const { default: html2canvas } = await import("html2canvas");
  throwIfAborted(signal);

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: 2,
    useCORS: true,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });
  throwIfAborted(signal);
  return canvasToPngBytes(canvas);
}

export async function fetchShipmentAttachmentBytes(attachment: ShipmentAttachment, signal?: AbortSignal) {
  throwIfAborted(signal);
  const { signedDownloadUrl } = await createShipmentAttachmentDownloadUrl(attachment.id, "inline");
  if (!signedDownloadUrl) {
    throw new Error("The secure download URL was empty. Real attachment files are unavailable in demo mode.");
  }

  let response: Response;
  try {
    response = await fetch(signedDownloadUrl, { cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("The attachment could not be fetched. Check the R2 GET CORS policy and try again.", { cause: error });
  }

  if (!response.ok) throw new Error(`The attachment download returned status ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function convertWebpToPng(bytes: Uint8Array, signal?: AbortSignal) {
  throwIfAborted(signal);
  const source = new Blob([Uint8Array.from(bytes)], { type: "image/webp" });
  const sourceUrl = URL.createObjectURL(source);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The WebP image could not be decoded."));
      element.src = sourceUrl;
    });
    throwIfAborted(signal);

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser could not create an image conversion canvas.");
    context.drawImage(image, 0, 0);
    return await canvasToPngBytes(canvas);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function fitWithin(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}

function attachmentError(attachment: ShipmentAttachment, error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown attachment error.";
  return new Error(`Unable to include "${attachment.fileName}": ${detail}`, { cause: error });
}

export async function buildShipmentPrintBundle({
  invoiceElement,
  attachments,
  signal,
  onProgress,
  captureInvoice = captureInvoiceAsPng,
  loadAttachment = fetchShipmentAttachmentBytes,
  convertWebp = convertWebpToPng,
}: BuildShipmentPrintBundleInput) {
  const { PDFDocument } = await import("pdf-lib");
  const total = attachments.length + 1;
  throwIfAborted(signal);

  onProgress?.({ phase: "rendering_invoice", completed: 0, total });
  const invoicePng = await captureInvoice(invoiceElement, signal);
  throwIfAborted(signal);

  const output = await PDFDocument.create();
  const invoiceImage = await output.embedPng(invoicePng);
  const invoicePage = output.addPage(A4_PORTRAIT);
  const invoicePlacement = fitWithin(invoiceImage.width, invoiceImage.height, ...A4_PORTRAIT);
  invoicePage.drawImage(invoiceImage, invoicePlacement);

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    throwIfAborted(signal);
    onProgress?.({
      phase: "loading_attachment",
      completed: index + 1,
      total,
      fileName: attachment.fileName,
    });

    try {
      const bytes = await loadAttachment(attachment, signal);
      throwIfAborted(signal);

      if (attachment.fileType === "application/pdf") {
        const source = await PDFDocument.load(bytes);
        const copiedPages = await output.copyPages(source, source.getPageIndices());
        copiedPages.forEach((page) => output.addPage(page));
        continue;
      }

      const isJpeg = attachment.fileType === "image/jpeg";
      const imageBytes = attachment.fileType === "image/webp" ? await convertWebp(bytes, signal) : bytes;
      const image = isJpeg ? await output.embedJpg(imageBytes) : await output.embedPng(imageBytes);
      const pageSize = image.width > image.height ? A4_LANDSCAPE : A4_PORTRAIT;
      const page = output.addPage(pageSize);
      const placement = fitWithin(
        image.width,
        image.height,
        pageSize[0] - IMAGE_PAGE_MARGIN * 2,
        pageSize[1] - IMAGE_PAGE_MARGIN * 2,
      );
      page.drawImage(image, {
        ...placement,
        x: placement.x + IMAGE_PAGE_MARGIN,
        y: placement.y + IMAGE_PAGE_MARGIN,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw attachmentError(attachment, error);
    }
  }

  throwIfAborted(signal);
  onProgress?.({ phase: "finalizing", completed: total, total });
  return output.save({ useObjectStreams: true });
}

export function shipmentPrintBundleFileName(invoiceNumber: string) {
  const safeInvoiceNumber = invoiceNumber.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "shipment";
  return `Shipment-${safeInvoiceNumber}-documents.pdf`;
}
