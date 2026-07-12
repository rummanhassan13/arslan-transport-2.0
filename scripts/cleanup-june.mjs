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
  let readXlsxFile;
  try {
    ({ default: readXlsxFile } = await import("read-excel-file/node"));
  } catch {
    console.error("read-excel-file missing");
    process.exit(1);
  }

  const matrix = await readXlsxFile("import-data/June - Data.xlsx");
  const [headerRow = [], ...dataRows] = matrix;
  const headers = headerRow.map((value) => String(value ?? "").trim());
  const rows = dataRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]])));

  const invoiceNumbers = rows
    .map((r) => r.invoice_number?.toString().trim())
    .filter(Boolean);

  if (invoiceNumbers.length === 0) {
    console.error("No invoice numbers found in June file.");
    process.exit(1);
  }

  console.log(`Found ${invoiceNumbers.length} invoice numbers. Fetching shipments...`);

  // Fetch all matching shipments for the organization Arslan Transport
  // Wait, let's get the organization ID first
  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "arslan-transport")
    .single();

  if (orgError) {
    console.error("Org error", orgError);
    process.exit(1);
  }
  const orgId = orgData.id;

  const { data: shipments, error: shipmentsError } = await supabase
    .from("shipments")
    .select("id, invoice_reference")
    .eq("organization_id", orgId)
    .in("invoice_reference", invoiceNumbers);

  if (shipmentsError) {
    console.error("Shipments fetch error", shipmentsError);
    process.exit(1);
  }

  const shipmentIds = shipments.map((s) => s.id);
  console.log(`Found ${shipmentIds.length} existing shipments to delete.`);

  if (shipmentIds.length > 0) {
    // Delete driver_payments
    const { error: dpError } = await supabase
      .from("driver_payments")
      .delete()
      .in("shipment_id", shipmentIds);

    if (dpError) {
      console.error("Error deleting driver payments", dpError);
    } else {
      console.log("Deleted related driver payments.");
    }

    // Delete invoices (cascade deletes invoice_items)
    const { error: invError } = await supabase
      .from("invoices")
      .delete()
      .in("shipment_id", shipmentIds);
      
    if (invError) console.error("Error deleting invoices", invError);

    // Delete shipments (cascade deletes shipment_expenses)
    const { error: shError } = await supabase
      .from("shipments")
      .delete()
      .in("id", shipmentIds);

    if (shError) {
      console.error("Error deleting shipments", shError);
    } else {
      console.log("Deleted shipments.");
    }
  }

  console.log("Cleanup complete!");
}

main();
