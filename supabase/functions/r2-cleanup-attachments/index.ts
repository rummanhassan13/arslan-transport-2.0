import { createClient } from "npm:@supabase/supabase-js@2";
import { DeleteObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3";

type CleanupJob = {
  id: string;
  object_key: string;
  attempts: number;
  status: "pending" | "failed" | "processing";
};

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT"),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const expectedToken = required("ATTACHMENT_CLEANUP_TOKEN");
    const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!suppliedToken || suppliedToken !== expectedToken) return json({ error: "Unauthorized." }, 401);

    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("attachment_cleanup_jobs")
      .select("id, object_key, attempts, status")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(`Unable to load cleanup jobs: ${error.message}`);

    const client = r2Client();
    const bucket = required("R2_BUCKET_NAME");
    const results: Array<{ id: string; status: "completed" | "failed"; error?: string }> = [];

    for (const job of (data ?? []) as CleanupJob[]) {
      const nextAttempts = job.attempts + 1;
      const { data: claimed, error: claimError } = await supabase
        .from("attachment_cleanup_jobs")
        .update({ status: "processing", attempts: nextAttempts, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["pending", "failed"])
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) continue;

      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: job.object_key }));
        const { error: completeError } = await supabase
          .from("attachment_cleanup_jobs")
          .update({
            status: "completed",
            last_error: null,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        if (completeError) throw new Error(completeError.message);
        results.push({ id: job.id, status: "completed" });
      } catch (cleanupError) {
        const message = cleanupError instanceof Error ? cleanupError.message : "Unknown R2 cleanup error.";
        await supabase
          .from("attachment_cleanup_jobs")
          .update({ status: "failed", last_error: message.slice(0, 2000), updated_at: new Date().toISOString() })
          .eq("id", job.id);
        results.push({ id: job.id, status: "failed", error: message });
      }
    }

    return json({ processed: results.length, results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Cleanup failed." }, 500);
  }
});

