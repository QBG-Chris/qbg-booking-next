import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { availableSlots, bookingPayload } from "@/lib/booking";
import { demoServices } from "@/lib/demo";
import type { ScheduleBlock } from "@/lib/models";

vi.mock("server-only", () => ({}));
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
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
const requester = { firstName: "Alex", lastName: "Smith", smsConsent: true };
const requestKey = "8b3f9a3e-2f4c-4d7a-9c1e-5a6b7c8d9e0f";

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anonymous-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Exercises the actual Supabase client against a fake PostgREST response. */
async function mockDatabase(response: () => Response) {
  const requests: { url: URL; apikey: string | null; body: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: new URL(input instanceof Request ? input.url : String(input)),
      apikey: new Headers(init?.headers).get("apikey"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return response();
  });
  const actual =
    await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  createClient.mockImplementation((url, key, options) =>
    actual.createClient(url, key, { ...options, global: { fetch } }),
  );
  return { requests, fetch };
}

describe("live booking repository", () => {
  it.each([true, false, null])(
    "loads the public profile with is_enabled set to %s",
    async (flag) => {
      const { requests } = await mockDatabase(() =>
        Response.json([{ id: 1, slug: "jane-doe", display_name: "Jane Doe", is_enabled: flag }]),
      );
      const { getProfile } = await import("@/lib/server/repository");
      await expect(getProfile("jane-doe")).resolves.toMatchObject({
        display_name: "Jane Doe",
        is_enabled: flag === true,
      });
      expect(requests[0].url.searchParams.get("select")?.split(",")).toContain("is_enabled");
      expect(requests[0].url.searchParams.has("is_enabled")).toBe(false);
    },
  );

  it("saves the identity and appointment through the server-only booking RPC", async () => {
    const { requests } = await mockDatabase(() => Response.json(123));
    const { createBooking } = await import("@/lib/server/repository");
    // The existing database uses appointment_id; receipts expose it as id.
    await expect(createBooking(payload, requester, requestKey)).resolves.toBe("123");
    expect(requests).toHaveLength(1);
    const [call] = requests;
    expect(call.url.pathname).toBe("/rest/v1/rpc/request_online_booking");
    // Identity writes need the privileged key; the public key never reaches them.
    expect(call.apikey).toBe("test-server-secret");
    expect(call.body).toEqual({
      p_request_key: requestKey,
      p_request: {
        stylist_slug: "jane-doe",
        first_name: "Alex",
        last_name: "Smith",
        phone: "+15551234567",
        email: "alex@example.com",
        sms_consent: true,
        services: "Signature haircut",
        appointment_date: "2099-10-20",
        appointment_start_time: "10:30",
        appointment_end_time: "11:30",
        notes: null,
        price: 85,
      },
    });
  });

  it.each([
    { SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    { SUPABASE_SECRET_KEY: "test-anonymous-key" },
  ])("fails closed before any request without a distinct server key: %j", async (env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetch } = await mockDatabase(() => Response.json(123));
    const { createBooking } = await import("@/lib/server/repository");
    await expect(createBooking(payload, requester, requestKey)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs database failure codes without leaking client data or database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await mockDatabase(() =>
      Response.json(
        {
          code: "23502",
          message: "private database message",
          details: `Failing row contains ${payload.client_email}`,
        },
        { status: 400 },
      ),
    );
    const { createBooking } = await import("@/lib/server/repository");
    await expect(createBooking(payload, requester, requestKey)).rejects.toThrow(
      "Your request couldn’t be sent. Please try again.",
    );
    expect(log).toHaveBeenCalledWith("[booking] Booking request failed.", {
      code: "23502",
      status: 400,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(payload.client_email);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database message");
  });

  it("reports a request key reused for different details as a conflict", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mockDatabase(() =>
      Response.json({ code: "PT409", message: "already used" }, { status: 409 }),
    );
    const { createBooking } = await import("@/lib/server/repository");
    // The same module instance the freshly imported repository uses.
    const { BookingRequestConflict } = await import("@/lib/booking");
    await expect(createBooking(payload, requester, requestKey)).rejects.toBeInstanceOf(
      BookingRequestConflict,
    );
  });

  it("rejects a missing appointment id instead of issuing a receipt", async () => {
    await mockDatabase(() => Response.json(null));
    const { createBooking } = await import("@/lib/server/repository");
    await expect(createBooking(payload, requester, requestKey)).rejects.toThrow();
  });

  it("never touches the database in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const { createBooking } = await import("@/lib/server/repository");
    await expect(createBooking(payload, requester, requestKey)).resolves.toBe(`demo-${requestKey}`);
    expect(createClient).not.toHaveBeenCalled();
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
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      const table = url.pathname.split("/").at(-1);
      // RLS can silently hide private blocks from a successful anonymous read.
      if (
        table === "ScheduleBlocks" &&
        new Headers(init?.headers).get("apikey") !== "test-server-secret"
      )
        return Response.json([]);
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

  it("excludes an 11 AM–noon block on the 29th even when anonymous RLS hides it", async () => {
    const blockedDate = "2026-10-29";
    await mockReads({
      blocks: [
        { ...daily, date: blockedDate, is_daily: false, start_time: "11:00", end_time: "12:00" },
      ],
    });
    const { getBusyPeriods } = await import("@/lib/server/repository");
    const busy = await getBusyPeriods("jane-doe", blockedDate);
    const schedule = [
      {
        exception_id: 1,
        stylist_slug: "jane-doe",
        day_of_week: 3,
        start_at: "08:00",
        end_at: "17:00",
      },
    ];
    const slots = availableSlots(blockedDate, demoServices[0], schedule, busy, {
      date: "2026-10-28",
      time: "08:00",
    });
    expect(slots).toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).not.toContain("11:00");
    expect(slots).not.toContain("11:30");
    expect(slots).toContain("12:00");
  });

  it("fails closed without a server key instead of treating hidden blocks as an empty schedule", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const requests = await mockReads();
    const { getBusyPeriods } = await import("@/lib/server/repository");
    await expect(getBusyPeriods("jane-doe", date)).rejects.toThrow();
    expect(requests.some((url) => url.pathname.endsWith("/ScheduleBlocks"))).toBe(false);
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
