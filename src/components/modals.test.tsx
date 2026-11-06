// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, Driver, Shipment, TruckType, Vehicle } from "../types/domain";
import { AddShipmentModal } from "./modals";
import { SelectOrNewField } from "./ui";

vi.mock("../hooks/useBusinessSettings", () => ({
  useBusinessSettings: () => ({
    settings: { invoice: { startingInvoiceNumber: "1001" } },
  }),
}));

afterEach(cleanup);

// jsdom has no layout, so it lacks scrollIntoView (used to reveal save errors).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();

const optionValues = (select: HTMLSelectElement) =>
  Array.from(select.options).map((option) => option.value);

const typeSequentially = (input: HTMLInputElement, value: string) => {
  input.focus();
  for (const character of value) {
    fireEvent.change(input, { target: { value: `${input.value}${character}` } });
    expect(document.activeElement).toBe(input);
  }
  expect(input.value).toBe(value);
};

describe("AddShipmentModal", () => {
  it("keeps Add new at the top of saved lists and preserves focus while entering a driver and vehicle", () => {
    render(
      <AddShipmentModal
        shipments={[]}
        masterData={{
          clients: [{ id: "client-1", name: "Saved Client" } as Client],
          drivers: [{ id: "driver-1", name: "Saved Driver" } as Driver],
          vehicles: [],
          truckTypes: [],
        }}
        routeOptions={{
          loadingPoints: ["Saved Loading Point"],
          destinations: ["Saved Destination"],
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(optionValues(screen.getByLabelText("Company") as HTMLSelectElement)).toEqual([
      "",
      "__add_new__",
      "Saved Client",
    ]);
    expect(optionValues(screen.getByLabelText("Loading Point") as HTMLSelectElement)).toEqual([
      "",
      "__add_new__",
      "Saved Loading Point",
    ]);
    expect(optionValues(screen.getByLabelText("Destination") as HTMLSelectElement)).toEqual([
      "",
      "__add_new__",
      "Saved Destination",
    ]);

    const driverSelect = screen.getByLabelText("Driver Name") as HTMLSelectElement;
    expect(optionValues(driverSelect)).toEqual([
      "",
      "__add_new_driver_vehicle__",
      "id:driver-1",
    ]);
    expect(Array.from(driverSelect.options).map((option) => option.text)[2]).toBe("Saved Driver");

    fireEvent.change(driverSelect, { target: { value: "__add_new_driver_vehicle__" } });

    const dialog = screen.getByRole("dialog", { name: "Add New Driver & Vehicle" });
    typeSequentially(within(dialog).getByLabelText("Driver Name") as HTMLInputElement, "Ahmed Khan");
    typeSequentially(within(dialog).getByLabelText("Cell No") as HTMLInputElement, "0501234567");
    typeSequentially(within(dialog).getByLabelText("Vehicle No") as HTMLInputElement, "ABC-123");
  });

  it("lets a new truck type be typed while adding a driver", async () => {
    const onCreateDriverVehicleBundle = vi.fn().mockResolvedValue({
      driver: { id: "driver-2", name: "AHMED KHAN", phone: null },
      vehicle: { id: "vehicle-2", vehicleNumber: "ABC-123" },
      truckType: { id: "truck-type-2", name: "REEFER 40FT" },
    });
    render(
      <AddShipmentModal
        shipments={[]}
        masterData={{ clients: [], drivers: [], vehicles: [], truckTypes: [{ id: "truck-type-1", name: "FLATBED" } as TruckType] }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onCreateDriverVehicleBundle={onCreateDriverVehicleBundle}
      />,
    );

    fireEvent.change(screen.getByLabelText("Driver Name"), { target: { value: "__add_new_driver_vehicle__" } });
    const dialog = screen.getByRole("dialog", { name: "Add New Driver & Vehicle" });
    fireEvent.change(within(dialog).getByLabelText("Driver Name"), { target: { value: "Ahmed Khan" } });
    fireEvent.change(within(dialog).getByLabelText("Vehicle No"), { target: { value: "ABC-123" } });

    const truckTypeSelect = within(dialog).getByLabelText("Truck Type") as HTMLSelectElement;
    expect(optionValues(truckTypeSelect)).toEqual(["", "__add_new__", "FLATBED"]);
    fireEvent.change(truckTypeSelect, { target: { value: "__add_new__" } });
    fireEvent.change(within(dialog).getByPlaceholderText("Enter new truck type"), { target: { value: "Reefer 40ft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onCreateDriverVehicleBundle).toHaveBeenCalledWith(expect.objectContaining({ truckType: "REEFER 40FT" })));
  });

  it("saves the waybill number with the shipment", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AddShipmentModal
        shipments={[]}
        masterData={{ clients: [{ id: "client-1", name: "Saved Client" } as Client], drivers: [], vehicles: [], truckTypes: [] }}
        routeOptions={{ loadingPoints: ["Dubai"], destinations: ["Riyadh"] }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Saved Client" } });
    fireEvent.change(screen.getByLabelText("Loading Point"), { target: { value: "Dubai" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Riyadh" } });
    fireEvent.change(screen.getByLabelText("Waybill Number"), { target: { value: "WB-555" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Shipment" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ waybillNumber: "WB-555" }), { invoiceDate: null }),
    );
  });

  it("tells drivers with the same name apart and saves the one picked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AddShipmentModal
        shipments={[]}
        masterData={{
          clients: [{ id: "client-1", name: "Saved Client" } as Client],
          drivers: [
            { id: "driver-a", name: "ARIF KHAN", phone: "055-1231699" } as Driver,
            { id: "driver-b", name: "ARIF KHAN", phone: "056-7648947" } as Driver,
          ],
          vehicles: [
            { id: "vehicle-a", vehicleNumber: "70129 DXB", driverId: "driver-a" } as Vehicle,
            { id: "vehicle-b", vehicleNumber: "85434 DXB", driverId: "driver-b" } as Vehicle,
          ],
          truckTypes: [],
        }}
        routeOptions={{ loadingPoints: ["Dubai"], destinations: ["Riyadh"] }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const driverSelect = screen.getByLabelText("Driver Name") as HTMLSelectElement;
    expect(Array.from(driverSelect.options).map((option) => option.text).slice(2)).toEqual([
      "ARIF KHAN · 70129 DXB",
      "ARIF KHAN · 85434 DXB",
    ]);

    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Saved Client" } });
    fireEvent.change(screen.getByLabelText("Loading Point"), { target: { value: "Dubai" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Riyadh" } });
    fireEvent.change(driverSelect, { target: { value: "id:driver-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Shipment" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ driverId: "driver-b", vehicleNo: "85434 DXB" }),
        { invoiceDate: null },
      ),
    );
  });

  it("passes a changed invoice date and refuses to clear an existing one", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editShipment = {
      id: "shipment-1",
      date: "2026-11-03",
      shipmentDate: "2026-11-03",
      invoice: "1001",
      customer: "Saved Client",
      loadingPoint: "Dubai",
      destination: "Riyadh",
      driverName: "",
      vehicleNo: "",
      truckType: "",
      cellNo: "",
      remarks: "",
      companyRate: 1000,
      driverRate: 0,
      advance: 0,
      gatePass: 0,
      fashah: 0,
      naql: 0,
      assignments: [],
    } as unknown as Shipment;
    render(
      <AddShipmentModal
        editShipment={editShipment}
        invoiceDate="2026-11-03"
        shipments={[editShipment]}
        masterData={{ clients: [{ id: "client-1", name: "Saved Client" } as Client], drivers: [], vehicles: [], truckTypes: [] }}
        routeOptions={{ loadingPoints: ["Dubai"], destinations: ["Riyadh"] }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const invoiceDate = screen.getByLabelText("Invoice Date") as HTMLInputElement;
    expect(invoiceDate.value).toBe("2026-11-03");

    fireEvent.change(invoiceDate, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText(/Invoice Date cannot be empty/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(invoiceDate, { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-11-03" }), { invoiceDate: "2026-10-20" }),
    );
  });

  it("disables the invoice date when the shipment has no invoice yet", () => {
    const editShipment = { id: "s-2", date: "2026-11-03", invoice: "1002", customer: "", loadingPoint: "", destination: "", driverName: "", vehicleNo: "", truckType: "", cellNo: "", remarks: "", assignments: [] } as unknown as Shipment;
    render(<AddShipmentModal editShipment={editShipment} invoiceDate={null} shipments={[]} onClose={vi.fn()} onSave={vi.fn()} />);

    expect((screen.getByLabelText("Invoice Date") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("SelectOrNewField", () => {
  it("renders Add new before saved options", () => {
    render(
      <SelectOrNewField
        label="Client"
        value="Saved Client"
        onChange={vi.fn()}
        options={["Saved Client", "Another Client"]}
      />,
    );

    expect(optionValues(screen.getByLabelText("Client") as HTMLSelectElement)).toEqual([
      "__add_new__",
      "Saved Client",
      "Another Client",
    ]);
  });
});
