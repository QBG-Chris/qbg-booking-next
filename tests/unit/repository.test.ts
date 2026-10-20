import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingPayload } from "@/lib/booking";
import { demoServices } from "@/lib/demo";

vi.mock("server-only", () => ({}));
const { from, insert, select, single, createClient } = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const payload = bookingPayload(
  {
    slug: "jane-doe",
    date: "2099-10-20",
    time: "10:30",
    firstName: "Alex",
    lastName: "Smith",
    email: "alex@example.com",
    phone: "5551234567",
    notes: "",
  },
  demoServices[0],
);

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anonymous-key");
  createClient.mockReturnValue({ from });
  from.mockReturnValue({ insert });
  insert.mockReturnValue({ select });
  select.mockReturnValue({ single });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("live booking repository", () => {
  it("returns the existing appointment_id as the receipt id without changing the insert payload", async () => {
    // Reproduce the live schema: Appointments has appointment_id, not id.
    select.mockImplementation((columns) => {
      single.mockResolvedValue(
        columns === "id:appointment_id"
          ? { data: { id: 123 }, error: null, status: 201 }
          : { data: null, error: { code: "42703" }, status: 400 },
      );
      return { single };
    });
    const { createBooking } = await import("@/lib/server/repository");
    await expect(createBooking(payload)).resolves.toBe("123");
    expect(from).toHaveBeenCalledWith("Appointments");
    expect(insert).toHaveBeenCalledExactlyOnceWith(payload);
  });

  it("logs database failure codes without leaking client data or database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    single.mockResolvedValue({
      data: null,
      error: {
        code: "23502",
        message: "private database message",
        details: `Failing row contains ${payload.client_email}`,
      },
      status: 400,
    });
    const { createBooking } = await import("@/lib/server/repository");
    await expect(createBooking(payload)).rejects.toThrow(
      "Your request couldn’t be sent. Please try again.",
    );
    expect(log).toHaveBeenCalledWith("[booking] Appointment insert failed.", {
      code: "23502",
      status: 400,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(payload.client_email);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database message");
  });
});
