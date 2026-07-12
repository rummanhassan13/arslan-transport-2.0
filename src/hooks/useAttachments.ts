import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createAttachmentMetadata as createSupabaseAttachmentMetadata,
  listAttachments,
  listAttachmentsByExpense,
  listAttachmentsByShipment,
  softDeleteAttachment,
  updateAttachmentMetadata as updateSupabaseAttachmentMetadata,
} from "../services/attachmentService";
import {
  requestDownloadUrl,
  uploadAttachment as uploadAttachmentToR2,
} from "../services/attachmentUploadService";
import type { AttachmentFilters, ExpenseAttachment, ExpenseAttachmentInput, ExpenseAttachmentUpdateInput, Shipment } from "../types/domain";
import { useAuth } from "./useAuth";

function buildDemoAttachments(shipments: Shipment[]): ExpenseAttachment[] {
  return shipments.flatMap((shipment) =>
    shipment.billImages.map((image) => ({
      id: `demo-attachment-${image.id}`,
      organizationId: "demo-organization",
      shipmentId: shipment.id,
      expenseId: null,
      storageProvider: "r2" as const,
      bucketName: "demo-expense-attachments",
      objectKey: `demo/${shipment.id}/${image.name}`,
      fileName: image.name,
      fileType: image.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      fileSize: null,
      compressed: false,
      uploadedBy: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })),
  );
}

export function useAttachments(shipments: Shipment[] = []) {
  const { activeOrganization } = useAuth();
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>(() => buildDemoAttachments(shipments));
  const [filters, setFilters] = useState<AttachmentFilters>({});
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);
  const organizationId = activeOrganization?.id ?? null;

  useEffect(() => {
    if (!env.demoMode) return;

    setAttachments((current) => {
      const ids = new Set(current.map((attachment) => attachment.id));
      const derived = buildDemoAttachments(shipments).filter((attachment) => !ids.has(attachment.id));
      return [...current, ...derived].filter((attachment) => !attachment.deletedAt);
    });
  }, [shipments]);

  const refreshAttachments = useCallback(async () => {
    if (env.demoMode) {
      setError(null);
      setLoading(false);
      return;
    }

    if (!organizationId) {
      setAttachments([]);
      setError("No active organization is available for loading attachments.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setAttachments(await listAttachments(organizationId, filters));
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Unable to load attachments.");
    } finally {
      setLoading(false);
    }
  }, [filters, organizationId]);

  useEffect(() => {
    void refreshAttachments();
  }, [refreshAttachments]);

  const createAttachmentMetadata = useCallback(
    async (input: ExpenseAttachmentInput) => {
      if (env.demoMode) {
        const created: ExpenseAttachment = {
          id: `demo-attachment-${crypto.randomUUID()}`,
          organizationId: "demo-organization",
          shipmentId: input.shipmentId,
          expenseId: input.expenseId ?? null,
          storageProvider: input.storageProvider ?? "r2",
          bucketName: input.bucketName,
          objectKey: input.objectKey,
          fileName: input.fileName,
          fileType: input.fileType ?? null,
          fileSize: input.fileSize ?? null,
          compressed: input.compressed ?? false,
          uploadedBy: null,
          createdAt: new Date().toISOString(),
          deletedAt: null,
        };
        setAttachments((current) => [created, ...current]);
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating attachment metadata.");

      const created = await createSupabaseAttachmentMetadata(organizationId, input);
      setAttachments((current) => [created, ...current]);
      return created;
    },
    [organizationId],
  );

  const uploadAttachment = useCallback(
    async (file: File, metadata: Pick<ExpenseAttachmentInput, "shipmentId" | "expenseId">) => {
      if (env.demoMode) {
        return createAttachmentMetadata({
          shipmentId: metadata.shipmentId,
          expenseId: metadata.expenseId ?? null,
          storageProvider: "r2",
          bucketName: "demo-expense-attachments",
          objectKey: `demo/${metadata.shipmentId}/${file.name}`,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          compressed: false,
        });
      }

      if (!organizationId) throw new Error("No active organization is available for uploading attachments.");

      const uploaded = await uploadAttachmentToR2(file, metadata, organizationId);
      setAttachments((current) => [uploaded, ...current]);
      return uploaded;
    },
    [createAttachmentMetadata, organizationId],
  );

  const getSignedDownloadUrl = useCallback(async (attachmentId: string) => {
    if (env.demoMode) {
      throw new Error("Signed download URLs are available only after real storage upload.");
    }

    return requestDownloadUrl(attachmentId);
  }, []);

  const updateAttachmentMetadata = useCallback(async (attachmentId: string, input: ExpenseAttachmentUpdateInput) => {
    if (env.demoMode) {
      let updatedAttachment: ExpenseAttachment | null = null;
      setAttachments((current) =>
        current.map((attachment) => {
          if (attachment.id !== attachmentId) return attachment;
          updatedAttachment = { ...attachment, ...input };
          return updatedAttachment;
        }),
      );
      return updatedAttachment;
    }

    if (!organizationId) throw new Error("No active organization is available for updating attachments.");

    const updated = await updateSupabaseAttachmentMetadata(organizationId, attachmentId, input);
    setAttachments((current) => current.map((attachment) => (attachment.id === attachmentId ? updated : attachment)));
    return updated;
  }, [organizationId]);

  const deleteAttachment = useCallback(async (attachmentId: string) => {
    if (env.demoMode) {
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting attachments.");

    await softDeleteAttachment(organizationId, attachmentId);
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, [organizationId]);

  const listByShipment = useCallback(
    async (shipmentId: string) => {
      if (env.demoMode) return attachments.filter((attachment) => attachment.shipmentId === shipmentId && !attachment.deletedAt);
      if (!organizationId) throw new Error("No active organization is available for loading shipment attachments.");
      return listAttachmentsByShipment(organizationId, shipmentId);
    },
    [attachments, organizationId],
  );

  const listByExpense = useCallback(
    async (expenseId: string) => {
      if (env.demoMode) return attachments.filter((attachment) => attachment.expenseId === expenseId && !attachment.deletedAt);
      if (!organizationId) throw new Error("No active organization is available for loading expense attachments.");
      return listAttachmentsByExpense(organizationId, expenseId);
    },
    [attachments, organizationId],
  );

  const activeAttachments = useMemo(() => attachments.filter((attachment) => !attachment.deletedAt), [attachments]);

  return {
    attachments: activeAttachments,
    loading,
    error,
    filters,
    setFilters,
    refreshAttachments,
    createAttachmentMetadata,
    uploadAttachment,
    getSignedDownloadUrl,
    updateAttachmentMetadata,
    deleteAttachment,
    listByShipment,
    listByExpense,
  };
}
