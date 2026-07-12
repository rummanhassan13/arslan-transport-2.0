import { createClient } from "npm:@supabase/supabase-js@2";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const allowedPdfType = "application/pdf";
const maxImageSize = 5 * 1024 * 1024;
const maxPdfSize = 10 * 1024 * 1024;
const uploadExpirySeconds = 15 * 60;
const allowedCategories = [
  "bill",
  "receipt",
  "gate_pass",
  "fashah",
  "naql",
  "loading_slip",
  "unloading_slip",
  "proof_of_delivery",
  "invoice_support",
  "driver_document",
  "client_document",
  "other",
];

class FunctionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type CreateUploadInput = {
  organizationId?: string;
  shipmentId?: string;
  expenseId?: string;
  shipmentExpenseId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  organization_id?: string;
  shipment_id?: string;
  shipment_expense_id?: string;
  category?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://www.arslantransportadmin.com",
    "https://arslantransportadmin.com",
  ];

  const envAllowed = Deno.env.get("ALLOWED_ORIGIN");
  const extraOrigins = envAllowed ? envAllowed.split(",").map((o) => o.trim()) : [];
  let allowedOrigin = "null";

  if (origin) {
    if (
      allowedOrigins.includes(origin) ||
      extraOrigins.includes(origin) ||
      /^https?:\/\/localhost:\d+$/.test(origin)
    ) {
      allowedOrigin = origin;
    }
  }

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...cors,
    },
  });
}

function errorJson(error: FunctionError | Error, cors: Record<string, string> = {}) {
  if (error instanceof FunctionError) {
    return json({ error: error.message, code: error.code }, error.status, cors);
  }

  return json({ error: "Unexpected Edge Function error.", code: "UNEXPECTED_ERROR" }, 500, cors);
}

function required(name: string, code = "CONFIG_MISSING", message = "Server configuration is missing.") {
  const value = Deno.env.get(name);
  if (!value) throw new FunctionError(code, message, 500);
  return value;
}

function assertR2Config() {
  required("R2_ACCOUNT_ID", "R2_CONFIG_MISSING", "R2 configuration is missing.");
  required("R2_ACCESS_KEY_ID", "R2_CONFIG_MISSING", "R2 configuration is missing.");
  required("R2_SECRET_ACCESS_KEY", "R2_CONFIG_MISSING", "R2 configuration is missing.");
  required("R2_BUCKET_NAME", "R2_CONFIG_MISSING", "R2 configuration is missing.");
  required("R2_ENDPOINT", "R2_CONFIG_MISSING", "R2 configuration is missing.");
}

function safeFileName(fileName: string) {
  return (
    fileName
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 120) || "attachment"
  );
}

function validateFile(fileType: string, fileSize: number) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "File size must be greater than zero.";
  }

  if (!allowedImageTypes.includes(fileType) && fileType !== allowedPdfType) {
    return "Unsupported file type. Upload JPG, PNG, WebP, or PDF files only.";
  }

  if (allowedImageTypes.includes(fileType) && fileSize > maxImageSize) {
    return "Image is too large. Images must be 5MB or smaller.";
  }

  if (fileType === allowedPdfType && fileSize > maxPdfSize) {
    return "PDF is too large. PDFs must be 10MB or smaller.";
  }

  return null;
}

async function getUser(req: Request) {
  const supabaseUrl = required("SUPABASE_URL", "SUPABASE_CONFIG_MISSING", "Supabase configuration is missing.");
  const supabaseServiceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_CONFIG_MISSING", "Supabase configuration is missing.");
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization) throw new FunctionError("UNAUTHORIZED", "Authentication required.", 401);
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw new FunctionError("UNAUTHORIZED", "Authentication required.", 401);

  const userResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  const user = userResponse.ok ? await userResponse.json() : null;
  if (!user?.id) throw new FunctionError("UNAUTHORIZED", "Authentication required.", 401);

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return { supabase, user };
}

async function getMembership(supabase: ReturnType<typeof createClient>, organizationId: string, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new FunctionError("ORG_ACCESS_CHECK_FAILED", `Unable to verify organization access: ${error.message}`, 500);
  if (!data) throw new FunctionError("ORG_ACCESS_DENIED", "You do not have access to this organization.", 403);
  return data as { id: string; role: string };
}

