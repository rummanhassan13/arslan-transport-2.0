import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.import.local" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: shipments, error } = await supabase
    .from("shipments")
    .select("id, remarks")
    .not("remarks", "is", null);

  if (error) {
    console.error("Error fetching shipments:", error);
    return;
  }

  console.log(`Found ${shipments.length} shipments with remarks.`);

  let updatedCount = 0;

  for (const shipment of shipments) {
    if (!shipment.remarks) continue;

    // Remove the auto-generated remarks
    let cleanedRemarks = shipment.remarks
      .replace(/\[legacy-status:.*?\].*/g, "")
      .replace(/\[previous-import:.*?\].*/g, "")
      .trim();

    if (!cleanedRemarks) cleanedRemarks = null;

    if (cleanedRemarks !== shipment.remarks) {
      const { error: updateError } = await supabase
        .from("shipments")
        .update({ remarks: cleanedRemarks })
        .eq("id", shipment.id);

      if (updateError) {
        console.error(`Failed to update shipment ${shipment.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} shipments.`);
}

main();
