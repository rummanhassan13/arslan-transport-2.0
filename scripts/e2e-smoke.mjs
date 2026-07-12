import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { chromium, devices } from "@playwright/test";

const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const appUrl = "http://127.0.0.1:4173/app/";

async function isReady() {
  try {
    const response = await fetch(appUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Vite test server did not become ready within 30 seconds.");
}

async function stopServer(server) {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  } else {
    server.kill("SIGTERM");
  }
}

async function runViewport(browser, name, device) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  try {
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    if (name === "desktop") {
      const hideSidebar = page.getByRole("button", { name: "Hide sidebar" });
      await hideSidebar.click();
      await page.locator('html[data-sidebar-pinned="false"]').waitFor({ state: "attached" });
      const openNavigation = page.getByRole("button", { name: "Open navigation menu" });
      await openNavigation.waitFor({ state: "visible" });
      await openNavigation.click();
      const pinSidebar = page.getByRole("button", { name: "Keep sidebar open" });
      await pinSidebar.waitFor({ state: "visible" });
      await pinSidebar.click();
      await page.locator('html[data-sidebar-pinned="true"]').waitFor({ state: "attached" });
    }

    const dashboardButton = page.locator("button:visible").filter({ hasText: /^(Dashboard|Home)$/ });
    if (await dashboardButton.count() !== 1) throw new Error(`${name}: dashboard navigation is missing or ambiguous.`);
    await dashboardButton.click();
    await page.getByRole("heading", { name: "Operations overview", exact: true }).waitFor({ state: "visible" });
    await new Promise((resolve) => setTimeout(resolve, 750));
    const renderLoopErrors = consoleErrors.filter((message) => message.includes("Maximum update depth exceeded"));
    if (renderLoopErrors.length) throw new Error(`${name}: React update loop detected.`);

    const shipmentsButton = page.locator("button:visible").filter({ hasText: /^Shipments$/ });
    if (await shipmentsButton.count() !== 1) throw new Error(`${name}: shipment navigation is missing or ambiguous.`);
    await shipmentsButton.click();
    await page.getByRole("heading", { name: "Shipments", exact: true }).waitFor({ state: "visible" });

    if (name === "desktop") {
      await page.getByRole("button", { name: "Custom", exact: true }).click();
      const viewSummary = page.getByRole("button", { name: "View Summary" }).first();
      await viewSummary.click();
      const recordPayment = page.getByRole("button", { name: "Record Payment", exact: true });
      await recordPayment.waitFor({ state: "visible" });
      if (await page.getByRole("button", { name: /Add (driver|Client) Payment/i }).count()) {
        throw new Error("desktop: legacy shipment payment buttons are still visible.");
      }
      await page.getByText("Driver Total", { exact: true }).waitFor({ state: "visible" });
      await recordPayment.click();
      await page.getByRole("heading", { name: "Add Payment", exact: true }).waitFor({ state: "visible" });
      const relatedShipment = page.getByRole("combobox", { name: "Related Shipment", exact: true });
      const relatedInvoice = page.getByRole("combobox", { name: "Related Invoice", exact: true });
      if (await relatedShipment.count()) {
        if (!(await relatedShipment.isDisabled()) || !(await relatedShipment.inputValue())) {
          throw new Error("desktop: shipment-scoped driver payment did not lock the current shipment.");
        }
        const driverSelect = page.getByRole("combobox", { name: "Driver", exact: true });
        await driverSelect.selectOption({ index: 1 });
        await page.getByRole("spinbutton", { name: "Amount", exact: true }).fill("100");
        await page.getByRole("button", { name: "Save Payment", exact: true }).click();
        const deletePayment = page.getByRole("button", { name: /Delete Driver Payment/i });
        await deletePayment.waitFor({ state: "visible" });
        page.once("dialog", (dialog) => dialog.accept());
        await deletePayment.click();
        await page.getByText("No payments recorded for this shipment.", { exact: true }).waitFor({ state: "visible" });
      } else if (await relatedInvoice.count()) {
        if (!(await relatedInvoice.isDisabled())) {
          throw new Error("desktop: shipment-scoped client payment did not lock its invoice.");
        }
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      } else {
        throw new Error("desktop: payment modal did not expose a shipment-scoped payment target.");
      }
      await page.getByRole("button", { name: "Close", exact: true }).click();
    }

    const financeButton = page.locator("button:visible").filter({ hasText: /^Finance$/ });
    if (await financeButton.count() !== 1) throw new Error(`${name}: finance navigation is missing or ambiguous.`);
    await financeButton.click();
    await page.getByRole("heading", { name: "Finance", exact: true }).waitFor({ state: "visible" });

    if (name === "desktop") {
      await page.getByRole("button", { name: "New shipment", exact: true }).click();
      const invoiceReference = await page.getByRole("textbox", { name: "Invoice", exact: true }).inputValue();
      await page.getByRole("combobox", { name: "Customer", exact: true }).selectOption({ index: 1 });
      await page.getByRole("combobox", { name: "Loading Point", exact: true }).selectOption({ index: 1 });
      await page.getByRole("combobox", { name: "Destination", exact: true }).selectOption({ index: 1 });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("combobox", { name: "Driver Name", exact: true }).selectOption({ index: 1 });
      await page.getByRole("textbox", { name: "From Location", exact: true }).fill("Port Qasim");
      await page.getByRole("textbox", { name: "To Location", exact: true }).fill("Lahore");
      await page.getByRole("spinbutton", { name: "Driver Rate", exact: true }).fill("1000");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("spinbutton", { name: "Company Rate", exact: true }).fill("1500");
      await page.getByRole("button", { name: "Save Shipment", exact: true }).click();
      await page.getByText(new RegExp(`Shipment saved and invoice ${invoiceReference} generated automatically\\.`)).waitFor({ state: "visible" });
      const generatedInvoiceRow = page.getByRole("row").filter({ hasText: invoiceReference });
      if (await generatedInvoiceRow.count() !== 1) {
        throw new Error("desktop: a newly created shipment did not produce exactly one invoice row.");
      }
      if (await generatedInvoiceRow.getByRole("button", { name: /Download Invoice/i }).count() !== 1) {
        throw new Error("desktop: the automatically generated invoice has no preview/download action.");
      }
    }

    const fatalErrors = consoleErrors.filter((message) =>
      /maximum update depth|uncaught|unhandled|typeerror|referenceerror/i.test(message),
    );
    if (fatalErrors.length) throw new Error(`${name}: browser console errors:\n${fatalErrors.join("\n")}`);
    console.log(`PASS ${name}: dashboard runtime and primary navigation`);
  } finally {
    await context.close();
  }
}

const alreadyRunning = await isReady();
const server = alreadyRunning ? null : spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", "4173"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_DEMO_MODE: "true" },
  stdio: "ignore",
  windowsHide: true,
});

let browser;
let failure = null;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  await runViewport(browser, "desktop", devices["Desktop Chrome"]);
  await runViewport(browser, "mobile", devices["Pixel 7"]);
  console.log("E2E smoke suite passed (2 viewports)." );
} catch (error) {
  failure = error;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  if (browser) {
    await Promise.race([
      browser.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  }
  await stopServer(server);
}

// Some Windows browser transports keep an inert pipe handle after Chromium has
// exited. Use an explicit exit after all contexts and the Vite process are closed.
process.exit(failure ? 1 : 0);
