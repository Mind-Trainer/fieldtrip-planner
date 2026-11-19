import { test, expect } from "@playwright/test";
test("questionnaire, grouped services, verification filter and tour emergency", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".preferences-panel > summary").click();
  await page
    .getByRole("button", { name: "Apply answers and select route" })
    .click();
  await expect(
    page.getByText("The provider returned one road route.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search entire corridor" }).click();
  await expect(page.getByText(/335 matching OSM records/)).toBeVisible();
  await expect(
    page.getByText("Healthcare · 204", { exact: true }).last(),
  ).toBeVisible();
  await page.getByLabel("Show only Verified and Partially Verified").check();
  await expect(
    page.getByText(/No verified or partially verified records match/),
  ).toBeVisible();
  await page.getByLabel("Show only Verified and Partially Verified").uncheck();
  await page.getByLabel("Tour progress").fill("50");
  await page
    .getByRole("button", { name: "Trigger emergency", exact: true })
    .click();
  await expect(page.getByText("Journey paused for assistance")).toBeVisible();
  const options = page.getByLabel("Choose an assistance facility");
  await options.selectOption({ index: 1 });
  await page.route("**/api/drive?**", (r) =>
    r.fulfill({ json: { distance: 3843, duration: 389.2 } }),
  );
  await page
    .getByRole("button", { name: "Calculate driving route", exact: true })
    .click();
  await expect(
    page.getByText("3.8 km by road · 6 min estimated"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open driving directions" }),
  ).toHaveAttribute("href", /openstreetmap.org\/directions/);
  await page
    .getByRole("button", { name: "Simulate assistance completed" })
    .click();
  await page.getByLabel("Tour progress").fill("100");
  await expect(
    page.getByText("Demonstration complete.", { exact: false }),
  ).toBeVisible();
});