async function assertExpenseBelongsToOrganization(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  shipmentId: string,
  expenseId: string,
) {
  const { data, error } = await supabase
    .from("shipment_expenses")
    .select("id")
    .eq("id", expenseId)
    .eq("shipment_id", shipmentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new FunctionError("EXPENSE_CHECK_FAILED", `Unable to verify expense: ${error.message}`, 500);
  if (!data) throw new FunctionError("EXPENSE_NOT_FOUND", "Expense not found for this organization and shipment.", 404);
}

async function assertShipmentBelongsToOrganization(
  supabase: ReturnType<typeof createClient>,
  shipmentId: string,
) {
  const { data, error } = await supabase
    .from("shipments")
    .select("id, organization_id")
    .eq("id", shipmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new FunctionError("SHIPMENT_CHECK_FAILED", `Unable to verify shipment: ${error.message}`, 500);
  if (!data) throw new FunctionError("SHIPMENT_NOT_FOUND", "Shipment not found for this organization.", 404);
  return data as { id: string; organization_id: string };
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT", "R2_CONFIG_MISSING", "R2 configuration is missing."),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID", "R2_CONFIG_MISSING", "R2 configuration is missing."),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY", "R2_CONFIG_MISSING", "R2 configuration is missing."),
    },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return json({ ok: true }, 200, cors);
  if (req.method !== "POST") return json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }, 405, cors);

  try {
    assertR2Config();
    const body = (await req.json()) as CreateUploadInput;
    const shipmentId = body.shipment_id ?? body.shipmentId;
    const shipmentExpenseId = body.shipment_expense_id ?? body.shipmentExpenseId ?? body.expenseId;
    const category = body.category ?? "other";
    const fileName = body.file_name ?? body.fileName;
    const fileType = body.file_type ?? body.fileType;
    const fileSize = Number(body.file_size ?? body.fileSize);

    const { supabase, user } = await getUser(req);

    if (!shipmentId) {
      throw new FunctionError("MISSING_SHIPMENT_ID", "shipment_id is required.", 400);
    }
    if (!fileName || !fileType || !Number.isFinite(fileSize)) {
      throw new FunctionError("MISSING_FILE_FIELDS", "file_name, file_type, and file_size are required.", 400);
    }
    if (!allowedCategories.includes(category)) {
      throw new FunctionError("INVALID_CATEGORY", "Unsupported shipment attachment category.", 400);
    }

    const shipment = await assertShipmentBelongsToOrganization(supabase, shipmentId);
    const organizationId = shipment.organization_id;
    const membership = await getMembership(supabase, organizationId, user.id);
    if (membership.role === "viewer") {
      throw new FunctionError("FORBIDDEN_ROLE", "Viewers cannot upload shipment attachments.", 403);
    }

    const validationError = validateFile(fileType, fileSize);
    if (validationError) {
      const code = validationError.includes("Unsupported") ? "INVALID_FILE_TYPE" : validationError.includes("large") ? "FILE_TOO_LARGE" : "INVALID_FILE_SIZE";
      throw new FunctionError(code, validationError, 400);
    }

    if (shipmentExpenseId) {
      await assertExpenseBelongsToOrganization(supabase, organizationId, shipmentId, shipmentExpenseId);
    }

    const objectKey = `organizations/${organizationId}/shipments/${shipmentId}/${category}/${Date.now()}-${safeFileName(fileName)}`;
    const expiresAt = new Date(Date.now() + uploadExpirySeconds * 1000).toISOString();

    const bucketName = required("R2_BUCKET_NAME", "R2_CONFIG_MISSING", "R2 configuration is missing.");
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: fileType,
    });
    let signedUploadUrl: string;
    try {
      signedUploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: uploadExpirySeconds });
    } catch {
      throw new FunctionError("R2_SIGNING_FAILED", "Unable to create signed R2 upload URL.", 500);
    }

    return json({
      signedUploadUrl,
      signed_upload_url: signedUploadUrl,
      objectKey,
      storageKey: objectKey,
      storage_key: objectKey,
      bucketName,
      bucket_name: bucketName,
      storageProvider: "r2",
      storage_provider: "r2",
      method: "PUT",
      headers: {
        "content-type": fileType,
      },
      expiresAt,
      expires_at: expiresAt,
    }, 200, cors);
  } catch (error) {
    return errorJson(error instanceof Error ? error : new Error("Unexpected error."), cors);
  }
});
