import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { demoAvailability, demoProfile, demoServices } from "@/lib/demo";

vi.mock("@/lib/server/repository", () => ({
  getProfile: vi.fn(),
  getServices: vi.fn(),
  getAvailability: vi.fn(),
  getBusyPeriods: vi.fn(),
  createBooking: vi.fn(),
}));
vi.mock("@/lib/server/request-images", () => ({
  checkRequestImageStorage: vi.fn(),
  createImageUploadToken: vi.fn(),
}));
import * as imageStorage from "@/lib/server/request-images";
import * as repository from "@/lib/server/repository";
import { POST } from "@/app/api/bookings/route";
import { GET } from "@/app/api/stylists/[slug]/availability/route";

const input = {
  slug: "jane-doe",
  serviceId: "cut",
  date: "2099-10-20",
  time: "10:30",
  firstName: "Alex",
  lastName: "Smith",
  email: "alex@example.com",
  phone: "5551234567",
  notes: "",
  smsConsent: true,
  timeZone: "America/Chicago",
};
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/bookings", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repository.getProfile).mockResolvedValue(demoProfile);
  vi.mocked(repository.getServices).mockResolvedValue(demoServices);
  vi.mocked(repository.getAvailability).mockResolvedValue(demoAvailability);
  vi.mocked(repository.getBusyPeriods).mockResolvedValue([]);
  vi.mocked(repository.createBooking).mockResolvedValue("b123");
  vi.mocked(imageStorage.checkRequestImageStorage).mockResolvedValue(undefined);
  vi.mocked(imageStorage.createImageUploadToken).mockReturnValue("scoped-upload-token");
});

describe("booking endpoint", () => {
  it("issues photo permission only after creating the appointment", async () => {
    const imageUploads = [{ kind: "inspo", contentType: "image/jpeg" }];
    const response = await POST(request({ ...input, imageUploads }));
    expect(response.status).toBe(201);
    expect(imageStorage.createImageUploadToken).toHaveBeenCalledWith("b123", imageUploads);
    expect(await response.json()).toMatchObject({ imageUploadToken: "scoped-upload-token" });
    expect(repository.createBooking).toHaveBeenCalledTimes(1);
  });
  it("does not create an appointment with photos when storage is unavailable", async () => {
    vi.mocked(imageStorage.checkRequestImageStorage).mockRejectedValue(new Error("missing config"));
    const response = await POST(
      request({ ...input, imageUploads: [{ kind: "selfie", contentType: "image/png" }] }),
    );
    expect(response.status).toBe(503);
    expect(repository.createBooking).not.toHaveBeenCalled();
    // Booking without photos remains available.
    expect((await POST(request(input))).status).toBe(201);
  });
  it("rejects duplicate photo kinds and unsupported formats before inserting", async () => {
    const image = { kind: "inspo", contentType: "image/jpeg" };
    expect((await POST(request({ ...input, imageUploads: [image, image] }))).status).toBe(400);
    expect(
      (
        await POST(
          request({ ...input, imageUploads: [{ ...image, contentType: "image/svg+xml" }] }),
        )
      ).status,
    ).toBe(400);
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it("takes prices and service names from the repository, and returns the receipt", async () => {
    const response = await POST(
      request({ ...input, price: 1, services: "Forged service", status: "confirmed" }),
    );
    expect(response.status).toBe(201);
    expect(repository.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 85,
        services: "Signature haircut",
        status: "requested",
        appointment_end_time: "11:30",
      }),
    );
    expect(await response.json()).toMatchObject({ id: "b123", stylist: { slug: "jane-doe" } });
  });
  it("rejects missing consent and malformed JSON without writing", async () => {
    expect((await POST(request({ ...input, smsConsent: false }))).status).toBe(400);
    const malformed = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: "{",
    });
    expect((await POST(malformed)).status).toBe(400);
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it("rejects services that do not belong to the selected stylist", async () => {
    expect((await POST(request({ ...input, serviceId: "other-tenant-service" }))).status).toBe(404);
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it("rechecks overlaps and past dates before accepting a request", async () => {
    vi.mocked(repository.getBusyPeriods).mockResolvedValue([
      { appointment_start_time: "10:00", appointment_end_time: "11:00" },
    ]);
    expect((await POST(request(input))).status).toBe(409);
    expect((await POST(request({ ...input, date: "2020-01-01" }))).status).toBe(409);
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it("fails closed when availability cannot be checked", async () => {
    vi.mocked(repository.getBusyPeriods).mockRejectedValue(new Error("Internal database message"));
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("Internal database message");
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it("allows retry after an insert failure", async () => {
    vi.mocked(repository.createBooking).mockRejectedValueOnce(new Error("failed"));
    expect((await POST(request(input))).status).toBe(503);
    expect((await POST(request(input))).status).toBe(201);
  });
});

describe("availability endpoint", () => {
  it("validates calendar dates and exposes only busy time ranges", async () => {
    vi.mocked(repository.getBusyPeriods).mockResolvedValue([
      { appointment_start_time: "09:00:00", appointment_end_time: "10:00:00" },
    ]);
    const params = Promise.resolve({ slug: "jane-doe" });
    const response = await GET(
      new NextRequest("http://localhost/api/stylists/jane-doe/availability?date=2026-10-20"),
      { params },
    );
    expect(await response.json()).toEqual({
      busy: [{ appointment_start_time: "09:00:00", appointment_end_time: "10:00:00" }],
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/stylists/jane-doe/availability?date=2026-02-30"),
          { params },
        )
      ).status,
    ).toBe(400);
  });
});
