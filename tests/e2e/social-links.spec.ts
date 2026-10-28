import { expect, test } from "@playwright/test";

for (const path of ["/jane-doe", "/book/jane-doe"]) {
  test(`social profiles open from ${path} without losing the booking page`, async ({
    page,
    context,
  }) => {
    await context.route("https://www.instagram.com/example/", (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>Stylist profile</title>" }),
    );
    await page.goto(path);
    const socialProfiles = page.getByRole("navigation", { name: "Stylist social profiles" });
    const instagram = socialProfiles.getByRole("link", { name: "Instagram (opens in a new tab)" });
    await expect(instagram).toBeVisible();
    await expect(socialProfiles.getByRole("link", { name: /^Facebook/ })).toHaveAttribute(
      "href",
      "https://www.facebook.com/example/",
    );
    await expect(instagram).toHaveAttribute("rel", "noopener noreferrer");
    if (path.startsWith("/book/"))
      await page.getByRole("radio", { name: "Signature haircut", exact: true }).check();

    const popupPromise = page.waitForEvent("popup");
    await instagram.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL("https://www.instagram.com/example/");
    await expect(page).toHaveURL(path);
    if (path.startsWith("/book/"))
      await expect(
        page.getByRole("radio", { name: "Signature haircut", exact: true }),
      ).toBeChecked();
    await popup.close();
  });
}
