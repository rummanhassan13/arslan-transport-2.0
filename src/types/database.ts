export type OrganizationId = string;
export type UserId = string;
export type MoneyAmount = number;

export type TenantScopedRecord = {
  id: string;
  organization_id: OrganizationId;
  created_at: string;
  updated_at: string;
};

export type DatabaseImplementationStatus = "planned";
