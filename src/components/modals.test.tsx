// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Driver } from "../types/domain";
import { AddShipmentModal } from "./modals";
import { SelectOrNewField } from "./ui";

vi.mock("../hooks/useBusinessSettings", () => ({
  useBusinessSettings: () => ({
    settings: { invoice: { startingInvoiceNumber: "1001" } },
  }),
}));

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

    expect(optionValues(screen.getByLabelText("Customer") as HTMLSelectElement)).toEqual([
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

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

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
