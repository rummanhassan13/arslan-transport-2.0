import type { Role } from "../constants/roles";

export function canViewFinance(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "accountant" || role === "viewer";
}

export function canViewProfit(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "accountant" || role === "viewer";
}

export function canManagePayments(role: Role | null) {
  return role === "owner" || role === "admin" || role === "accountant";
}

export function canManageInvoices(role: Role | null) {
  return role === "owner" || role === "admin" || role === "accountant";
}

export function canManageShipments(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "dispatcher";
}

export function canManageClients(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "accountant";
}

export function canManageDrivers(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "dispatcher";
}

export function canManageVehicles(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "dispatcher";
}

export function canManageTruckTypes(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "dispatcher";
}

export function canManageExpenses(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "accountant" || role === "dispatcher";
}

export function canApproveExpenses(role: Role | null) {
  return role === "owner" || role === "admin" || role === "accountant";
}

export function canManageAttachments(role: Role | null) {
  return role === "owner" || role === "admin" || role === "manager" || role === "accountant" || role === "dispatcher";
}

export function canManageSettings(role: Role | null) {
  return role === "owner" || role === "admin";
}
