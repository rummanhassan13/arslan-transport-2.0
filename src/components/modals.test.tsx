// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, Driver, TruckType } from "../types/domain";
import { AddShipmentModal } from "./modals";
import { SelectOrNewField } from "./ui";

vi.mock("../hooks/useBusinessSettings", () => ({
  useBusinessSettings: () => ({
    settings: { invoice: { startingInvoiceNumber: "1001" } },
  }),
}));

afterEach(cleanup);

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
      "Saved Driver",
    ]);

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

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ waybillNumber: "WB-555" })));
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
