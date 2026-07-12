import type { ReactElement } from "react";
import {
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Landmark,
  Truck,
} from "lucide-react";
import type { View } from "../types/domain";

export const views: View[] = [
  "Dashboard",
  "Shipments",
  "Directory",
  "Finance",
  "Reports",
];

export const navIcons: Record<View, ReactElement> = {
  Dashboard: <LayoutDashboard size={16} />,
  Shipments: <Truck size={16} />,
  Directory: <FolderKanban size={16} />,
  Finance: <Landmark size={16} />,
  Reports: <FileSpreadsheet size={16} />,
};
