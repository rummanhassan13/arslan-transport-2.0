import { readFile } from "node:fs/promises";
import process from "node:process";

const migrationPaths = [
  new URL("../supabase/migrations/015_logic_integrity_workflows.sql", import.meta.url),
  new URL("../supabase/migrations/016_payment_void_workflows.sql", import.meta.url),
  new URL("../supabase/migrations/017_automatic_shipment_invoice.sql", import.meta.url),
];
const sql = (await Promise.all(migrationPaths.map((migrationPath) => readFile(migrationPath, "utf8")))).join("\n");
const requiredFragments = [
  "save_shipment_with_assignments",
  "generate_invoice_for_shipment",
  "transition_shipment_status",
  "transition_invoice_lifecycle",
  "record_client_payment",
  "record_driver_payment",
  "reverse_client_payment",
  "reverse_driver_payment",
  "void_client_payment",
  "void_driver_payment",
  "payment_voided",
  "create_shipment_with_invoice",
  "'automatic', true",
  "validate_shipment_expense_treatment",
  "prevent_legacy_financial_writes",
  "attachment_cleanup_jobs",
  "audit_logs",
  "security invoker",
  "has_org_role",
];

const missing = requiredFragments.filter((fragment) => !sql.toLowerCase().includes(fragment.toLowerCase()));
if (missing.length) {
  console.error(`Logic migration is missing required controls: ${missing.join(", ")}`);
  process.exit(1);
}

const transactionFunctions = (sql.match(/create or replace function public\./gi) ?? []).length;
if (transactionFunctions < 10) {
  console.error(`Expected at least 10 workflow/validation functions, found ${transactionFunctions}.`);
  process.exit(1);
}

console.log(`Logic migration validation passed (${transactionFunctions} functions, ${requiredFragments.length} required controls across migrations 015-017).`);
