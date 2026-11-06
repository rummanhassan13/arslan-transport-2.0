import type { CSSProperties } from "react";
import type { Client } from "../types/domain";

/**
 * Colours offered for companies in the shipment register. Mid-tone hues that read as a
 * clear stripe and as a soft tint on both the light and dark themes.
 */
export const COMPANY_COLOR_PALETTE = [
  "#2563EB", // blue
  "#16A34A", // green
  "#EA580C", // orange
  "#9333EA", // purple
  "#DC2626", // red
  "#0891B2", // teal
  "#CA8A04", // amber
  "#DB2777", // pink
  "#4F46E5", // indigo
  "#65A30D", // lime
] as const;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string | null | undefined): value is string {
  return Boolean(value && HEX_COLOR.test(value));
}

/** Stable palette colour for a company without a chosen one (same company, same colour). */
export function automaticCompanyColor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COMPANY_COLOR_PALETTE[Math.abs(hash) % COMPANY_COLOR_PALETTE.length];
}

/** The colour shown for a company: the one picked in its form, else an automatic one. */
export function companyColor(client: Pick<Client, "id" | "name" | "rowColor"> | null | undefined, fallbackName = "") {
  if (client && isHexColor(client.rowColor)) return client.rowColor;
  const key = client?.id || client?.name || fallbackName;
  return key ? automaticCompanyColor(key) : null;
}

/** Inline style that sets the company colour for the `.company-tinted` CSS. */
export function companyColorStyle(color: string | null): CSSProperties | undefined {
  return color ? ({ "--company-color": color } as CSSProperties) : undefined;
}
