import { useCallback, useEffect, useMemo, useState } from "react";
import { env } from "../config/env";
import {
  createShipmentAttachmentMetadata as createSupabaseShipmentAttachmentMetadata,
  listExpenseAttachments as listSupabaseExpenseAttachments,
  listShipmentAttachments as listSupabaseShipmentAttachments,
  listAttachmentsForShipmentIds as listSupabaseAttachmentsForShipmentIds,
  softDeleteShipmentAttachment as softDeleteSupabaseShipmentAttachment,
  updateShipmentAttachmentNotes as updateSupabaseShipmentAttachmentNotes,
} from "../services/shipmentAttachments";
import type { ShipmentAttachment, ShipmentAttachmentInput } from "../types/domain";
import { useAuth } from "./useAuth";

const DEMO_SHIPMENT_ATTACHMENTS_KEY = "transportflow_demo_shipment_attachments";
const SHIPMENT_ATTACHMENTS_CHANGED_EVENT = "transportflow:shipment-attachments-changed";

function readDemoShipmentAttachments(): ShipmentAttachment[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_SHIPMENT_ATTACHMENTS_KEY) ?? "[]") as ShipmentAttachment[];
  } catch {
    return [];
  }
}

function writeDemoShipmentAttachments(attachments: ShipmentAttachment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_SHIPMENT_ATTACHMENTS_KEY, JSON.stringify(attachments));
}

function notifyShipmentAttachmentsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHIPMENT_ATTACHMENTS_CHANGED_EVENT));
}

function createDemoAttachment(input: ShipmentAttachmentInput): ShipmentAttachment {
  const now = new Date().toISOString();
  return {
    id: `demo-shipment-attachment-${crypto.randomUUID()}`,
    organizationId: "demo-organization",
    shipmentId: input.shipmentId,
    shipmentExpenseId: input.shipmentExpenseId ?? null,
    category: input.category ?? "other",
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    storageKey: input.storageKey,
    uploadedBy: null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function useShipmentAttachments(shipmentIdOrIds?: string | string[]) {
  const { activeOrganization } = useAuth();
  const organizationId = activeOrganization?.id ?? null;
  const [attachments, setAttachments] = useState<ShipmentAttachment[]>(() => readDemoShipmentAttachments());
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);

  const shipmentIdsString = Array.isArray(shipmentIdOrIds) ? shipmentIdOrIds.sort().join(",") : shipmentIdOrIds;

  const refreshAttachments = useCallback(async () => {
    if (env.demoMode) {
      setAttachments(readDemoShipmentAttachments());
      setLoading(false);
      setError(null);
      return;
    }

    if (!organizationId || (!shipmentIdOrIds && !Array.isArray(shipmentIdOrIds))) {
      setAttachments([]);
      setLoading(false);
      setError(!organizationId ? "No active organization is available for loading shipment attachments." : null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (Array.isArray(shipmentIdOrIds)) {
        setAttachments(await listSupabaseAttachmentsForShipmentIds(organizationId, shipmentIdOrIds, 1000));
      } else {
        setAttachments(await listSupabaseShipmentAttachments(organizationId, shipmentIdOrIds));
      }
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Unable to load shipment attachments.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, shipmentIdsString]);

  useEffect(() => {
    void refreshAttachments();
  }, [refreshAttachments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => void refreshAttachments();
    window.addEventListener(SHIPMENT_ATTACHMENTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SHIPMENT_ATTACHMENTS_CHANGED_EVENT, refresh);
  }, [refreshAttachments]);

  const createAttachmentMetadata = useCallback(
    async (input: ShipmentAttachmentInput) => {
      if (env.demoMode) {
        const created = createDemoAttachment(input);
        setAttachments((current) => {
          const next = [created, ...current];
          writeDemoShipmentAttachments(next);
          return next;
        });
        notifyShipmentAttachmentsChanged();
        return created;
      }

      if (!organizationId) throw new Error("No active organization is available for creating shipment attachment metadata.");
      const created = await createSupabaseShipmentAttachmentMetadata(organizationId, input);
      setAttachments((current) => [created, ...current]);
      notifyShipmentAttachmentsChanged();
      return created;
    },
    [organizationId],
  );

  const updateAttachmentNotes = useCallback(async (id: string, notes: string | null) => {
    if (env.demoMode) {
      let updated: ShipmentAttachment | null = null;
      setAttachments((current) => {
        const next = current.map((attachment) => {
          if (attachment.id !== id) return attachment;
          updated = { ...attachment, notes, updatedAt: new Date().toISOString() };
          return updated;
        });
        writeDemoShipmentAttachments(next);
        return next;
      });
      notifyShipmentAttachmentsChanged();
      return updated;
    }

    if (!organizationId) throw new Error("No active organization is available for updating attachment notes.");

    const updated = await updateSupabaseShipmentAttachmentNotes(organizationId, id, notes);
    setAttachments((current) => current.map((attachment) => (attachment.id === id ? updated : attachment)));
    notifyShipmentAttachmentsChanged();
    return updated;
  }, [organizationId]);

  const deleteAttachment = useCallback(async (id: string) => {
    if (env.demoMode) {
      setAttachments((current) => {
        const next = current.filter((attachment) => attachment.id !== id);
        writeDemoShipmentAttachments(next);
        return next;
      });
      notifyShipmentAttachmentsChanged();
      return;
    }

    if (!organizationId) throw new Error("No active organization is available for deleting attachments.");

    await softDeleteSupabaseShipmentAttachment(organizationId, id);
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    notifyShipmentAttachmentsChanged();
  }, [organizationId]);

  const listByExpense = useCallback(
    async (shipmentExpenseId: string) => {
      if (env.demoMode) {
        return attachments.filter((attachment) => attachment.shipmentExpenseId === shipmentExpenseId && !attachment.deletedAt);
      }
      const activeShipmentId = Array.isArray(shipmentIdOrIds) ? null : shipmentIdOrIds;
      if (!organizationId || !activeShipmentId) throw new Error("No active shipment context is available for loading expense attachments.");
      return listSupabaseExpenseAttachments(organizationId, activeShipmentId, shipmentExpenseId);
    },
    [attachments, organizationId, shipmentIdOrIds],
  );

  const visibleAttachments = useMemo(
    () => attachments.filter((attachment) => {
      if (attachment.deletedAt) return false;
      if (!shipmentIdOrIds) return true;
      if (Array.isArray(shipmentIdOrIds)) return shipmentIdOrIds.includes(attachment.shipmentId);
      return attachment.shipmentId === shipmentIdOrIds;
    }),
    [attachments, shipmentIdOrIds],
  );

  return {
    attachments: visibleAttachments,
    loading,
    error,
    refreshAttachments,
    createAttachmentMetadata,
    updateAttachmentNotes,
    deleteAttachment,
    listByExpense,
  };
}
