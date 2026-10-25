import { useState } from "react";
import type { Shipment, ClientPayment, DriverPayment } from "../types/domain";
import { KpiGrid, PageTitle, PeriodSelector } from "../components/ui";
import { money } from "../utils/formatters";
import { ClientsPage } from "./ClientsPage";
import { DriversPage } from "./DriversPage";
import { TruckTypesPage } from "./TruckTypesPage";
import { VehiclesPage } from "./VehiclesPage";

type DirectoryTab = "Companies" | "Drivers" | "Vehicles" | "Truck Types";

export function DirectoryPage({ 
  shipments, 
  clientPayments, 
  driverPayments 
}: { 
  shipments: Shipment[];
  clientPayments: ClientPayment[];
  driverPayments: DriverPayment[];
}) {
  const [tab, setTab] = useState<DirectoryTab>("Companies");
  const activeClients = new Set(shipments.map((shipment) => shipment.customer)).size;
  const activeDrivers = new Set(shipments.map((shipment) => shipment.driverName)).size;
  const pendingClientBalances = shipments
    .reduce((total, shipment) => total + (shipment.clientBalance ?? shipment.companyTotal), 0);
  const driverBalancesDue = shipments
    .filter((shipment) => shipment.driverPaymentStatus !== "Paid")
    .reduce((total, shipment) => total + shipment.pending, 0);

  return (
    <>
      <PageTitle
        title="Directory"
        subtitle="Manage companies, drivers, and core business records."
        trailing={<PeriodSelector value={tab} options={["Companies", "Drivers", "Vehicles", "Truck Types"]} onChange={setTab} />}
      />
      <KpiGrid
        items={[
          ["Active Companies", activeClients.toString(), "Linked to shipment records"],
          ["Active Drivers", activeDrivers.toString(), "Linked to shipment records"],
          ["Pending Company Balances", money(pendingClientBalances), "Open company receivables"],
          ["Driver Balances Due", money(driverBalancesDue), "Unsettled driver amounts"],
        ]}
      />
      {tab === "Companies" && <ClientsPage shipments={shipments} clientPayments={clientPayments} embedded />}
      {tab === "Drivers" && <DriversPage shipments={shipments} driverPayments={driverPayments} embedded />}
      {tab === "Vehicles" && <VehiclesPage shipments={shipments} />}
      {tab === "Truck Types" && <TruckTypesPage shipments={shipments} />}
    </>
  );
}
