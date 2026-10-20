import { expect, test, type Page } from "@playwright/test";

async function chooseService(page: Page, navigate = true) {
  if (navigate) await page.goto("/book/jane-doe");
  await expect(page.getByRole("heading", { name: "Choose your service" }).first()).toBeVisible();
  await expect(page.getByText("Demo preview", { exact: false }).first()).toBeVisible();
  await page.getByRole("radio", { name: "Signature haircut", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function chooseDate(page: Page) {
  const tomorrow = await page.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() + 1);
    return day.toLocaleDateString("en-US");
  });
  const day = page.locator(`button[data-day="${tomorrow}"]`).first();
  if (!(await day.count())) await page.getByRole("button", { name: /next month/i }).click();
  await day.click();
}
async function reachDetails(page: Page) {
  await chooseService(page);
  await chooseDate(page);
  await expect(page.getByRole("radio", { name: "9:00 AM", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "9:30 AM", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "10:00 AM", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function fillDetails(page: Page) {
  await page.getByLabel("First name").fill("Alex");
  await page.getByLabel("Last name").fill("Smith");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("alex@example.com");
  await page.getByLabel("Phone number").fill("+1 (555) 123-4567");
  await page.getByLabel("Anything else?").fill("A little shorter, please.");
}

const photo = {
  name: "hair-inspo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYl0AAAAASUVORK5CYII=",
    "base64",
  ),
};

test("phone formatting supports typing, pasting, editing, and clearing", async ({ page }) => {
  await reachDetails(page);
  await expect(page.getByRole("heading", { name: "A few details about you" })).toBeFocused();
  const phone = page.getByLabel("Phone number");
  await phone.pressSequentially("555");
  await expect(phone).toHaveValue("(555");
  await phone.pressSequentially("1234567");
  await expect(phone).toHaveValue("(555) 123-4567");
  await phone.press("Backspace");
  await expect(phone).toHaveValue("(555) 123-456");

  await phone.fill("5551234567");
  await phone.evaluate((element: HTMLInputElement) => element.setSelectionRange(9, 9));
  await phone.press("Backspace");
  await expect(phone).toHaveValue("(555) 124-567");
  await phone.press("3");
  await expect(phone).toHaveValue("(555) 123-4567");
  await phone.evaluate((element: HTMLInputElement) => element.setSelectionRange(9, 9));
  await phone.press("Delete");
  await expect(phone).toHaveValue("(555) 123-567");

  await phone.fill("+1 5551234567");
  await expect(phone).toHaveValue("+1 (555) 123-4567");
  await phone.fill("15551234567");
  await expect(phone).toHaveValue("+1 (555) 123-4567");
  await phone.fill("");
  await expect(phone).toHaveValue("");
  await fillDetails(page);
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByText("+1 (555) 123-4567", { exact: true })).toBeVisible();
});

test("selfies offer files and camera capture, and release the camera on capture or cancel", async ({
  page,
}) => {
  // Supply a synthetic video stream without accessing the machine's camera.
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.assign(window, { selfieTestStreams: streams });
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#956b50";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream();
      streams.push(stream);
      return stream;
    };
  });
  const cameraStates = () =>
    page.evaluate(() =>
      (window as unknown as { selfieTestStreams: MediaStream[] }).selfieTestStreams.map(
        (stream) => stream.getVideoTracks()[0].readyState,
      ),
    );
  const camerasStopped = async () => (await cameraStates()).every((state) => state === "ended");
  await reachDetails(page);
  await fillDetails(page);
  await expect.poll(cameraStates).toEqual([]);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose selfie file", exact: true }).click();
  await (await chooser).setFiles({ ...photo, name: "selfie.png" });
  await expect(page.getByAltText("Selfie preview")).toBeVisible();
  await expect.poll(cameraStates).toEqual([]);

  await page.getByRole("button", { name: "Retake selfie photo" }).click();
  await expect(page.getByRole("button", { name: "Capture photo", exact: true })).toBeEnabled();
  await expect.poll(cameraStates).toContain("live");
  await page.getByRole("button", { name: "Cancel camera" }).click();
  await expect.poll(camerasStopped).toBe(true);
  await expect(page.getByText("selfie.png", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake selfie photo" })).toBeFocused();

  await page.getByRole("button", { name: "Retake selfie photo" }).click();
  await expect(page.getByRole("button", { name: "Capture photo", exact: true })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("selfie-camera.png"), fullPage: true });
  await page.getByRole("button", { name: "Capture photo", exact: true }).click();
  await expect(page.getByAltText("Selfie preview")).toBeVisible();
  await expect(page.getByText(/^selfie-\d+\.jpg$/)).toBeVisible();
  await expect.poll(camerasStopped).toBe(true);
  await page.getByRole("button", { name: "Retake selfie photo" }).click();
  await expect(page.getByRole("button", { name: "Capture photo", exact: true })).toBeEnabled();
  await expect.poll(cameraStates).toContain("live");
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect.poll(camerasStopped).toBe(true);
  await expect(page.getByAltText("Selfie preview")).toBeVisible();
  await page.getByRole("checkbox", { name: "Keep me updated about my appointment" }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
  await expect(page.getByText("Selfie", { exact: true })).toBeVisible();
});

test("denied camera access offers file selection", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await reachDetails(page);
  await page.getByRole("button", { name: "Take selfie photo", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Camera access was blocked" }),
  ).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose file instead" }).click();
  await (await chooser).setFiles({ ...photo, name: "selfie.png" });
  await expect(page.getByAltText("Selfie preview")).toBeVisible();
  await expect(page.getByRole("group", { name: "Take a selfie" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("optional photos validate, preview, replace, remove, and survive step changes", async ({
  page,
}) => {
  await reachDetails(page);
  await fillDetails(page);
  await page.getByLabel("Upload inspo photo", { exact: true }).setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Choose a JPG" })).toBeVisible();
  await page
    .getByLabel("Upload inspo photo", { exact: true })
    .setInputFiles({ ...photo, buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert").filter({ hasText: "smaller than 4 MB" })).toBeVisible();
  await page.getByLabel("Upload inspo photo", { exact: true }).setInputFiles(photo);
  await expect(page.getByAltText("Inspo photo preview")).toBeVisible();
  await page
    .getByLabel("Upload inspo photo", { exact: true })
    .setInputFiles({ ...photo, name: "new-inspo.png" });
  await expect(page.getByText("new-inspo.png", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace inspo photo" })).toBeVisible();
  await page.getByRole("button", { name: "Remove inspo photo" }).click();
  await expect(page.getByAltText("Inspo photo preview")).toHaveCount(0);
  await page.getByLabel("Upload inspo photo", { exact: true }).setInputFiles(photo);
  // Exercise drag and drop for the other optional photo.
  const transfer = await page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "my-selfie.png", { type: "image/png" }));
    return data;
  }, photo.buffer.toString("base64"));
  await page
    .getByLabel("Upload selfie", { exact: true })
    .locator("..")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByAltText("Selfie preview")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("photos-selected.png"), fullPage: true });
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByAltText("Inspo photo preview")).toBeVisible();
  await expect(page.getByAltText("Selfie preview")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("hair-inspo.png", { exact: true })).toBeVisible();
  await expect(page.getByText("my-selfie.png", { exact: true })).toBeVisible();

  let bookings = 0;
  let inspoUploads = 0;
  let selfieUploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/bookings")) bookings++;
  });
  await page.route("**/api/bookings/*/images", async (route) => {
    const isSelfie = route.request().postDataBuffer()!.includes(Buffer.from("\r\nselfie\r\n"));
    if (isSelfie) selfieUploads++;
    else inspoUploads++;
    if (isSelfie && selfieUploads === 1)
      await route.fulfill({ status: 503, json: { error: "Upload failed. Please retry." } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Review booking" }).click();
  await page.getByRole("checkbox", { name: "Keep me updated about my appointment" }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(
    page.getByText("Your booking is requested. Let’s finish your photos."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry photos", exact: true }).click();
  await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
  await expect(page.getByText("Inspo photo · Selfie", { exact: true })).toBeVisible();
  expect({ bookings, inspoUploads, selfieUploads }).toEqual({
    bookings: 1,
    inspoUploads: 1,
    selfieUploads: 2,
  });
  await page.reload();
  await expect(page.getByText("Inspo photo · Selfie", { exact: true })).toBeVisible();
});

test("one optional selfie can be attached on its own", async ({ page }) => {
  await reachDetails(page);
  await fillDetails(page);
  await page
    .getByLabel("Upload selfie", { exact: true })
    .setInputFiles({ ...photo, name: "selfie.png" });
  await page.getByRole("button", { name: "Review booking" }).click();
  await page.getByRole("checkbox", { name: "Keep me updated about my appointment" }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
  await expect(page.getByText("Selfie", { exact: true })).toBeVisible();
  await expect(page.getByText("Inspo photo", { exact: true })).toHaveCount(0);
});

test("failed optional photos can be skipped after the appointment is requested", async ({
  page,
}) => {
  await reachDetails(page);
  await fillDetails(page);
  await page.getByLabel("Upload inspo photo", { exact: true }).setInputFiles(photo);
  await page.route("**/api/bookings/*/images", (route) =>
    route.fulfill({ status: 503, json: { error: "Please retry." } }),
  );
  await page.getByRole("button", { name: "Review booking" }).click();
  await page.getByRole("checkbox", { name: "Keep me updated about my appointment" }).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await page.getByRole("button", { name: "Continue without remaining photos" }).click();
  await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
  await expect(page.getByText("Photos attached", { exact: true })).toHaveCount(0);
});

test("lookup, profile, query slug, and missing stylist", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Find my stylist" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a booking name" })).toBeVisible();
  await page.getByLabel("Stylist booking name").fill("Jane-Doe");
  await page.getByRole("button", { name: "Find my stylist" }).click();
  await expect(page.getByRole("heading", { name: "Jane Doe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book an appointment" })).toBeVisible();
  await page.goto("/?slug=jane-doe");
  await expect(page).toHaveURL(/\/jane-doe$/);
  await page.goto("/unknown-stylist");
  await expect(page.getByRole("heading", { name: "Stylist not found" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("full request retains details, requires consent, retries, and survives confirmation refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/book/jane-doe");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Color", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Signature haircut", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Lived-in color", exact: true }).check();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Lived-in color", exact: true })).toBeChecked();
  await reachDetails(page);
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByText("Please enter a valid 10-digit US phone number.")).toBeVisible();
  await fillDetails(page);
  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByRole("button", { name: "Confirm booking" })).toBeDisabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("First name")).toHaveValue("Alex");
  await page.getByRole("button", { name: "Review booking" }).click();
  await page.getByRole("checkbox", { name: "Keep me updated about my appointment" }).check();
  await page.route(
    "**/api/bookings",
    (route) => route.fulfill({ status: 503, json: { error: "Please try again." } }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Your request couldn’t be sent")).toBeVisible();
  const response = page.waitForResponse(
    (response) => response.url().endsWith("/api/bookings") && response.status() === 201,
  );
  await page.getByRole("button", { name: "Confirm booking" }).click();
  const receipt = await (await response).json();
  expect(receipt.booking).toMatchObject({
    stylist_slug: "jane-doe",
    appointment_start_time: "10:00",
    appointment_end_time: "11:00",
    price: 85,
    status: "requested",
    client_phone: "5551234567",
    is_online_booking: true,
  });
  await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
  await expect(page.getByText("alex@example.com", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("availability errors fail closed and can be retried", async ({ page }) => {
  await page.route(
    "**/api/stylists/*/availability?*",
    (route) => route.fulfill({ status: 503, json: { error: "Please try again." } }),
    { times: 1 },
  );
  await chooseService(page);
  await chooseDate(page);
  await expect(page.getByText("Availability couldn’t be loaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("radio", { name: "10:00 AM", exact: true })).toBeVisible();
});

test("stale responses cannot replace the newly selected date", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/stylists/*/availability?*", async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ json: { busy: [] } }).catch(() => {});
    } else
      await route.fulfill({
        json: { busy: [{ appointment_start_time: "09:00", appointment_end_time: "17:00" }] },
      });
  });
  await chooseService(page);
  await chooseDate(page);
  await expect.poll(() => calls).toBe(1);
  const nextDate = await page.evaluate(() => {
    const day = new Date();
    day.setDate(day.getDate() + 2);
    return day.toLocaleDateString("en-US");
  });
  const day = page.locator(`button[data-day="${nextDate}"]`).first();
  if (!(await day.count())) await page.getByRole("button", { name: /next month/i }).click();
  await day.click();
  await expect(page.getByText("No available times for this date")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect.poll(() => calls).toBe(2);
});

for (const width of [320, 390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`all screens fit ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme });
      async function checkLayout(name: string) {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        if (colorScheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
        await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
      }
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Find my stylist" })).toBeVisible();
      await checkLayout("landing");
      await page.goto("/jane-doe");
      await expect(page.getByRole("heading", { name: "Jane Doe" })).toBeVisible();
      await checkLayout("profile");
      await page.goto("/book/jane-doe");
      await expect(page.getByRole("heading", { name: "Choose your service" })).toBeVisible();
      await checkLayout("services");
      await chooseService(page, false);
      await chooseDate(page);
      await expect(page.getByRole("radio", { name: "10:00 AM", exact: true })).toBeVisible();
      await checkLayout("date-time");
      await page.getByRole("radio", { name: "10:00 AM", exact: true }).check();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await checkLayout("details");
      await fillDetails(page);
      await page.getByRole("button", { name: "Review booking" }).click();
      await expect(page.getByRole("heading", { name: "Review your appointment" })).toBeVisible();
      await checkLayout("review");
      await page.getByRole("checkbox", { name: "Keep me updated about my appointment" }).check();
      await page.getByRole("button", { name: "Confirm booking" }).click();
      await expect(page.getByText("Booking requested", { exact: true })).toBeVisible();
      await checkLayout("confirmation");
    });
  }
}

test("direct confirmation visits have a recovery path", async ({ page }) => {
  await page.goto("/book/jane-doe/confirmation");
  await expect(page.getByRole("heading", { name: "No booking request to show" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book an appointment" })).toBeVisible();
});

test("theme override persists across navigation and reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/jane-doe");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
