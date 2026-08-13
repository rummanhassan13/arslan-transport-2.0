import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ShipmentAttachment } from "../types/domain";
import { buildShipmentPrintBundle, shipmentPrintBundleFileName } from "./shipmentPrintBundle";

const onePixelPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2,
  0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1,
  5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
]);

function attachment(overrides: Partial<ShipmentAttachment>): ShipmentAttachment {
  return {
    id: "attachment-1",
    organizationId: "organization-1",
    shipmentId: "shipment-1",
    shipmentExpenseId: null,
    category: "proof_of_delivery",
    fileName: "document.pdf",
    fileType: "application/pdf",
    fileSize: 100,
    storageKey: "shipments/shipment-1/document.pdf",
    uploadedBy: "user-1",
    notes: null,
    createdAt: "2026-08-13T10:00:00.000Z",
    updatedAt: "2026-08-13T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

async function pdfWithPages(count: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) pdf.addPage([300, 400]);
  return pdf.save();
}

describe("buildShipmentPrintBundle", () => {
  it("places the invoice first, preserves every PDF page, and appends image attachments in order", async () => {
    const pdfAttachment = attachment({ id: "pdf", fileName: "two-pages.pdf" });
    const imageAttachment = attachment({ id: "image", fileName: "proof.png", fileType: "image/png" });
    const loaded: string[] = [];
    const progress = vi.fn();

    const bytes = await buildShipmentPrintBundle({
      invoiceElement: {} as HTMLElement,
      attachments: [pdfAttachment, imageAttachment],
      captureInvoice: async () => onePixelPng,
      loadAttachment: async (item) => {
        loaded.push(item.fileName);
        return item.fileType === "application/pdf" ? pdfWithPages(2) : onePixelPng;
      },
      onProgress: progress,
    });

    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(4);
    expect(loaded).toEqual(["two-pages.pdf", "proof.png"]);
    expect(progress).toHaveBeenLastCalledWith({ phase: "finalizing", completed: 3, total: 3 });
  });

  it("converts WebP attachments before embedding them", async () => {
    const convertWebp = vi.fn(async () => onePixelPng);
    const bytes = await buildShipmentPrintBundle({
      invoiceElement: {} as HTMLElement,
      attachments: [attachment({ fileName: "scan.webp", fileType: "image/webp" })],
      captureInvoice: async () => onePixelPng,
      loadAttachment: async () => Uint8Array.of(1, 2, 3),
      convertWebp,
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    expect(convertWebp).toHaveBeenCalledOnce();
  });

  it("names the attachment that prevented a complete bundle", async () => {
    await expect(buildShipmentPrintBundle({
      invoiceElement: {} as HTMLElement,
      attachments: [attachment({ fileName: "locked.pdf" })],
      captureInvoice: async () => onePixelPng,
      loadAttachment: async () => { throw new Error("Password protected PDF."); },
    })).rejects.toThrow('Unable to include "locked.pdf": Password protected PDF.');
  });
});

describe("shipmentPrintBundleFileName", () => {
  it("creates a filesystem-safe descriptive PDF name", () => {
    expect(shipmentPrintBundleFileName(" INV/2026: 1042 ")).toBe("Shipment-INV-2026-1042-documents.pdf");
  });
});
