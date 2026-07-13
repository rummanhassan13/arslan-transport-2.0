// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipmentAttachment } from "../../types/domain";
import { ShipmentDocumentPreviewModal, ShipmentDocumentThumbnail } from "./ShipmentDocumentViewer";

const { createDownloadUrl } = vi.hoisted(() => ({
  createDownloadUrl: vi.fn(),
}));

vi.mock("../../config/env", () => ({ env: { demoMode: false } }));
vi.mock("../../services/shipmentAttachments", () => ({
  createShipmentAttachmentDownloadUrl: createDownloadUrl,
}));

const attachment: ShipmentAttachment = {
  id: "attachment-1",
  organizationId: "organization-1",
  shipmentId: "shipment-1",
  shipmentExpenseId: null,
  category: "proof_of_delivery",
  fileName: "delivery-proof.jpg",
  fileType: "image/jpeg",
  fileSize: 2048,
  storageKey: "organizations/organization-1/shipments/shipment-1/proof.jpg",
  uploadedBy: "user-1",
  notes: null,
  createdAt: "2026-07-14T10:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
  deletedAt: null,
};

const pdfAttachment: ShipmentAttachment = {
  ...attachment,
  id: "attachment-2",
  fileName: "delivery-document.pdf",
  fileType: "application/pdf",
  storageKey: "organizations/organization-1/shipments/shipment-1/delivery-document.pdf",
};

function ViewerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ShipmentDocumentThumbnail attachment={attachment} onOpen={() => setOpen(true)} />
      {open && <ShipmentDocumentPreviewModal attachment={attachment} onClose={() => setOpen(false)} />}
    </>
  );
}

describe("ShipmentDocumentViewer", () => {
  beforeEach(() => {
    createDownloadUrl.mockReset();
  });

  it("opens the preview immediately and renders the signed image when it arrives", async () => {
    let resolveUrl: ((value: unknown) => void) | undefined;
    createDownloadUrl.mockImplementation(
      () => new Promise((resolve) => {
        resolveUrl = resolve;
      }),
    );

    render(<ViewerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Preview delivery-proof.jpg" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Loading secure preview")).toBeTruthy();

    await act(async () => {
      resolveUrl?.({
        signedDownloadUrl: "https://account.r2.cloudflarestorage.com/proof.jpg?signed=1",
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        expiresAt: "2026-07-14T10:10:00.000Z",
      });
    });

    await waitFor(() => {
      expect(screen.getByAltText(attachment.fileName).getAttribute("src")).toContain("r2.cloudflarestorage.com");
    });
    expect(createDownloadUrl).toHaveBeenCalledWith(attachment.id, "inline");
  });

  it("renders PDFs inline in the full document viewer", async () => {
    createDownloadUrl.mockResolvedValue({
      signedDownloadUrl: "https://account.r2.cloudflarestorage.com/delivery-document.pdf?signed=1",
      fileName: pdfAttachment.fileName,
      fileType: pdfAttachment.fileType,
      expiresAt: "2026-07-14T10:10:00.000Z",
    });

    render(<ShipmentDocumentPreviewModal attachment={pdfAttachment} onClose={() => undefined} />);

    await waitFor(() => {
      const frame = screen.getByTitle(pdfAttachment.fileName);
      expect(frame.getAttribute("src")).toContain("#page=1&toolbar=1");
    });
    expect(createDownloadUrl).toHaveBeenCalledWith(pdfAttachment.id, "inline");
  });
});
