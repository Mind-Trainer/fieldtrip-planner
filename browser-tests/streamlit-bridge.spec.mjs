import { test, expect } from "@playwright/test";

test("original Fieldtrip interface resolves live coordinates through Streamlit RPC", async ({ page }) => {
  await page.goto("http://127.0.0.1:8501", { waitUntil: "domcontentloaded" });
  const ui = page.frameLocator('iframe[title*="fieldtrip_original"]');
  await expect(ui.locator("#fieldtrip-origin")).toBeVisible({ timeout: 45000 });
  await ui.locator("#fieldtrip-origin").fill("8.179,77.43");
  await ui.locator("#fieldtrip-destination").fill("8.7139,77.6926");
  await ui.locator("#fieldtrip-resolve").click();
  await expect(ui.locator("#fieldtrip-bridge-status")).toContainText(
    "Confirm both locations", { timeout: 45000 }
  );
  await expect(ui.locator("#fieldtrip-apply")).toBeEnabled();
  await ui.locator("#fieldtrip-apply").click();
  await expect(ui.locator("#fieldtrip-bridge-status")).toContainText(
    "Live route selected", { timeout: 45000 }
  );
  await expect(ui.getByText("Live services", {exact: true}).first()).toBeVisible({timeout: 45000});
  // Routing uses an actual public OSRM endpoint, with normal Internet variability.
  await ui.locator(".load-route").click();
  await expect(ui.getByText("Search entire corridor")).toBeVisible({timeout: 60000});
});
