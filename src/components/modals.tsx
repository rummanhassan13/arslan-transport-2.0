import { useMemo, useState } from "react";
import { emptyShipment } from "../data/mockData";
import type { Client, ClientInput, ClientPaymentInput, Driver, DriverPaymentInput, Invoice, InvoiceItem, Shipment, ShipmentInput, TruckType, Vehicle } from "../types/domain";
import type { RouteLocationType } from "../services/routeLocationService";
import { calculate } from "../utils/calculations";
import { labelize, money, unique, uniqueByValues } from "../utils/formatters";
import { Modal, SelectField, SelectOrNewField, SummaryCard } from "./ui";
import { InvoicePrintTemplate } from "./InvoicePrintTemplate";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { ShipmentAttachmentManager } from "./shipments/ShipmentAttachmentManager";

export function AddShipmentModal({
  editShipment,
  shipments,
  masterData,
  routeOptions,
  onCreateRouteLocation,
  onCreateDriverVehicleBundle,
  onCreateClient,
  onClose,
  onSave,
}: {
  editShipment?: Shipment;
  shipments: Shipment[];
  masterData?: {
    clients: Client[];
    drivers: Driver[];
    vehicles: Vehicle[];
    truckTypes: TruckType[];
  };
  routeOptions?: {
    loadingPoints: string[];
    destinations: string[];
  };
  onCreateRouteLocation?: (type: RouteLocationType, name: string) => Promise<string>;
  onCreateDriverVehicleBundle?: (input: DriverVehicleBundleInput) => Promise<DriverVehicleBundleResult>;
  onCreateClient?: (input: ClientInput) => Promise<Client>;
  onClose: () => void;
  onSave: (input: ShipmentInput) => Promise<void> | void;
}) {
  const { settings } = useBusinessSettings();

  const nextInvoiceNumber = useMemo(() => {
    const startingStr = (settings?.invoice?.startingInvoiceNumber || "1001").trim();
    let startingVal = parseInt(startingStr, 10);
    if (isNaN(startingVal) || startingVal < 1) {
      startingVal = 1001;
    }

    let maxNum = 0;
    for (const s of shipments) {
      if (!s.invoice) continue;
      const generalMatch = s.invoice.trim().match(/(\d+)$/);
      if (generalMatch) {
        const num = parseInt(generalMatch[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    const nextNum = maxNum > 0 ? Math.max(maxNum + 1, startingVal) : startingVal;
    return `${nextNum}`;
  }, [shipments, settings?.invoice?.startingInvoiceNumber]);

  const [form, setForm] = useState<ShipmentInput>(() => {
    if (editShipment) {
      let mappedAssignments = editShipment.assignments;
      if (mappedAssignments && mappedAssignments.length > 0 && typeof mappedAssignments[0].advancePaid !== "number" && editShipment.advance > 0) {
        mappedAssignments = [...mappedAssignments];
        mappedAssignments[0] = { ...mappedAssignments[0], advancePaid: editShipment.advance };
      } else if (!mappedAssignments || mappedAssignments.length === 0) {
        mappedAssignments = [
          { driverId: null, driverName: "", legOrder: 1, fromLocation: "", toLocation: "", driverRate: 0, notes: "", advancePaid: editShipment.advance || 0 }
        ];
      }
      return {
        ...editShipment,
        companyRate: editShipment.companyRate === 0 ? "" : editShipment.companyRate,
        driverRate: editShipment.driverRate === 0 ? "" : editShipment.driverRate,
        advance: editShipment.advance === 0 ? "" : editShipment.advance,
        gatePass: editShipment.gatePass === 0 ? "" : editShipment.gatePass,
        fashah: editShipment.fashah === 0 ? "" : editShipment.fashah,
        naql: editShipment.naql === 0 ? "" : editShipment.naql,
        assignments: mappedAssignments,
      } as ShipmentInput;
    }
    return {
      ...emptyShipment,
      date: new Date().toISOString().slice(0, 10),
      invoice: nextInvoiceNumber,
      customer: "",
      loadingPoint: "",
      destination: "",
      driverName: "",
      vehicleNo: "",
      truckType: "",
      cellNo: "",
      companyRate: "",
      driverRate: "",
      advance: "",
      gatePass: "",
      fashah: "",
      naql: "",
      assignments: [
        { driverId: null, driverName: "", legOrder: 1, fromLocation: "", toLocation: "", driverRate: 0, notes: "", advancePaid: 0 }
      ],
    };
  });
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Lifted inline-create states
  const [inlineCustomerMode, setInlineCustomerMode] = useState(false);
  const [customerDraft, setCustomerDraft] = useState("");
  const [customerInlineError, setCustomerInlineError] = useState("");

  const [inlineLoadingPointMode, setInlineLoadingPointMode] = useState(false);
  const [loadingPointDraft, setLoadingPointDraft] = useState("");
  const [loadingPointInlineError, setLoadingPointInlineError] = useState("");

  const [inlineDestinationMode, setInlineDestinationMode] = useState(false);
  const [destinationDraft, setDestinationDraft] = useState("");
  const [destinationInlineError, setDestinationInlineError] = useState("");

  const [inlineSaving, setInlineSaving] = useState(false);

  const resetCustomerInline = () => {
    setInlineCustomerMode(false);
    setCustomerDraft("");
    setCustomerInlineError("");
  };

  const resetLoadingPointInline = () => {
    setInlineLoadingPointMode(false);
    setLoadingPointDraft("");
    setLoadingPointInlineError("");
  };

  const resetDestinationInline = () => {
    setInlineDestinationMode(false);
    setDestinationDraft("");
    setDestinationInlineError("");
  };

  const enterInlineMode = (field: "customer" | "loadingPoint" | "destination") => {
    if (field === "customer") {
      resetLoadingPointInline();
      resetDestinationInline();
      setInlineCustomerMode(true);
      setCustomerDraft("");
      setCustomerInlineError("");
    } else if (field === "loadingPoint") {
      resetCustomerInline();
      resetDestinationInline();
      setInlineLoadingPointMode(true);
      setLoadingPointDraft("");
      setLoadingPointInlineError("");
    } else if (field === "destination") {
      resetCustomerInline();
      resetLoadingPointInline();
      setInlineDestinationMode(true);
      setDestinationDraft("");
      setDestinationInlineError("");
    }
  };

  const saveNewCustomer = async () => {
    const cleanedName = customerDraft.trim().replace(/\s+/g, " ");
    setCustomerInlineError("");
    if (!cleanedName) {
      setCustomerInlineError("Customer name is required.");
      return;
    }

    // Check for duplicate client using normalized name (whitespace/case-stripped)
    const normalizedEntered = cleanedName.toLowerCase().replace(/\s+/g, "");
    const existing = masterData?.clients?.find(
      (client) => client.name.trim().toLowerCase().replace(/\s+/g, "") === normalizedEntered
    );

    if (existing) {
      setForm((current) => ({
        ...current,
        customer: existing.name,
        clientId: existing.id,
      }));
      resetCustomerInline();
      return;
    }

    setInlineSaving(true);
    try {
      if (onCreateClient) {
        const created = await onCreateClient({ name: cleanedName, status: "active" });
        setForm((current) => ({
          ...current,
          customer: created.name,
          clientId: created.id,
        }));
      } else {
        setForm((current) => ({
          ...current,
          customer: cleanedName,
          clientId: null,
        }));
      }
      resetCustomerInline();
    } catch (error) {
      setCustomerInlineError(error instanceof Error ? error.message : "Unable to save customer.");
    } finally {
      setInlineSaving(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const [driverVehicleMode, setDriverVehicleMode] = useState(false);
  const [driverVehicleMessage, setDriverVehicleMessage] = useState("");
  const [driverVehicleSaving, setDriverVehicleSaving] = useState(false);
  const [activeAssignmentIndex, setActiveAssignmentIndex] = useState<number | null>(null);
  const [truckTypeFilterActive, setTruckTypeFilterActive] = useState(false);
  const [newDriverVehicle, setNewDriverVehicle] = useState<DriverVehicleBundleInput>({
    driverName: "",
    vehicleNo: "",
    truckType: "",
    cellNo: "",
  });
  const computedDriverRate = useMemo(() => {
    return form.assignments?.reduce((sum, a) => sum + (Number(a.driverRate) || 0), 0) || 0;
  }, [form.assignments]);

  const computedAdvance = useMemo(() => {
    return form.assignments?.reduce((sum, a) => sum + (Number(a.advancePaid) || 0), 0) || 0;
  }, [form.assignments]);

  const totals = calculate({ ...form, driverRate: computedDriverRate });
  const historicalLocations = uniqueByValues([
    ...shipments.map((shipment) => shipment.loadingPoint),
    ...shipments.map((shipment) => shipment.destination),
  ]);
  const loadingPointOptions = uniqueByValues([...(routeOptions?.loadingPoints ?? []), ...shipments.map((shipment) => shipment.loadingPoint)]);
  const destinationOptions = uniqueByValues([...(routeOptions?.destinations ?? []), ...shipments.map((shipment) => shipment.destination)]);
  const customerOptions = masterData?.clients.length ? masterData.clients.map((client) => client.name) : unique(shipments, "customer");
  const filteredVehicles = useMemo(() => {
    if (!truckTypeFilterActive || !form.truckType) return masterData?.vehicles ?? [];
    return (masterData?.vehicles ?? []).filter((vehicle) => (vehicle.truckTypeName || "").toUpperCase() === form.truckType.toUpperCase());
  }, [form.truckType, masterData?.vehicles, truckTypeFilterActive]);
  const filteredVehicleDriverNames = new Set(filteredVehicles.map((vehicle) => vehicle.driverName).filter(Boolean));
  const filteredDriverIds = new Set(filteredVehicles.map((vehicle) => vehicle.driverId).filter(Boolean));
  const filteredDrivers = useMemo(() => {
    if (!truckTypeFilterActive || !form.truckType || !masterData?.drivers.length) return masterData?.drivers ?? [];
    return masterData.drivers.filter((driver) => filteredDriverIds.has(driver.id) || filteredVehicleDriverNames.has(driver.name));
  }, [filteredDriverIds, filteredVehicleDriverNames, form.truckType, masterData?.drivers, truckTypeFilterActive]);
  const driverOptions = masterData?.drivers.length ? filteredDrivers.map((driver) => driver.name) : unique(shipments, "driverName");
  const vehicleOptions = masterData?.vehicles.length ? filteredVehicles.map((vehicle) => vehicle.vehicleNumber) : unique(shipments, "vehicleNo");
  const truckTypeOptions = masterData?.truckTypes.length ? masterData.truckTypes.map((truckType) => truckType.name) : unique(shipments, "truckType");
  const truckTypeHelper =
    truckTypeFilterActive && form.truckType && masterData?.vehicles.length && filteredVehicles.length > 1
      ? "Multiple drivers found for this truck type. Select a driver or vehicle."
      : "";
  const setField = (key: keyof ShipmentInput, value: string) => {
    const numeric = ["companyRate", "driverRate", "advance", "gatePass", "fashah", "naql"];
    setForm((current) => ({
      ...current,
      [key]: numeric.includes(key) ? (value === "" ? "" : Number(value)) : value
    }));
  };
  const findVehicleForDriver = (driver: Driver | undefined) => {
    if (!driver) return null;
    return (
      masterData?.vehicles.find((vehicle) => vehicle.driverId === driver.id) ||
      masterData?.vehicles.find((vehicle) => vehicle.driverName === driver.name) ||
      null
    );
  };
  const setDriver = (driverName: string) => {
    if (driverName === "__add_new_driver_vehicle__") {
      setDriverVehicleMode(true);
      setDriverVehicleMessage("");
      setNewDriverVehicle({
        driverName: "",
        vehicleNo: "",
        truckType: "",
        cellNo: "",
      });
      return;
    }
    const savedConnectedDriver = masterData?.drivers.find((driver) => driver.name === driverName);
    const connectedVehicle = findVehicleForDriver(savedConnectedDriver);
    const savedDriver = shipments.find((shipment) => shipment.driverName === driverName);
    setForm((current) => ({
      ...current,
      driverId: savedConnectedDriver?.id ?? current.driverId,
      driverName,
      cellNo: savedConnectedDriver?.phone || savedDriver?.cellNo || current.cellNo,
      vehicleId: connectedVehicle?.id ?? current.vehicleId,
      vehicleNo: connectedVehicle?.vehicleNumber || savedDriver?.vehicleNo || current.vehicleNo,
      truckTypeId: connectedVehicle?.truckTypeId ?? current.truckTypeId,
      truckType: connectedVehicle?.truckTypeName || savedDriver?.truckType || current.truckType,
    }));
  };
  const setVehicle = (vehicleNo: string) => {
    const savedVehicle = masterData?.vehicles.find((vehicle) => vehicle.vehicleNumber === vehicleNo);
    const linkedDriver =
      masterData?.drivers.find((driver) => driver.id === savedVehicle?.driverId) ||
      masterData?.drivers.find((driver) => driver.name === savedVehicle?.driverName);
    setForm((current) => ({
      ...current,
      vehicleNo,
      vehicleId: savedVehicle?.id ?? current.vehicleId,
      truckType: savedVehicle?.truckTypeName || current.truckType,
      truckTypeId: savedVehicle?.truckTypeId ?? current.truckTypeId,
      driverName: linkedDriver?.name || savedVehicle?.driverName || current.driverName,
      driverId: linkedDriver?.id ?? savedVehicle?.driverId ?? current.driverId,
      cellNo: linkedDriver?.phone || current.cellNo,
    }));
  };
  const setTruckType = (truckType: string) => {
    setTruckTypeFilterActive(Boolean(truckType));
    const matchedTruckType = masterData?.truckTypes.find((item) => item.name === truckType);
    setForm((current) => ({
      ...current,
      truckType,
      truckTypeId: matchedTruckType?.id ?? current.truckTypeId,
    }));
    const matches = (masterData?.vehicles ?? []).filter((vehicle) => (vehicle.truckTypeName || "").toUpperCase() === truckType.toUpperCase());
    if (matches.length === 1) {
      setVehicle(matches[0].vehicleNumber);
    }
  };
  const saveNewDriverVehicle = async () => {
    setDriverVehicleMessage("");
    const payload = {
      driverName: newDriverVehicle.driverName.trim().replace(/\s+/g, " "),
      vehicleNo: newDriverVehicle.vehicleNo.trim().replace(/\s+/g, " ").toUpperCase(),
      truckType: newDriverVehicle.truckType.trim().replace(/\s+/g, " ").toUpperCase(),
      cellNo: newDriverVehicle.cellNo.trim(),
    };
    if (!payload.driverName || !payload.vehicleNo || !payload.truckType) {
      setDriverVehicleMessage("Driver name, vehicle number, and truck type are required.");
      return;
    }
    if (!onCreateDriverVehicleBundle) {
      setDriverVehicleMessage("Creating new driver/vehicle records is not available.");
      return;
    }
    setDriverVehicleSaving(true);
    try {
      const created = await onCreateDriverVehicleBundle(payload);
      setForm((current) => {
        const newAssignments = [...(current.assignments || [])];
        if (activeAssignmentIndex !== null && newAssignments[activeAssignmentIndex]) {
          newAssignments[activeAssignmentIndex] = {
            ...newAssignments[activeAssignmentIndex],
            driverName: created.driver.name,
            driverId: created.driver.id,
            vehicleNo: created.vehicle.vehicleNumber,
            vehicleId: created.vehicle.id,
            truckType: created.truckType.name,
            truckTypeId: created.truckType.id,
          };
        }
        if (activeAssignmentIndex === 0) {
          return {
            ...current,
            assignments: newAssignments,
            driverName: created.driver.name,
            driverId: created.driver.id,
            cellNo: created.driver.phone || payload.cellNo,
            vehicleNo: created.vehicle.vehicleNumber,
            vehicleId: created.vehicle.id,
            truckType: created.truckType.name,
            truckTypeId: created.truckType.id,
          };
        }
        return { ...current, assignments: newAssignments };
      });
      setDriverVehicleMode(false);
      setDriverVehicleMessage("Driver and vehicle saved.");
    } catch (error) {
      setDriverVehicleMessage(error instanceof Error ? error.message : "Unable to save driver and vehicle.");
    } finally {
      setDriverVehicleSaving(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const sanitizedForm: ShipmentInput = {
        ...form,
        companyRate: form.companyRate === "" ? 0 : Number(form.companyRate),
        driverRate: form.assignments?.length ? computedDriverRate : (form.driverRate === "" ? 0 : Number(form.driverRate)),
        advance: form.assignments?.length ? computedAdvance : (form.advance === "" ? 0 : Number(form.advance)),
        gatePass: form.gatePass === "" ? 0 : Number(form.gatePass),
        fashah: form.fashah === "" ? 0 : Number(form.fashah),
        naql: form.naql === "" ? 0 : Number(form.naql),
      };
      await onSave(sanitizedForm);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        title={editShipment ? "Edit Shipment" : "Add Shipment"}
      onClose={onClose}
      size="wide"
      footer={
        <>
          {activeStep === 1 ? (
            <button className="btn-ghost" onClick={onClose} type="button">Cancel</button>
          ) : (
            <button className="btn-ghost" onClick={() => setActiveStep((activeStep - 1) as 1 | 2)} type="button">Back</button>
          )}
          {activeStep < 3 ? (
            <button className="btn-primary" onClick={() => setActiveStep((activeStep + 1) as 2 | 3)} type="button">Continue</button>
          ) : (
            <button className="btn-primary" onClick={save} disabled={saving} type="button">{saving ? "Saving..." : editShipment ? "Save Changes" : "Save Shipment"}</button>
          )}
        </>
      }
    >
      <div className="shipment-form-steps" aria-label="Shipment form progress">
        {(["Shipment", "Assignment", "Review"] as const).map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3;
          return (
            <button
              key={label}
              className={`shipment-form-step${activeStep === step ? " active" : ""}${activeStep > step ? " complete" : ""}`}
              onClick={() => setActiveStep(step)}
              aria-current={activeStep === step ? "step" : undefined}
              type="button"
            >
              <span>{step}</span>
              {label}
            </button>
          );
        })}
      </div>
      <div className="form-layout">
        {activeStep === 1 && <section className="form-section">
          <h3>Shipment</h3>
          <div className="form-grid">
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(event) => setField("date", event.target.value)} />
            </label>
            <label className="field">
              <span>Invoice</span>
              <input type="text" value={form.invoice} onChange={(event) => setField("invoice", event.target.value)} />
            </label>
            {inlineCustomerMode ? (
              <label className="field">
                <span>Customer</span>
                <div className="select-new-row">
                  <input
                    value={customerDraft}
                    placeholder="Enter new customer"
                    onChange={(event) => setCustomerDraft(event.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="table-action"
                    disabled={inlineSaving}
                    onClick={saveNewCustomer}
                  >
                    {inlineSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="table-action"
                    onClick={resetCustomerInline}
                  >
                    Cancel
                  </button>
                </div>
                {customerInlineError && <small className="inline-alert">{customerInlineError}</small>}
              </label>
            ) : (
              <label className="field">
                <span>Customer</span>
                <select
                  value={form.customer}
                  onChange={(event) => {
                    if (event.target.value === "__add_new__") {
                      enterInlineMode("customer");
                      return;
                    }
                    const selectedName = event.target.value;
                    const matchedClient = masterData?.clients.find((c) => c.name === selectedName);
                    setForm((current) => ({
                      ...current,
                      customer: selectedName,
                      clientId: matchedClient?.id ?? null,
                    }));
                  }}
                >
                  <option value="">Select customer</option>
                  {customerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="__add_new__">Add new...</option>
                </select>
              </label>
            )}
            <SavedLocationField
              label="Loading Point"
              type="loading_point"
              value={form.loadingPoint}
              onChange={(value) => setField("loadingPoint", value)}
              options={loadingPointOptions.length ? loadingPointOptions : historicalLocations}
              onSave={onCreateRouteLocation}
              addingNew={inlineLoadingPointMode}
              onEnterInline={() => enterInlineMode("loadingPoint")}
              draft={loadingPointDraft}
              setDraft={setLoadingPointDraft}
              message={loadingPointInlineError}
              setMessage={setLoadingPointInlineError}
              onCancel={resetLoadingPointInline}
            />
            <SavedLocationField
              label="Destination"
              type="destination"
              value={form.destination}
              onChange={(value) => setField("destination", value)}
              options={destinationOptions.length ? destinationOptions : historicalLocations}
              onSave={onCreateRouteLocation}
              addingNew={inlineDestinationMode}
              onEnterInline={() => enterInlineMode("destination")}
              draft={destinationDraft}
              setDraft={setDestinationDraft}
              message={destinationInlineError}
              setMessage={setDestinationInlineError}
              onCancel={resetDestinationInline}
            />
          </div>
        </section>}
        {activeStep === 2 && <section className="form-section">
          <div className="form-section-header">
            <h3>Driver & Vehicle Assignment</h3>
            <button
              className="table-action"
              type="button"
              onClick={() => {
                const newLegOrder = (form.assignments?.length || 0) + 1;
                setForm((current) => ({
                  ...current,
                  assignments: [
                    ...(current.assignments || []),
                    { driverId: null, driverName: "", legOrder: newLegOrder, fromLocation: "", toLocation: "", driverRate: 0, notes: "", vehicleId: null, vehicleNo: "", truckTypeId: null, truckType: "", advancePaid: 0 }
                  ],
                }));
              }}
            >
              + Add Driver Leg
            </button>
          </div>
          
          <div className="flex flex-col gap-4">
            {form.assignments?.map((assignment, index) => (
              <div key={index} className="border border-[var(--border-color)] rounded-[var(--radius)] p-4 relative">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium">Leg {assignment.legOrder}</h4>
                  {index > 0 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--danger-color)] hover:underline"
                      onClick={() => {
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments.splice(index, 1);
                          // Reorder
                          newAssignments.forEach((a, i) => { a.legOrder = i + 1; });
                          // Sync primary driver/vehicle if index was 0
                          if (index === 0 && newAssignments.length > 0) {
                            return {
                              ...current,
                              assignments: newAssignments,
                              driverId: newAssignments[0].driverId,
                              driverName: newAssignments[0].driverName,
                              vehicleId: newAssignments[0].vehicleId,
                              vehicleNo: newAssignments[0].vehicleNo || "",
                              truckTypeId: newAssignments[0].truckTypeId,
                              truckType: newAssignments[0].truckType || "",
                            };
                          }
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Driver Name</span>
                    <select
                      value={assignment.driverName}
                      onChange={(event) => {
                        const val = event.target.value;
                        if (val === "__add_new_driver_vehicle__") {
                          setActiveAssignmentIndex(index);
                          setDriverVehicleMode(true);
                          setDriverVehicleMessage("");
                          setNewDriverVehicle({
                            driverName: "",
                            vehicleNo: "",
                            truckType: "",
                            cellNo: "",
                          });
                          return;
                        }
                        const matchedDriver = masterData?.drivers.find((d) => d.name === val);
                        const connectedVehicle = findVehicleForDriver(matchedDriver);
                        const savedDriver = shipments.find((s) => s.driverName === val);
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = {
                            ...newAssignments[index],
                            driverName: val,
                            driverId: matchedDriver?.id || null,
                            vehicleId: connectedVehicle?.id || null,
                            vehicleNo: connectedVehicle?.vehicleNumber || savedDriver?.vehicleNo || "",
                            truckTypeId: connectedVehicle?.truckTypeId || null,
                            truckType: connectedVehicle?.truckTypeName || savedDriver?.truckType || "",
                          };
                          // If it's the first assignment, sync to primary
                          if (index === 0) {
                            return {
                              ...current,
                              assignments: newAssignments,
                              driverName: val,
                              driverId: matchedDriver?.id || null,
                              cellNo: matchedDriver?.phone || savedDriver?.cellNo || current.cellNo,
                              vehicleId: connectedVehicle?.id || null,
                              vehicleNo: connectedVehicle?.vehicleNumber || savedDriver?.vehicleNo || current.vehicleNo,
                              truckTypeId: connectedVehicle?.truckTypeId || null,
                              truckType: connectedVehicle?.truckTypeName || savedDriver?.truckType || current.truckType,
                            };
                          }
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    >
                      <option value="">Select driver</option>
                      {driverOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                      <option value="__add_new_driver_vehicle__">Add new...</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Vehicle No</span>
                    <select
                      value={assignment.vehicleNo}
                      onChange={(event) => {
                        const val = event.target.value;
                        const savedVehicle = masterData?.vehicles.find((v) => v.vehicleNumber === val);
                        const linkedDriver =
                          masterData?.drivers.find((d) => d.id === savedVehicle?.driverId) ||
                          masterData?.drivers.find((d) => d.name === savedVehicle?.driverName);
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = {
                            ...newAssignments[index],
                            vehicleNo: val,
                            vehicleId: savedVehicle?.id || null,
                            truckType: savedVehicle?.truckTypeName || newAssignments[index].truckType || "",
                            truckTypeId: savedVehicle?.truckTypeId || null,
                            driverName: linkedDriver?.name || savedVehicle?.driverName || newAssignments[index].driverName || "",
                            driverId: linkedDriver?.id || savedVehicle?.driverId || null,
                          };
                          if (index === 0) {
                            return {
                              ...current,
                              assignments: newAssignments,
                              vehicleNo: val,
                              vehicleId: savedVehicle?.id || null,
                              truckType: savedVehicle?.truckTypeName || current.truckType,
                              truckTypeId: savedVehicle?.truckTypeId || null,
                              driverName: linkedDriver?.name || savedVehicle?.driverName || current.driverName,
                              driverId: linkedDriver?.id || savedVehicle?.driverId || null,
                              cellNo: linkedDriver?.phone || current.cellNo,
                            };
                          }
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    >
                      <option value="">Select vehicle</option>
                      {vehicleOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Truck Type</span>
                    <select
                      value={assignment.truckType}
                      onChange={(event) => {
                        const val = event.target.value;
                        const matchedTruckType = masterData?.truckTypes.find((t) => t.name === val);
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = {
                            ...newAssignments[index],
                            truckType: val,
                            truckTypeId: matchedTruckType?.id || null,
                          };
                          // Auto fill vehicle if there is only 1 single matching vehicle for this truck type
                          const matches = (masterData?.vehicles ?? []).filter((v) => (v.truckTypeName || "").toUpperCase() === val.toUpperCase());
                          if (matches.length === 1) {
                            const singleV = matches[0];
                            const linkedDriver =
                              masterData?.drivers.find((d) => d.id === singleV.driverId) ||
                              masterData?.drivers.find((d) => d.name === singleV.driverName);
                            newAssignments[index] = {
                              ...newAssignments[index],
                              vehicleNo: singleV.vehicleNumber,
                              vehicleId: singleV.id,
                              driverName: linkedDriver?.name || singleV.driverName || newAssignments[index].driverName || "",
                              driverId: linkedDriver?.id || singleV.driverId || null,
                            };
                          }
                          if (index === 0) {
                            const currentSync = {
                              ...current,
                              assignments: newAssignments,
                              truckType: val,
                              truckTypeId: matchedTruckType?.id || null,
                            };
                            if (matches.length === 1) {
                              const singleV = matches[0];
                              const linkedDriver =
                                masterData?.drivers.find((d) => d.id === singleV.driverId) ||
                                masterData?.drivers.find((d) => d.name === singleV.driverName);
                              currentSync.vehicleNo = singleV.vehicleNumber;
                              currentSync.vehicleId = singleV.id;
                              currentSync.driverName = linkedDriver?.name || singleV.driverName || current.driverName;
                              currentSync.driverId = linkedDriver?.id || singleV.driverId || null;
                              currentSync.cellNo = linkedDriver?.phone || current.cellNo;
                            }
                            return currentSync;
                          }
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    >
                      <option value="">Select truck type</option>
                      {truckTypeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>From Location</span>
                    <input
                      type="text"
                      value={assignment.fromLocation}
                      onChange={(e) => {
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = { ...newAssignments[index], fromLocation: e.target.value };
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>To Location</span>
                    <input
                      type="text"
                      value={assignment.toLocation}
                      onChange={(e) => {
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = { ...newAssignments[index], toLocation: e.target.value };
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Driver Rate</span>
                    <input
                      type="number"
                      value={assignment.driverRate || ""}
                      onChange={(e) => {
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = { ...newAssignments[index], driverRate: Number(e.target.value) };
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{editShipment ? "Advance Paid (ledger)" : "Initial Driver Advance"}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={assignment.advancePaid ?? ""}
                      disabled={Boolean(editShipment)}
                      title={editShipment ? "Use Add Payment to record or reverse posted advances." : "Recorded as an assignment-aware advance ledger entry when the shipment is saved."}
                      onChange={(e) => {
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = { ...newAssignments[index], advancePaid: e.target.value === "" ? 0 : Number(e.target.value) };
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    />
                  </label>
                  <label className="field form-wide">
                    <span>Notes</span>
                    <input
                      type="text"
                      value={assignment.notes}
                      onChange={(e) => {
                        setForm((current) => {
                          const newAssignments = [...(current.assignments || [])];
                          newAssignments[index] = { ...newAssignments[index], notes: e.target.value };
                          return { ...current, assignments: newAssignments };
                        });
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>}
        {activeStep === 3 && (
          <>
            <section className="form-section">
              <h3>Billing</h3>
              <div className="form-grid">
                {(["companyRate"] as const).map((key) => (
                  <label key={key} className="field">
                    <span>{labelize(key)}</span>
                    <input type="number" value={form[key]} onChange={(event) => setField(key, event.target.value)} />
                  </label>
                ))}
              </div>
            </section>
            <section className="form-section">
              <h3>Remarks</h3>
              <div className="form-grid">
                <label className="field form-wide">
                  <span>Remark</span>
                  <textarea value={form.remarks} onChange={(event) => setField("remarks", event.target.value)} />
                </label>
              </div>
            </section>
          </>
        )}
      </div>
      {activeStep === 3 && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <SummaryCard title="Company Total" value={money(totals.companyTotal)} note="Auto calculated" />
          <SummaryCard title="Driver Total" value={money(totals.driverTotal)} note="Auto calculated" />
          <SummaryCard title="Pending" value={money(totals.pending)} note="Driver balance" />
          <SummaryCard title="Net Profit" value={money(totals.netProfit)} note="Revenue minus cost" />
        </div>
      )}
    </Modal>
    {driverVehicleMode && (
      <Modal
        title="Add New Driver & Vehicle"
        onClose={() => setDriverVehicleMode(false)}
        size="medium"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDriverVehicleMode(false)} type="button">Cancel</button>
            <button className="btn-primary" onClick={saveNewDriverVehicle} disabled={driverVehicleSaving} type="button">
              {driverVehicleSaving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="form-layout">
          <div className="form-grid">
            <label className="field">
              <span>Driver Name</span>
              <input
                type="text"
                value={newDriverVehicle.driverName}
                onChange={(e) => setNewDriverVehicle(curr => ({ ...curr, driverName: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Cell No</span>
              <input
                type="text"
                value={newDriverVehicle.cellNo}
                onChange={(e) => setNewDriverVehicle(curr => ({ ...curr, cellNo: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Vehicle No</span>
              <input
                type="text"
                value={newDriverVehicle.vehicleNo}
                onChange={(e) => setNewDriverVehicle(curr => ({ ...curr, vehicleNo: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Truck Type</span>
              <select
                value={newDriverVehicle.truckType}
                onChange={(e) => setNewDriverVehicle(curr => ({ ...curr, truckType: e.target.value }))}
              >
                <option value="">Select truck type</option>
                {truckTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          {driverVehicleMessage && <p className="inline-alert">{driverVehicleMessage}</p>}
        </div>
      </Modal>
    )}
    </>
  );
}

type DriverVehicleBundleInput = {
  driverName: string;
  vehicleNo: string;
  truckType: string;
  cellNo: string;
};

type DriverVehicleBundleResult = {
  driver: Driver;
  vehicle: Vehicle;
  truckType: TruckType;
};

function SavedLocationField({
  label,
  type,
  value,
  onChange,
  options,
  onSave,
  addingNew,
  onEnterInline,
  draft,
  setDraft,
  message,
  setMessage,
  onCancel,
}: {
  label: string;
  type: RouteLocationType;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onSave?: (type: RouteLocationType, name: string) => Promise<string>;
  addingNew: boolean;
  onEnterInline: () => void;
  draft: string;
  setDraft: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const selectValue = options.includes(value) ? value : "";

  const save = async () => {
    const cleaned = draft.trim().replace(/\s+/g, " ");
    setMessage("");
    if (!cleaned) {
      setMessage(`${label} is required.`);
      return;
    }
    if (!onSave) {
      onChange(cleaned);
      onCancel();
      return;
    }
    setSaving(true);
    try {
      const saved = await onSave(type, cleaned);
      onChange(saved);
      onCancel();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to save ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  if (addingNew) {
    return (
      <label className="field">
        <span>{label}</span>
        <div className="select-new-row">
          <input
            value={draft}
            placeholder={`Enter new ${label.toLowerCase()}`}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          <button type="button" className="table-action" disabled={saving} onClick={save}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="table-action"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        {message && <small className="inline-alert">{message}</small>}
      </label>
    );
  }

  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === "__add_new__") {
            onEnterInline();
            return;
          }
          onChange(event.target.value);
        }}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__add_new__">Add new...</option>
      </select>
    </label>
  );
}

type PaymentModalInput = {
  type: "Client" | "Driver";
  clientPayment?: ClientPaymentInput;
  driverPayment?: DriverPaymentInput;
};

export function PaymentModal({
  invoices = [],
  shipments = [],
  drivers = [],
  initialType,
  initialShipmentId,
  initialDriverId,
  initialInvoiceId,
  onClose,
  onSave,
}: {
  invoices?: Invoice[];
  shipments?: Shipment[];
  drivers?: Driver[];
  initialType?: "Client" | "Driver";
  initialShipmentId?: string;
  initialDriverId?: string;
  initialInvoiceId?: string;
  onClose: () => void;
  onSave: (input: PaymentModalInput) => Promise<void> | void;
}) {
  const initialShipment = initialShipmentId ? shipments.find((shipment) => shipment.id === initialShipmentId) : undefined;
  const initialShipmentInvoice = initialShipmentId
    ? invoices.find((invoice) => invoice.shipmentId === initialShipmentId)
    : undefined;
  const availableInvoices = initialShipmentId
    ? invoices.filter((invoice) => invoice.shipmentId === initialShipmentId)
    : invoices;
  const resolvedInitialType = initialType ?? (initialShipmentId && !initialShipmentInvoice ? "Driver" : "Client");
  const [type, setType] = useState<"Client" | "Driver">(resolvedInitialType);
  const [invoiceId, setInvoiceId] = useState(() => {
    if (initialInvoiceId) return initialInvoiceId;
    if (initialShipmentId) return initialShipmentInvoice?.id ?? "";
    return invoices[0]?.id || "";
  });
  const [driverId, setDriverId] = useState(() => {
    if (initialDriverId) return initialDriverId;
    if (initialShipmentId) {
      const shipment = initialShipment;
      if (shipment) {
        if (shipment.assignments && shipment.assignments.length === 1) {
           return shipment.assignments[0].driverId || "";
        }
        if (shipment.driverId && (!shipment.assignments || shipment.assignments.length === 0)) {
           return shipment.driverId;
        }
        return ""; // Multiple drivers or none => force selection
      }
    }
    return "";
  });
  const [shipmentAssignmentId, setShipmentAssignmentId] = useState(() => {
    if (!initialShipmentId) return "";
    const shipment = shipments.find((item) => item.id === initialShipmentId);
    const matches = shipment?.assignments?.filter((assignment) => !initialDriverId || assignment.driverId === initialDriverId) ?? [];
    return matches.length === 1 ? matches[0].id ?? "" : "";
  });
  const [shipmentId, setShipmentId] = useState(initialShipmentId || "");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentType, setPaymentType] = useState<DriverPaymentInput["paymentType"]>("settlement");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentShipment = shipments.find((item) => item.id === shipmentId);
  const activeAssignment = currentShipment?.assignments?.find((assignment) =>
    shipmentAssignmentId ? assignment.id === shipmentAssignmentId : assignment.driverId === driverId,
  );
  const currentPending = activeAssignment?.pending ?? (currentShipment ? currentShipment.pending : null);
  const currentNumericAmount = Number(amount) || 0;

  const submit = () => {
    const numericAmount = Number(amount) || 0;
    const invoice = invoices.find((item) => item.id === invoiceId);
    const shipment = shipments.find((item) => item.id === shipmentId) ?? shipments.find((item) => item.id === invoice?.shipmentId);
    if (numericAmount <= 0) {
      setError("Payment amount must be greater than zero.");
      return;
    }
    if (type === "Client" && !invoice) {
      setError("Select a generated invoice before recording a client payment.");
      return;
    }
    if (type === "Driver" && (!shipment || !driverId)) {
      setError("Select a shipment and its assigned driver.");
      return;
    }
    if (type === "Driver" && currentPending !== null && numericAmount > currentPending) {
      setError(`Payment exceeds the current driver balance of ${money(currentPending)}.`);
      return;
    }
    const payload: PaymentModalInput =
      type === "Client"
        ? {
            type,
            clientPayment: {
              invoiceId,
              clientId: invoice?.clientId ?? shipment?.clientId ?? "",
              shipmentId: invoice?.shipmentId ?? shipment?.id ?? null,
              amount: numericAmount,
              paymentDate,
              paymentMethod,
              referenceNo,
              notes,
            },
          }
        : {
            type,
            driverPayment: {
              driverId: driverId || shipment?.driverId || "",
              shipmentId: shipmentId || null,
              shipmentAssignmentId: shipmentAssignmentId || null,
              amount: numericAmount,
              paymentType,
              paymentDate,
              paymentMethod,
              referenceNo,
              notes,
            },
          };

    setSaving(true);
    setError("");
    Promise.resolve(onSave(payload))
      .then(() => onClose())
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to save payment"))
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      title="Add Payment"
      onClose={onClose}
      size="medium"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn-primary" form="payment-form" type="submit" disabled={saving || (type === "Driver" && !driverId)}>
            {saving ? "Saving..." : "Save Payment"}
          </button>
        </>
      }
    >
      <form id="payment-form" className="form-layout" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Payment Details</h3>
            <p>Record a client receipt or driver payout in the finance ledger.</p>
          </div>
          {error && <div className="alert-danger mb-4 p-3 rounded">{error}</div>}
          <div className="form-grid">
            <SelectField label="Payment Type" value={type} onChange={(value) => setType(value as "Client" | "Driver")} options={["Client", "Driver"]} disabled={!!initialType} />
            {type === "Client" ? (
              <>
                <label className="field">
                  <span>Related Invoice</span>
                  <select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} disabled={!!initialShipmentId || !!initialInvoiceId}>
                    {!availableInvoices.length && <option value="">No invoice generated for this shipment</option>}
                    {availableInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} - {invoice.clientName || "Client"}
                      </option>
                    ))}
                  </select>
                </label>
                {initialShipmentId && !initialShipmentInvoice && (
                  <div className="field flex flex-col justify-center bg-[var(--bg-hover)] p-2 rounded border border-[var(--line-soft)]">
                    <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold mb-1">Client payment unavailable</span>
                    <span className="text-sm text-[var(--ink-2)]">Generate this shipment's invoice before recording a client payment.</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="field">
                  <span>Related Shipment</span>
                  <select value={shipmentId} onChange={(event) => {
                    const newShipmentId = event.target.value;
                    setShipmentId(newShipmentId);
                    const s = shipments.find(x => x.id === newShipmentId);
                    if (s && s.assignments && s.assignments.length === 1) {
                      setDriverId(s.assignments[0].driverId || "");
                      setShipmentAssignmentId(s.assignments[0].id || "");
                    } else if (s && (!s.assignments || s.assignments.length === 0)) {
                      setDriverId(s.driverId || "");
                      setShipmentAssignmentId("");
                    } else {
                      setDriverId("");
                      setShipmentAssignmentId("");
                    }
                  }} disabled={!!initialShipmentId}>
                    <option value="">Unassigned payment</option>
                    {shipments.map((shipment) => (
                      <option key={shipment.id} value={shipment.id}>
                        {shipment.invoice} - {shipment.driverName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Driver</span>
                  <select
                    value={shipmentAssignmentId || driverId}
                    onChange={(event) => {
                      const assignment = currentShipment?.assignments?.find((item) => (item.id || item.driverId) === event.target.value);
                      if (assignment) {
                        setShipmentAssignmentId(assignment.id || "");
                        setDriverId(assignment.driverId || "");
                      } else {
                        setShipmentAssignmentId("");
                        setDriverId(event.target.value);
                      }
                    }}
                    disabled={!!initialDriverId}
                    required
                  >
                    <option value="">Select a driver</option>
                    {currentShipment?.assignments?.length ? (
                      currentShipment.assignments.map((a) => (
                        <option key={a.id || a.driverName} value={a.id || a.driverId || `unlinked-${a.driverName}`} disabled={!a.driverId}>
                          {a.driverName} {!a.driverId ? "(Not linked to Master)" : ""} — Rate {money(a.driverRate)} — Advance {money(a.advancePaid || 0)} — Pending {money(a.pending || 0)}
                        </option>
                      ))
                    ) : (
                      drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="field">
                  <span>Payment Type</span>
                  <select value={paymentType ?? "settlement"} onChange={(e) => setPaymentType(e.target.value as DriverPaymentInput["paymentType"])}>
                    <option value="advance">Advance</option>
                    <option value="settlement">Remaining Amount</option>
                  </select>
                </label>
              </>
            )}
            {type === "Driver" && currentPending !== null && (
              <div className="field flex flex-col justify-center bg-[var(--bg-hover)] p-2 rounded border border-[var(--line-soft)]">
                <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold mb-1">Current Pending Amount</span>
                <span className="text-sm font-bold text-[var(--ink-2)]">{money(currentPending)}</span>
              </div>
            )}
            {type === "Driver" && currentPending !== null && currentNumericAmount > 0 && (
              <div className="field flex flex-col justify-center bg-[var(--bg-hover)] p-2 rounded border border-[var(--line-soft)]">
                <span className="text-[10px] text-[var(--ink-3)] uppercase font-semibold mb-1">Pending After This Payment</span>
                <span className="text-sm font-bold text-[var(--ink-2)]">{money(Math.max(currentPending - currentNumericAmount, 0))}</span>
              </div>
            )}
            <label className="field"><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
            <label className="field"><span>Payment Date</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label>
            <label className="field"><span>Payment Method</span><input value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} /></label>
            <label className="field"><span>Reference No</span><input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="Check #, Trx ID" /></label>
            <label className="field form-wide"><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-header">
            <h3>Receipts & Documents</h3>
            <p>Upload a receipt or proof of payment. It will be linked to the selected shipment.</p>
          </div>
          {shipmentId ? (
            <ShipmentAttachmentManager
              shipmentId={shipmentId}
              defaultCategory={type === "Client" ? "client_document" : "receipt"}
              compact
            />
          ) : (
            <div className="text-sm text-[var(--ink-3)] p-4 border border-dashed border-[var(--line-soft)] rounded-[var(--radius)] text-center">
              Select a shipment above to upload payment documents.
            </div>
          )}
        </section>
      </form>
    </Modal>
  );
}

export function InvoicePreview({
  shipment,
  invoiceRecord,
  invoiceItems = [],
  shipmentExpenses = [],
  onClose,
}: {
  shipment: Shipment;
  invoiceRecord?: Invoice;
  invoiceItems?: InvoiceItem[];
  shipmentExpenses?: import("../types/domain").ShipmentExpense[];
  onClose: () => void;
}) {
  const invoiceNumber = invoiceRecord?.invoiceNumber || shipment.invoice;
  return (
    <Modal title={`Invoice Preview - ${invoiceNumber}`} onClose={onClose} size="wide">
      <InvoicePrintTemplate shipment={shipment} invoiceRecord={invoiceRecord} invoiceItems={invoiceItems} shipmentExpenses={shipmentExpenses} />
    </Modal>
  );
}
