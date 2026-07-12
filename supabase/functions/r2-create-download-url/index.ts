import { createClient } from "npm:@supabase/supabase-js@2";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const downloadExpirySeconds = 10 * 60;

type CreateDownloadInput = {
  attachmentId?: string;
  attachment_id?: string;
  table?: "shipment_attachments" | "expense_attachments";
};

class FunctionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

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

async function assertMembership(supabase: ReturnType<typeof createClient>, organizationId: string, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new FunctionError("ORG_ACCESS_CHECK_FAILED", `Unable to verify organization access: ${error.message}`, 500);
  if (!data) throw new FunctionError("ORG_ACCESS_DENIED", "You do not have access to this organization.", 403);
}

async function assertShipmentBelongsToOrganization(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  shipmentId: string,
) {
  const { data, error } = await supabase
    .from("shipments")
    .select("id")
    .eq("id", shipmentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new FunctionError("SHIPMENT_CHECK_FAILED", `Unable to verify shipment: ${error.message}`, 500);
  if (!data) throw new FunctionError("SHIPMENT_NOT_FOUND", "Attachment shipment was not found for this organization.", 404);
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
    const body = (await req.json()) as CreateDownloadInput;
    const { supabase, user } = await getUser(req);
    const attachmentId = body.attachment_id ?? body.attachmentId;
    if (!attachmentId) {
      throw new FunctionError("MISSING_ATTACHMENT_ID", "attachment_id is required.", 400);
    }

    const table = body.table ?? "shipment_attachments";
    const { data, error } = await supabase
      .from(table)
      .select(table === "shipment_attachments" ? "organization_id, shipment_id, storage_key, file_name, file_type" : "organization_id, shipment_id, object_key, file_name, file_type")
      .eq("id", attachmentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new FunctionError("ATTACHMENT_LOAD_FAILED", `Unable to load attachment metadata: ${error.message}`, 500);
    if (!data) throw new FunctionError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);

    const metadata = data as {
      organization_id: string;
      shipment_id: string;
      storage_key?: string;
      object_key?: string;
      file_name?: string;
      file_type?: string;
    };
    const organizationId = metadata.organization_id;
    const objectKey = table === "shipment_attachments" ? metadata.storage_key : metadata.object_key;
    if (!objectKey) throw new FunctionError("STORAGE_KEY_MISSING", "Attachment storage key is missing.", 400);

    await assertMembership(supabase, organizationId, user.id);
    await assertShipmentBelongsToOrganization(supabase, organizationId, metadata.shipment_id);

    const expiresAt = new Date(Date.now() + downloadExpirySeconds * 1000).toISOString();

    // Enforce Content-Disposition: attachment for non-images
    const isImage = metadata.file_type && ["image/jpeg", "image/png", "image/webp"].includes(metadata.file_type);
    const getObjectParams: any = {
      Bucket: required("R2_BUCKET_NAME", "R2_CONFIG_MISSING", "R2 configuration is missing."),
      Key: objectKey,
    };

    if (!isImage) {
      const safeName = metadata.file_name ? metadata.file_name.replace(/["\\]/g, "") : "attachment";
      getObjectParams.ResponseContentDisposition = `attachment; filename="${safeName}"`;
    }

    const command = new GetObjectCommand(getObjectParams);
    let signedDownloadUrl: string;
    try {
      signedDownloadUrl = await getSignedUrl(r2Client(), command, { expiresIn: downloadExpirySeconds });
    } catch {
      throw new FunctionError("R2_SIGNING_FAILED", "Unable to create signed R2 download URL.", 500);
    }

    return json({
      signedDownloadUrl,
      signed_download_url: signedDownloadUrl,
      fileName: metadata.file_name ?? null,
      file_name: metadata.file_name ?? null,
      fileType: metadata.file_type ?? null,
      file_type: metadata.file_type ?? null,
      expiresAt,
      expires_at: expiresAt,
    }, 200, cors);
  } catch (error) {
    return errorJson(error instanceof Error ? error : new Error("Unexpected error."), cors);
  }
});
