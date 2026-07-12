import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("dashboard renders without React update loops", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/app/");
  await page.locator("button:visible").filter({ hasText: /^(Dashboard|Home)$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Operations overview", exact: true })).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 750));
  expect(consoleErrors.filter((message) => message.includes("Maximum update depth exceeded"))).toEqual([]);
});

test("primary navigation works on desktop and mobile", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("button:visible").filter({ hasText: /^Shipments$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Shipments", exact: true })).toBeVisible();
  await page.locator("button:visible").filter({ hasText: /^Finance$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
});
