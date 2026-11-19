import { test, expect } from "@playwright/test";
test("inspect the real short-road corridor and find unplanned medical alternatives", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search entire corridor" }).click();
  await expect(page.getByRole("status")).toContainText(
    "335 matching OSM records",
  );
  await expect(page.locator(".marker-cluster").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("corridor.png") });
  await page.getByRole("button", { name: "Hide all", exact: true }).click();
  await expect(page.locator(".cards button")).toHaveCount(0);
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await page.locator(".cards button:visible").first().click();
  await expect(page.locator("aside")).toContainText("Not Verified");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Generate stop plan" }).click();
  await page.getByRole("button", { name: "Save journey" }).click();
  await expect(page.getByText("Trip and planned stops saved")).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate at route midpoint" })
    .click();
  await expect(
    page.getByText("Easwari Nursing Home", { exact: true }).last(),
  ).toBeVisible();
});
