import { requireSupabaseClient } from "../lib/supabase";
import { createAttachmentMetadata } from "./attachmentService";
import type { ExpenseAttachment, ExpenseAttachmentInput } from "../types/domain";
import { getAttachmentKind, validateAttachmentFile } from "../utils/fileValidation";

type UploadUrlInput = {
  organizationId: string;
  shipmentId: string;
  expenseId?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
};

type UploadUrlResponse = {
  signedUploadUrl: string;
  objectKey: string;
  bucketName: string;
  storageProvider: "r2";
  headers?: Record<string, string>;
};

type DownloadUrlResponse = {
  signedDownloadUrl: string;
};

export async function requestUploadUrl(input: UploadUrlInput): Promise<UploadUrlResponse> {
  const supabase = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Unable to read current session: ${sessionError.message}`);
  if (!sessionData.session?.access_token) throw new Error("You must be logged in to upload attachments.");

  const { data, error } = await supabase.functions.invoke("r2-create-upload-url", {
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: {
      ...input,
    },
  });

  if (error) throw new Error(`Unable to request upload URL: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data as UploadUrlResponse;
}

export async function uploadFileToSignedUrl(
  file: File,
  signedUploadUrl: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(signedUploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      ...headers,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}.`);
  }
}

export async function requestDownloadUrl(attachmentId: string): Promise<string> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke("r2-create-download-url", {
    body: {
      attachmentId,
      table: "expense_attachments",
    },
  });

  if (error) throw new Error(`Unable to request download URL: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return (data as DownloadUrlResponse).signedDownloadUrl;
}

async function compressImage(file: File) {
  if (getAttachmentKind(file.type) !== "image") {
    return { file, compressed: false };
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { file, compressed: false };
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.82));
    if (!blob || blob.size >= file.size) return { file, compressed: false };

    return {
      file: new File([blob], file.name, { type: file.type, lastModified: Date.now() }),
      compressed: true,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function prepareAttachmentFile(file: File) {
  const validation = validateAttachmentFile(file);
  if (!validation.ok) {
    throw new Error(validation.error || "Unsupported attachment.");
  }

  if (getAttachmentKind(file.type) === "image") {
    return compressImage(file);
  }

  return { file, compressed: false };
}

export async function uploadAttachment(
  file: File,
  metadata: Pick<ExpenseAttachmentInput, "shipmentId" | "expenseId">,
  organizationId: string,
): Promise<ExpenseAttachment> {
  if (!metadata.expenseId) {
    throw new Error("Select an expense record before uploading an attachment.");
  }

  const prepared = await prepareAttachmentFile(file);
  const uploadTarget = await requestUploadUrl({
    organizationId,
    shipmentId: metadata.shipmentId,
    expenseId: metadata.expenseId,
    fileName: prepared.file.name,
    fileType: prepared.file.type,
    fileSize: prepared.file.size,
  });

  await uploadFileToSignedUrl(prepared.file, uploadTarget.signedUploadUrl, uploadTarget.headers);

  return createAttachmentMetadata(organizationId, {
    shipmentId: metadata.shipmentId,
    expenseId: metadata.expenseId ?? null,
    storageProvider: uploadTarget.storageProvider,
    bucketName: uploadTarget.bucketName,
    objectKey: uploadTarget.objectKey,
    fileName: prepared.file.name,
    fileType: prepared.file.type,
    fileSize: prepared.file.size,
    compressed: prepared.compressed,
  });
}
