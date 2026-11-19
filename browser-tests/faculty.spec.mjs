import { test, expect } from "@playwright/test";
test("faculty account signs in, verifies a record, persists a plan and signs out", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search entire corridor" }).click();
  await expect(page.getByRole("status")).toContainText("335 matching");
  await page
    .getByLabel("Faculty name", { exact: true })
    .fill("Automated test faculty");
  await page
    .getByLabel("Faculty password", { exact: true })
    .fill("test-session-password");
  await page
    .getByRole("button", { name: "Create faculty account", exact: true })
    .click();
  await expect(page.getByText("Faculty session active")).toBeVisible();
  await page.locator(".cards button:visible").first().click();
  await page.locator(".detail-drawer summary").click();
  await page
    .getByLabel("Status", { exact: true })
    .selectOption("Partially Verified");
  await page
    .getByLabel("Evidence or confirmation method")
    .fill("Automated test only in temporary database");
  await page
    .getByRole("button", { name: "Record verification", exact: true })
    .click();
  await expect(page.getByText("Verification recorded")).toBeVisible();
  await page
    .getByRole("button", { name: "Add planned stop", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Save journey", exact: true }).click();
  await expect(page.getByText("Trip and planned stops saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Saved journey reopened")).toBeVisible();
  await page.getByRole("button", { name: "Search entire corridor" }).click();
  await expect(page.getByRole("status")).toContainText("335 matching");
  await page.getByLabel("Show only Verified and Partially Verified").check();
  await expect(page.locator(".service-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Signed out", { exact: true })).toBeVisible();
  await page
    .getByLabel("Faculty password", { exact: true })
    .fill("test-session-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Faculty session active")).toBeVisible();
  await page.locator(".service-card").first().click();
  await page.locator(".detail-drawer summary").click();
  await page.getByLabel("Status", { exact: true }).selectOption("Not Verified");
  await page
    .getByLabel("Evidence or confirmation method")
    .fill("End automated test");
  await page
    .getByRole("button", { name: "Record verification", exact: true })
    .click();
  await expect(page.getByText("Verification recorded")).toBeVisible();
});
