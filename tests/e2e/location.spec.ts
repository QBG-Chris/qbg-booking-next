import { devices, expect, test } from "@playwright/test";

const destination = "123 Main Street, Nashville, TN 37201";
const google = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

test("profile shows a map and opens Google Maps directions in a new tab on the web", async ({
  page,
}) => {
  await page.goto("/jane-doe");
  const location = page.getByRole("region", { name: "Location" });
  await expect(location.getByText(destination)).toBeVisible();
  await expect(location.locator("iframe")).toHaveAttribute("src", /google\.com\/maps\?q=/);
  const directions = location.getByRole("link", { name: /Get directions/ });
  await expect(directions).toHaveAttribute("href", google);
  await expect(directions).toHaveAttribute("target", "_blank");
  await expect(directions).toHaveAttribute("rel", "noopener noreferrer");
});

test.describe("on iPhone", () => {
  test.use({ userAgent: devices["iPhone 15"].userAgent, viewport: { width: 393, height: 852 } });
  test("directions open Apple Maps in place", async ({ page }) => {
    await page.goto("/jane-doe");
    const directions = page.getByRole("link", { name: "Get directions" });
    await expect(directions).toHaveAttribute("data-platform", "ios");
    await expect(directions).toHaveAttribute(
      "href",
      `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`,
    );
    await expect(directions).not.toHaveAttribute("target", /.*/);
  });
});

test.describe("on Android", () => {
  test.use({ userAgent: devices["Pixel 7"].userAgent, viewport: { width: 412, height: 915 } });
  test("directions hand off to the Google Maps app in place", async ({ page }) => {
    await page.goto("/jane-doe");
    const directions = page.getByRole("link", { name: "Get directions" });
    await expect(directions).toHaveAttribute("data-platform", "android");
    await expect(directions).toHaveAttribute("href", google);
    await expect(directions).not.toHaveAttribute("target", /.*/);
  });
});
