type DatabaseError = { code?: string; message: string };

const DUPLICATE_MESSAGES = {
  driver: "A driver with this name and phone number already exists. Pick them from the list instead.",
  vehicle: "A vehicle with this plate number already exists. Pick it from the list instead.",
  "truck type": "This truck type already exists. Pick it from the list instead.",
} as const;

/**
 * Turns a database error from saving a driver, vehicle or truck type into a readable one.
 * Duplicates are blocked by unique indexes (see supabase/scripts/import_drivers_2026_11.sql
 * and the vehicles plate constraint), which Postgres reports as code 23505.
 */
export function masterDataError(action: "create" | "update", entity: keyof typeof DUPLICATE_MESSAGES, error: DatabaseError) {
  if (error.code === "23505" || /duplicate key/i.test(error.message)) {
    return new Error(DUPLICATE_MESSAGES[entity]);
  }
  return new Error(`Unable to ${action} ${entity}: ${error.message}`);
}
