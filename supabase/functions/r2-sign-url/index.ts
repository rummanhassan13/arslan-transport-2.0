import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const allowedPdfType = "application/pdf";
const maxImageSize = 10 * 1024 * 1024;
const maxPdfSize = 20 * 1024 * 1024;
const uploadExpirySeconds = 15 * 60;
const downloadExpirySeconds = 10 * 60;

type CreateUploadInput = {
  action: "createUploadUrl";
  organizationId: string;
  shipmentId: string;
  expenseId?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
};

type CreateDownloadInput = {
  action: "createDownloadUrl";
  attachmentId?: string;
  objectKey?: string;
  organizationId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function safeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function validateFile(fileType: string, fileSize: number) {
  if (!allowedImageTypes.includes(fileType) && fileType !== allowedPdfType) {
    return "Unsupported file type. Upload JPG, PNG, WebP, or PDF files only.";
  }

  if (allowedImageTypes.includes(fileType) && fileSize > maxImageSize) {
    return "Image is too large. Images must be 10MB or smaller before compression.";
  }

  if (fileType === allowedPdfType && fileSize > maxPdfSize) {
    return "PDF is too large. PDFs must be 20MB or smaller for the MVP.";
  }

  return null;
}

async function getUser(req: Request) {
  const supabaseUrl = required("SUPABASE_URL");
  const supabaseAnonKey = required("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { authorization } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required.");
  return { supabase, user: data.user };
}

async function assertMembership(supabase: ReturnType<typeof createClient>, organizationId: string, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`Unable to verify organization access: ${error.message}`);
  if (!data) throw new Error("You do not have access to this organization.");
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = (await req.json()) as CreateUploadInput | CreateDownloadInput;
    const { supabase, user } = await getUser(req);
    const bucketName = required("R2_BUCKET_NAME");
    const s3 = r2Client();

    if (body.action === "createUploadUrl") {
      const validationError = validateFile(body.fileType, body.fileSize);
      if (validationError) return json({ error: validationError }, 400);

      await assertMembership(supabase, body.organizationId, user.id);

      const objectKey = `organizations/${body.organizationId}/shipments/${body.shipmentId}/attachments/${crypto.randomUUID()}-${safeFileName(body.fileName)}`;
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: body.fileType,
      });
      const signedUploadUrl = await getSignedUrl(s3, command, { expiresIn: uploadExpirySeconds });

      return json({
        signedUploadUrl,
        objectKey,
        bucketName,
        storageProvider: "r2",
      });
    }

    if (body.action === "createDownloadUrl") {
      let organizationId = body.organizationId;
      let objectKey = body.objectKey;

      if (body.attachmentId) {
        const { data, error } = await supabase
          .from("expense_attachments")
          .select("organization_id, object_key")
          .eq("id", body.attachmentId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw new Error(`Unable to load attachment metadata: ${error.message}`);
        if (!data) throw new Error("Attachment not found.");
        organizationId = data.organization_id;
        objectKey = data.object_key;
      }

      if (!organizationId || !objectKey) {
        return json({ error: "attachmentId or objectKey + organizationId is required." }, 400);
      }

      await assertMembership(supabase, organizationId, user.id);

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      const signedDownloadUrl = await getSignedUrl(s3, command, { expiresIn: downloadExpirySeconds });

      return json({ signedDownloadUrl });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 400);
  }
});
