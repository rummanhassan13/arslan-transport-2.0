export const ROLES = ["owner", "admin", "manager", "accountant", "dispatcher", "viewer"] as const;

export type Role = (typeof ROLES)[number];
