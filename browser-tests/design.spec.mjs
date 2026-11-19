import { test, expect } from "@playwright/test";
test("desktop and mobile layouts retain navigation, maps and service details", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Search entire corridor" }).click();
  await expect(page.getByRole("status")).toContainText("335 matching");
  await page.screenshot({ path: info.outputPath("desktop-overview.png") });
  await page
    .locator(".side-links")
    .getByRole("link", { name: "Services" })
    .click();
  await expect(page.locator("#services")).toBeInViewport();
  await page
    .locator("#services")
    .screenshot({ path: info.outputPath("services.png") });
  await page.locator(".cards button:visible").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Tour progress").fill("48");
  await page
    .getByRole("button", { name: "Trigger emergency", exact: true })
    .click();
  await page
    .getByLabel("Choose an assistance facility")
    .selectOption({ index: 1 });
  await page
    .locator("#tour")
    .screenshot({ path: info.outputPath("tour-emergency.png") });
  await page
    .getByRole("button", { name: "Simulate assistance completed" })
    .click();
  await page.getByRole("button", { name: "Start / resume tour" }).click();
  await expect(page.locator(".tour-state")).toContainText("Travelling");
  await expect(page.getByLabel("Tour progress")).not.toHaveValue("48");
  await page.getByRole("button", { name: "Pause tour", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".brand").click();
  await page.screenshot({
    path: info.outputPath("mobile-overview.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Search entire corridor" }).click();
  await expect(page.getByRole("status")).toContainText("335 matching");
  await page.locator(".cards button:visible").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: info.outputPath("mobile-detail.png") });
  expect(errors).toEqual([]);
});

test('long route remains interactive with all service records',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');
 await page.getByLabel('Destination',{exact:true}).selectOption('Bengaluru');
 await page.getByRole('button',{name:'Load driving routes'}).click();
 await page.getByRole('button',{name:'Search entire corridor'}).click();
 await expect(page.getByRole('status')).toContainText('5423 matching',{timeout:30000});
 await page.getByLabel('Search directory').fill('hospital');
 await expect(page.locator('.service-card').first()).toBeAttached();
 await page.getByRole('button',{name:'Fit route to map'}).click();
 await expect(page.locator('.mapwrap .marker-cluster').first()).toBeVisible();
});

test('standalone offline file bundles its assets and discovers real data',async({browser})=>{
 const {readFileSync}=await import('node:fs');
 const context=await browser.newContext();
 const page=await context.newPage();
 const unexpected=[];
 await page.route('**/*',route=>{
   if(route.request().url()==='https://fieldtrip-offline.test/')return route.fulfill({contentType:'text/html',body:readFileSync('Fieldtrip-offline.html','utf8')});
   unexpected.push(route.request().url());return route.abort();
 });
 await page.goto('https://fieldtrip-offline.test/');
 await page.getByRole('button',{name:'Search entire corridor'}).click();
 await expect(page.getByRole('status')).toContainText('335 matching',{timeout:10000});
 await expect(page.locator('.mapwrap .marker-cluster').first()).toBeVisible();
 expect(unexpected).toEqual([]);
 await context.close();
});
