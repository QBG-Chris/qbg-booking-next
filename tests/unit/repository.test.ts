import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingPayload } from "@/lib/booking";
import { demoServices } from "@/lib/demo";
import type { ScheduleBlock } from "@/lib/models";

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

describe("busy periods repository", () => {
  const date = "2099-10-20";
  const appointment = { appointment_start_time: "09:00:00", appointment_end_time: "10:00:00" };
  const daily: ScheduleBlock = {
    date: null,
    start_time: "12:00:00",
    end_time: "13:00:00",
    is_daily: true,
    is_weekly: false,
    days_of_week: null,
  };

  async function mockReads({
    blocks = [] as unknown[],
    blockError = false,
    owner = { user_id: "stylist-user" } as unknown,
    ownerError = false,
  } = {}) {
    const requests: URL[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      const table = url.pathname.split("/").at(-1);
      if ((table === "ScheduleBlocks" && blockError) || (table === "BookingProfiles" && ownerError))
        return Response.json(
          { code: "42501", message: "private database details" },
          { status: 403 },
        );
      const data =
        table === "BookingProfiles" ? owner : table === "Appointments" ? [appointment] : blocks;
      return Response.json(data);
    });
    // Exercise the actual Supabase query builder without making network requests.
    const actual =
      await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
    createClient.mockImplementation((url, key, options) =>
      actual.createClient(url, key, { ...options, global: { fetch } }),
    );
    return requests;
  }

  it("combines appointments and applicable blocks scoped to the profile's user_id", async () => {
    const requests = await mockReads({
      blocks: [
        { ...daily, user_id: "stylist-user", block_id: "private-block-id" },
        { ...daily, date, is_daily: false, start_time: "15:00", end_time: "16:00" },
        { ...daily, is_daily: false, is_weekly: true, days_of_week: "0, 6" },
        {
          ...daily,
          is_daily: false,
          is_weekly: true,
          days_of_week: "1, 3",
          start_time: "16:00",
          end_time: "16:30",
        },
        { ...daily, date: "2099-10-21" },
      ],
    });
    const { getBusyPeriods } = await import("@/lib/server/repository");
    expect(await getBusyPeriods("jane-doe", date)).toEqual([
      appointment,
      { appointment_start_time: "12:00:00", appointment_end_time: "13:00:00" },
      { appointment_start_time: "15:00", appointment_end_time: "16:00" },
      { appointment_start_time: "16:00", appointment_end_time: "16:30" },
    ]);
    const profileQuery = requests.find((url) => url.pathname.endsWith("/BookingProfiles"))!;
    expect(profileQuery.searchParams.get("select")).toBe("user_id");
    expect(profileQuery.searchParams.get("slug")).toBe("eq.jane-doe");
    const blockQuery = requests.find((url) => url.pathname.endsWith("/ScheduleBlocks"))!;
    expect(blockQuery.searchParams.get("user_id")).toBe("eq.stylist-user");
    expect(blockQuery.searchParams.get("or")).toBe(
      `(date.eq.${date},and(date.is.null,or(is_daily.eq.true,is_weekly.eq.true)))`,
    );
    const appointmentQuery = requests.find((url) => url.pathname.endsWith("/Appointments"))!;
    expect(appointmentQuery.searchParams.get("stylist_slug")).toBe("eq.jane-doe");
    expect(appointmentQuery.searchParams.get("appointment_date")).toBe(`eq.${date}`);
    expect(appointmentQuery.searchParams.get("status")).toBe("neq.cancelled");
  });

  it("preserves appointment conflicts when the stylist has no blocks", async () => {
    await mockReads();
    const { getBusyPeriods } = await import("@/lib/server/repository");
    expect(await getBusyPeriods("jane-doe", date)).toEqual([appointment]);
  });

  it("fails closed when blocks cannot be read", async () => {
    await mockReads({ blockError: true });
    const { getBusyPeriods } = await import("@/lib/server/repository");
    await expect(getBusyPeriods("jane-doe", date)).rejects.toThrow(
      "We couldn’t check availability. Please try again.",
    );
  });

  it.each([{ ownerError: true }, { owner: null }, { owner: { user_id: null } }])(
    "fails closed when the stylist's user_id cannot be resolved: %j",
    async (options) => {
      const requests = await mockReads(options);
      const { getBusyPeriods } = await import("@/lib/server/repository");
      await expect(getBusyPeriods("jane-doe", date)).rejects.toThrow();
      expect(requests.some((url) => url.pathname.endsWith("/ScheduleBlocks"))).toBe(false);
    },
  );

  it("fails closed on malformed block rows", async () => {
    await mockReads({ blocks: [{ ...daily, start_time: null }] });
    const { getBusyPeriods } = await import("@/lib/server/repository");
    await expect(getBusyPeriods("jane-doe", date)).rejects.toThrow();
  });

  it("uses the same block filtering in demo mode without accessing the database", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const { getBusyPeriods } = await import("@/lib/server/repository");
    expect(await getBusyPeriods("jane-doe", date)).toEqual([
      appointment,
      { appointment_start_time: "12:00:00", appointment_end_time: "13:00:00" },
    ]);
    expect(createClient).not.toHaveBeenCalled();
  });
});
