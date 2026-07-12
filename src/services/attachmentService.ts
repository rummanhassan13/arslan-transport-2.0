import { requireSupabaseClient } from "../lib/supabase";
import type { AttachmentFilters, ExpenseAttachment, ExpenseAttachmentInput, ExpenseAttachmentUpdateInput } from "../types/domain";

type AttachmentRow = {
  id: string;
  organization_id: string;
  shipment_id: string;
  expense_id: string | null;
  storage_provider: "r2";
  bucket_name: string;
  object_key: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  compressed: boolean;
  uploaded_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

const attachmentSelect =
  "id, organization_id, shipment_id, expense_id, storage_provider, bucket_name, object_key, file_name, file_type, file_size, compressed, uploaded_by, created_at, deleted_at";

function toAttachment(row: AttachmentRow): ExpenseAttachment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    shipmentId: row.shipment_id,
    expenseId: row.expense_id,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    objectKey: row.object_key,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    compressed: row.compressed,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function toAttachmentPayload(input: ExpenseAttachmentInput | ExpenseAttachmentUpdateInput) {
  return {
    ...(input.expenseId !== undefined ? { expense_id: input.expenseId } : {}),
    ...(input.storageProvider !== undefined ? { storage_provider: input.storageProvider } : {}),
    ...(input.bucketName !== undefined ? { bucket_name: input.bucketName } : {}),
    ...(input.objectKey !== undefined ? { object_key: input.objectKey } : {}),
    ...(input.fileName !== undefined ? { file_name: input.fileName } : {}),
    ...(input.fileType !== undefined ? { file_type: input.fileType } : {}),
    ...(input.fileSize !== undefined ? { file_size: input.fileSize } : {}),
    ...(input.compressed !== undefined ? { compressed: input.compressed } : {}),
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listAttachments(organizationId: string, filters: AttachmentFilters = {}): Promise<ExpenseAttachment[]> {
  const supabase = requireSupabaseClient();
  let query = supabase
    .from("expense_attachments")
    .select(attachmentSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.shipmentId) query = query.eq("shipment_id", filters.shipmentId);
  if (filters.expenseId) query = query.eq("expense_id", filters.expenseId);
  if (filters.fileType) query = query.eq("file_type", filters.fileType);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load attachments: ${error.message}`);
  return ((data ?? []) as AttachmentRow[]).map(toAttachment);
}

export async function listAttachmentsByShipment(organizationId: string, shipmentId: string): Promise<ExpenseAttachment[]> {
  return listAttachments(organizationId, { shipmentId });
}

export async function listAttachmentsByExpense(organizationId: string, expenseId: string): Promise<ExpenseAttachment[]> {
  return listAttachments(organizationId, { expenseId });
}

export async function createAttachmentMetadata(organizationId: string, input: ExpenseAttachmentInput): Promise<ExpenseAttachment> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("expense_attachments")
    .insert({
      ...toAttachmentPayload({
        storageProvider: "r2",
        compressed: false,
        ...input,
      }),
      shipment_id: input.shipmentId,
      organization_id: organizationId,
      uploaded_by: userId,
    })
    .select(attachmentSelect)
    .single();

  if (error) throw new Error(`Unable to create attachment metadata: ${error.message}`);
  return toAttachment(data as AttachmentRow);
}

export async function updateAttachmentMetadata(organizationId: string, attachmentId: string, input: ExpenseAttachmentUpdateInput): Promise<ExpenseAttachment> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("expense_attachments")
    .update(toAttachmentPayload(input))
    .eq("id", attachmentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(attachmentSelect)
    .single();

  if (error) throw new Error(`Unable to update attachment metadata: ${error.message}`);
  return toAttachment(data as AttachmentRow);
}

export async function softDeleteAttachment(organizationId: string, attachmentId: string): Promise<void> {
  const supabase = requireSupabaseClient();

  const { error } = await supabase
    .from("expense_attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete attachment metadata: ${error.message}`);
}
