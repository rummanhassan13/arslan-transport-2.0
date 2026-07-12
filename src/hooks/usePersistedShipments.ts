import { useEffect, useState } from "react";
import { defaultShipments } from "../data/mockData";
import type { Shipment } from "../types/domain";

const STORAGE_KEY = "arslan-transport-shipments";

export function usePersistedShipments() {
  const [shipments, setShipments] = useState<Shipment[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : defaultShipments;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
  }, [shipments]);

  return [shipments, setShipments] as const;
}
