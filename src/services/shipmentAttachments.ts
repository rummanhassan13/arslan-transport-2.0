import { requireSupabaseClient } from "../lib/supabase";
import { SHIPMENT_ATTACHMENT_CATEGORIES } from "../constants/attachmentCategories";
import { env } from "../config/env";
import type {
  ShipmentAttachment,
  ShipmentAttachmentCategory,
  ShipmentAttachmentFilters,
  ShipmentAttachmentInput,
  ShipmentAttachmentUpdateInput,
} from "../types/domain";

type ShipmentAttachmentRow = {
  id: string;
  organization_id: string;
  shipment_id: string;
  shipment_expense_id: string | null;
  category: ShipmentAttachment["category"];
  file_name: string;
  file_type: string;
  file_size: number;
  storage_key: string;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const shipmentAttachmentSelect =
  "id, organization_id, shipment_id, shipment_expense_id, category, file_name, file_type, file_size, storage_key, uploaded_by, notes, created_at, updated_at, deleted_at";

export type ShipmentAttachmentUploadUrlInput = {
  shipmentId: string;
  shipmentExpenseId?: string | null;
  category?: ShipmentAttachmentCategory;
  fileName: string;
  fileType: string;
  fileSize: number;
};

export type ShipmentAttachmentUploadUrlResponse = {
  signedUploadUrl: string;
  storageKey: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type ShipmentAttachmentDownloadUrlResponse = {
  signedDownloadUrl: string;
  fileName: string | null;
  fileType: string | null;
  expiresAt: string;
};

export type ShipmentAttachmentDisposition = "inline" | "attachment";

export type ShipmentAttachmentUploadResponse = {
  storageKey: string;
};

type EdgeFunctionErrorBody = {
  error?: string;
  code?: string;
  details?: unknown;
};

function toShipmentAttachment(row: ShipmentAttachmentRow): ShipmentAttachment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    shipmentId: row.shipment_id,
    shipmentExpenseId: row.shipment_expense_id,
    category: row.category,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size),
    storageKey: row.storage_key,
    uploadedBy: row.uploaded_by,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toShipmentAttachmentPayload(input: ShipmentAttachmentInput | ShipmentAttachmentUpdateInput) {
  return {
    ...("shipmentExpenseId" in input && input.shipmentExpenseId !== undefined ? { shipment_expense_id: input.shipmentExpenseId } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...("fileName" in input && input.fileName !== undefined ? { file_name: input.fileName } : {}),
    ...("fileType" in input && input.fileType !== undefined ? { file_type: input.fileType } : {}),
    ...("fileSize" in input && input.fileSize !== undefined ? { file_size: input.fileSize } : {}),
    ...("storageKey" in input && input.storageKey !== undefined ? { storage_key: input.storageKey } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

function getFunctionUrl(functionName: string) {
  if (!env.supabaseUrl) {
    throw new Error("Supabase URL is not configured.");
  }

  return `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

async function getFunctionHeaders() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Unable to read current session: ${error.message}`);
  if (!data.session?.access_token) throw new Error("You must be logged in to upload documents.");
  if (!env.supabaseKey) throw new Error("Supabase public key is not configured.");

  return {
    apikey: env.supabaseKey,
    Authorization: `Bearer ${data.session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function callEdgeFunction<T>(functionName: string, payload: Record<string, unknown>): Promise<T> {
  const safePayload = { ...payload };

  try {
    const response = await fetch(getFunctionUrl(functionName), {
      method: "POST",
      headers: await getFunctionHeaders(),
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    let body: EdgeFunctionErrorBody & T;
    try {
      body = responseText ? JSON.parse(responseText) : ({} as EdgeFunctionErrorBody & T);
    } catch {
      body = { error: responseText || "Edge Function returned a non-JSON response." } as EdgeFunctionErrorBody & T;
    }

    if (!response.ok || body.error) {
      const message = body.error || "Edge Function returned an error.";
      const code = body.code ? ` [${body.code}]` : "";
      if (import.meta.env.DEV) {
        console.error("Shipment attachment Edge Function failed", {
          functionName,
          status: response.status,
          code: body.code,
          responseBody: body,
          payload: safePayload,
        });
      }
      throw new Error(`Unable to request shipment attachment URL: ${response.status}${code} ${message}`);
    }

    return body;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unable to request shipment attachment URL:")) {
      throw error;
    }
    if (import.meta.env.DEV) {
      console.error("Shipment attachment Edge Function request failed", {
        functionName,
        payload: safePayload,
        error,
      });
    }
    throw error;
  }
}

export async function listShipmentAttachments(
  organizationId: string,
  shipmentId: string,
  filters: Omit<ShipmentAttachmentFilters, "shipmentId"> = {},
): Promise<ShipmentAttachment[]> {
  const supabase = requireSupabaseClient();
  let query = supabase
    .from("shipment_attachments")
    .select(shipmentAttachmentSelect)
    .eq("organization_id", organizationId)
    .eq("shipment_id", shipmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.shipmentExpenseId) query = query.eq("shipment_expense_id", filters.shipmentExpenseId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.fileType) query = query.eq("file_type", filters.fileType);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load shipment attachments: ${error.message}`);
  return ((data ?? []) as ShipmentAttachmentRow[]).map(toShipmentAttachment);
}

export async function listAttachmentsForShipmentIds(
  organizationId: string,
  shipmentIds: string[],
  limit = 25,
): Promise<ShipmentAttachment[]> {
  if (shipmentIds.length === 0) return [];

  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("shipment_attachments")
    .select(shipmentAttachmentSelect)
    .eq("organization_id", organizationId)
    .in("shipment_id", shipmentIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Unable to load shipment attachment references: ${error.message}`);
  return ((data ?? []) as ShipmentAttachmentRow[]).map(toShipmentAttachment);
}

export async function listExpenseAttachments(
  organizationId: string,
  shipmentId: string,
  shipmentExpenseId: string,
): Promise<ShipmentAttachment[]> {
  return listShipmentAttachments(organizationId, shipmentId, { shipmentExpenseId });
}

export async function createShipmentAttachmentMetadata(
  organizationId: string,
  input: ShipmentAttachmentInput,
): Promise<ShipmentAttachment> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("shipment_attachments")
    .insert({
      ...toShipmentAttachmentPayload({ category: "other", ...input }),
      organization_id: organizationId,
      shipment_id: input.shipmentId,
      uploaded_by: userId,
    })
    .select(shipmentAttachmentSelect)
    .single();

  if (error) throw new Error(`Unable to create shipment attachment metadata: ${error.message}`);
  return toShipmentAttachment(data as ShipmentAttachmentRow);
}

export async function updateShipmentAttachmentNotes(organizationId: string, id: string, notes: string | null): Promise<ShipmentAttachment> {
  return updateShipmentAttachmentMetadata(organizationId, id, { notes });
}

export async function updateShipmentAttachmentMetadata(
  organizationId: string,
  id: string,
  input: ShipmentAttachmentUpdateInput,
): Promise<ShipmentAttachment> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("shipment_attachments")
    .update(toShipmentAttachmentPayload(input))
    .eq("id", id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(shipmentAttachmentSelect)
    .single();

  if (error) throw new Error(`Unable to update shipment attachment metadata: ${error.message}`);
  return toShipmentAttachment(data as ShipmentAttachmentRow);
}

export async function softDeleteShipmentAttachment(organizationId: string, id: string): Promise<void> {
  const supabase = requireSupabaseClient();

  const { error } = await supabase
    .from("shipment_attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete shipment attachment metadata: ${error.message}`);
}

export async function createShipmentAttachmentUploadUrl(
  input: ShipmentAttachmentUploadUrlInput,
): Promise<ShipmentAttachmentUploadUrlResponse> {
  const category = input.category ?? "other";
  if (!SHIPMENT_ATTACHMENT_CATEGORIES.includes(category)) {
    throw new Error("Unsupported shipment attachment category.");
  }

  if (env.demoMode) {
    return {
      signedUploadUrl: `demo://shipment-attachments/${input.shipmentId}/${Date.now()}-${input.fileName}`,
      storageKey: `demo/${input.shipmentId}/${category}/${Date.now()}-${input.fileName}`,
      method: "PUT",
      headers: { "content-type": input.fileType },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  const data = await callEdgeFunction<Record<string, any>>("r2-create-upload-url", {
    shipment_id: input.shipmentId,
    shipment_expense_id: input.shipmentExpenseId ?? null,
    category,
    file_name: input.fileName,
    file_type: input.fileType,
    file_size: input.fileSize,
  });

  return {
    signedUploadUrl: data.signedUploadUrl ?? data.signed_upload_url,
    storageKey: data.storageKey ?? data.storage_key,
    method: data.method ?? "PUT",
    headers: data.headers ?? { "content-type": input.fileType },
    expiresAt: data.expiresAt ?? data.expires_at,
  };
}

export async function uploadFileToSignedUrl(file: File, signedUrl: string, headers: Record<string, string> = {}) {
  if (env.demoMode || signedUrl.startsWith("demo://")) return;

  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      ...headers,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Shipment attachment upload failed with status ${response.status}.`);
  }
}

export async function uploadShipmentAttachmentFile(
  file: File,
  input: ShipmentAttachmentUploadUrlInput,
): Promise<ShipmentAttachmentUploadResponse> {
  const category = input.category ?? "other";
  if (!SHIPMENT_ATTACHMENT_CATEGORIES.includes(category)) {
    throw new Error("Unsupported shipment attachment category.");
  }

  if (env.demoMode) {
    return {
      storageKey: `demo/${input.shipmentId}/${category}/${Date.now()}-${input.fileName}`,
    };
  }

  const response = await fetch(getFunctionUrl("r2-create-upload-url"), {
    method: "PUT",
    headers: {
      ...(await getFunctionHeaders()),
      "Content-Type": file.type,
      "x-shipment-id": input.shipmentId,
      "x-shipment-expense-id": input.shipmentExpenseId ?? "",
      "x-attachment-category": category,
      "x-file-name": input.fileName,
      "x-file-type": input.fileType,
      "x-file-size": String(input.fileSize),
    },
    body: file,
  });
  const responseText = await response.text();
  let body: EdgeFunctionErrorBody & Record<string, unknown>;
  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = { error: responseText || "Attachment upload returned a non-JSON response." };
  }

  if (!response.ok || body.error || typeof body.storageKey !== "string") {
    const message = body.error || "Attachment upload failed.";
    const code = body.code ? ` [${body.code}]` : "";
    throw new Error(`Unable to upload shipment attachment: ${response.status}${code} ${message}`);
  }

  return { storageKey: body.storageKey };
}

export async function createShipmentAttachmentDownloadUrl(
  attachmentId: string,
  disposition: ShipmentAttachmentDisposition = "inline",
): Promise<ShipmentAttachmentDownloadUrlResponse> {
  if (env.demoMode) {
    return {
      signedDownloadUrl: "",
      fileName: null,
      fileType: null,
      expiresAt: new Date().toISOString(),
    };
  }

  const data = await callEdgeFunction<Record<string, any>>("r2-create-download-url", {
    attachment_id: attachmentId,
    table: "shipment_attachments",
    response_disposition: disposition,
  });

  return {
    signedDownloadUrl: data.signedDownloadUrl ?? data.signed_download_url,
    fileName: data.fileName ?? data.file_name ?? null,
    fileType: data.fileType ?? data.file_type ?? null,
    expiresAt: data.expiresAt ?? data.expires_at,
  };
}
