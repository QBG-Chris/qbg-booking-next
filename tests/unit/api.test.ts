import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { demoAvailability, demoProfile, demoServices } from "@/lib/demo";
import { BookingRequestConflict } from "@/lib/booking";

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

const requestKey = "8b3f9a3e-2f4c-4d7a-9c1e-5a6b7c8d9e0f";

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
      expect.anything(),
      expect.any(String),
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
  it("rejects a request whose service runs into a newly added schedule block", async () => {
    vi.mocked(repository.getBusyPeriods).mockResolvedValue([
      { appointment_start_time: "11:00:00", appointment_end_time: "12:00:00" },
    ]);
    expect((await POST(request(input))).status).toBe(409);
    expect(repository.getBusyPeriods).toHaveBeenCalledWith(input.slug, input.date);
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
  it("saves the requester's identity details with the appointment and their own opt-in", async () => {
    const response = await POST(
      request({ ...input, phone: "+1 (555) 123-4567", firstName: " Alex ", requestKey }),
    );
    expect(response.status).toBe(201);
    expect(repository.createBooking).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        stylist_slug: "jane-doe",
        client_name: "Alex Smith",
        client_phone: "+15551234567",
        client_email: "alex@example.com",
        status: "requested",
        is_online_booking: true,
      }),
      { firstName: "Alex", lastName: "Smith", smsConsent: true },
      requestKey,
    );
    // The receipt shows the same phone saved on the appointment and the identity.
    expect((await response.json()).booking.client_phone).toBe("+15551234567");
  });
  it("sends a retried request's key unchanged so the database returns the saved booking", async () => {
    await POST(request({ ...input, requestKey }));
    await POST(request({ ...input, requestKey }));
    expect(vi.mocked(repository.createBooking).mock.calls.map((call) => call[2])).toEqual([
      requestKey,
      requestKey,
    ]);
  });
  it("uses a one-time key for clients that don't send one", async () => {
    await POST(request(input));
    await POST(request(input));
    const [first, second] = vi.mocked(repository.createBooking).mock.calls.map((call) => call[2]);
    expect(first).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(second).not.toBe(first);
  });
  it("rejects malformed request keys without writing", async () => {
    expect((await POST(request({ ...input, requestKey: "1; drop table" }))).status).toBe(400);
    expect(repository.createBooking).not.toHaveBeenCalled();
  });
  it("asks for a review when a request key was used for different details", async () => {
    vi.mocked(repository.createBooking).mockRejectedValue(new BookingRequestConflict());
    const response = await POST(request({ ...input, requestKey }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/review/);
    expect(imageStorage.createImageUploadToken).not.toHaveBeenCalled();
  });
  it("never accepts identity, ownership, or consent fields from the visitor", async () => {
    await POST(
      request({
        ...input,
        identity_id: "someone-elses-identity",
        user_id: "another-stylist",
        is_client: true,
        consent_status: true,
      }),
    );
    const [payload, requester] = vi.mocked(repository.createBooking).mock.calls[0];
    expect(payload).not.toHaveProperty("identity_id");
    expect(payload).not.toHaveProperty("user_id");
    expect(requester).toEqual({ firstName: "Alex", lastName: "Smith", smsConsent: true });
  });
});

describe("availability endpoint", () => {
  it("fails closed when a schedule block lookup fails", async () => {
    vi.mocked(repository.getBusyPeriods).mockRejectedValue(new Error("private block lookup error"));
    const response = await GET(
      new NextRequest("http://localhost/api/stylists/jane-doe/availability?date=2026-10-20"),
      { params: Promise.resolve({ slug: "jane-doe" }) },
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private block lookup error");
  });
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
