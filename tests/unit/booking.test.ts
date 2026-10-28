import { describe, expect, it } from "vitest";
import {
  availableSlots,
  bookingPayload,
  bookingRequestSchema,
  detailsSchema,
  isCalendarDate,
  localDate,
  normalizePhone,
  parseLocalDate,
  scheduleBlockPeriods,
  wallClock,
} from "@/lib/booking";
import { demoAvailability, demoServices } from "@/lib/demo";
import { serviceSchema, type ScheduleBlock } from "@/lib/models";

const now = { date: "2026-10-19", time: "08:00" };
const input = {
  slug: "jane-doe",
  serviceId: "cut",
  date: "2026-10-20",
  time: "10:30",
  firstName: " Alex ",
  lastName: " Smith ",
  email: "alex@example.com",
  phone: "+1 (555) 123-4567",
  notes: " A little shorter. ",
  smsConsent: true,
  timeZone: "America/Chicago",
};
const block: ScheduleBlock = {
  date: null,
  start_time: "12:00:00",
  end_time: "13:00:00",
  is_daily: false,
  is_weekly: false,
  days_of_week: null,
};

describe("schedule blocks", () => {
  it.each([19, 20, 21, 22, 23, 24, 25])("applies daily blocks on October %i", (day) => {
    expect(scheduleBlockPeriods(`2026-10-${day}`, [{ ...block, is_daily: true }])).toEqual([
      { appointment_start_time: "12:00:00", appointment_end_time: "13:00:00" },
    ]);
  });
  it("uses Monday=0 and Sunday=6, trims weekly day values, and skips unselected days", () => {
    const weekly = [{ ...block, is_weekly: true, days_of_week: "0, 2,6" }];
    for (const day of [19, 21, 25]) {
      expect(scheduleBlockPeriods(`2026-10-${day}`, weekly)).toHaveLength(1);
    }
    for (const day of [20, 22, 23, 24]) {
      expect(scheduleBlockPeriods(`2026-10-${day}`, weekly)).toEqual([]);
    }
    expect(scheduleBlockPeriods("2026-10-26", weekly)).toHaveLength(1);
  });
  it.each([
    { is_daily: false, is_weekly: false },
    { is_daily: true, is_weekly: true },
  ])("limits dated blocks to their date even with recurrence flags: %j", (flags) => {
    const dated = [{ ...block, ...flags, date: input.date, days_of_week: "0,1,2,3,4,5,6" }];
    expect(scheduleBlockPeriods(input.date, dated)).toHaveLength(1);
    expect(scheduleBlockPeriods("2026-10-19", dated)).toEqual([]);
    expect(scheduleBlockPeriods("2026-10-27", dated)).toEqual([]);
  });
  it("ignores undated blocks without recurrence and weekly blocks without selected days", () => {
    expect(
      scheduleBlockPeriods("2026-10-19", [
        block,
        { ...block, is_daily: null, is_weekly: null },
        { ...block, is_weekly: true },
        { ...block, is_weekly: true, days_of_week: " , , " },
      ]),
    ).toEqual([]);
  });
  it("removes every service overlapping a block while allowing exact boundaries", () => {
    const busy = scheduleBlockPeriods(input.date, [{ ...block, date: input.date }]);
    const slots = availableSlots(input.date, demoServices[0], demoAvailability, busy, now);
    expect(slots).toContain("11:00");
    expect(slots).not.toContain("11:30");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("12:30");
    expect(slots).toContain("13:00");
    const longer = availableSlots(input.date, demoServices[1], demoAvailability, busy, now);
    expect(longer).toContain("10:00");
    expect(longer).not.toContain("10:30");
    expect(longer).not.toContain("11:00");
    expect(longer).toContain("13:00");
  });
});

describe("availability", () => {
  it("blocks overlapping appointments, including HH:mm:ss database values", () => {
    const slots = availableSlots(
      input.date,
      demoServices[0],
      demoAvailability,
      [{ appointment_start_time: "09:00:00", appointment_end_time: "10:00:00" }],
      now,
    );
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00");
    const crossing = availableSlots(
      input.date,
      demoServices[1],
      demoAvailability,
      [{ appointment_start_time: "10:00:00", appointment_end_time: "11:00:00" }],
      now,
    );
    expect(crossing).not.toContain("09:00");
    expect(crossing).toContain("11:00");
  });
  it("requires the full service to fit before closing", () => {
    const slots = availableSlots(input.date, demoServices[1], demoAvailability, [], now);
    expect(slots.at(-1)).toBe("15:00");
    expect(slots).not.toContain("15:30");
  });
  it("uses Monday-based schedules and handles closed days", () => {
    const monday = demoAvailability.filter((item) => item.day_of_week === 0);
    expect(availableSlots("2026-10-19", demoServices[0], monday, [], now)).toContain("09:00");
    expect(availableSlots("2026-10-20", demoServices[0], monday, [], now)).toEqual([]);
  });
  it("removes past dates and past or current times", () => {
    expect(availableSlots("2026-10-18", demoServices[0], demoAvailability, [], now)).toEqual([]);
    const slots = availableSlots("2026-10-19", demoServices[0], demoAvailability, [], {
      date: now.date,
      time: "10:00",
    });
    expect(slots[0]).toBe("10:30");
  });
  it("combines multiple working windows without duplicate slots", () => {
    const windows = [
      demoAvailability[1],
      { ...demoAvailability[1], start_at: "13:00", end_at: "15:00" },
    ];
    const slots = availableSlots(input.date, demoServices[0], windows, [], now);
    expect(slots.length).toBe(new Set(slots).size);
  });
});

describe("booking validation and payload", () => {
  it("accepts legacy service rows with numeric IDs and no optional image column", () => {
    const service = serviceSchema.parse({
      id: 42,
      slug: "jane-doe",
      name: "Haircut",
      duration_minutes: 60,
      price: 85,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(service.id).toBe("42");
    expect(service.image_url).toBeUndefined();
    expect(service).not.toHaveProperty("created_at");
  });
  it("keeps local calendar dates and rejects impossible dates", () => {
    expect(localDate(parseLocalDate("2026-10-20"))).toBe("2026-10-20");
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(wallClock("America/Chicago", new Date("2026-10-20T02:30:00Z"))).toEqual({
      date: "2026-10-19",
      time: "21:30",
    });
  });
  it("requires contact fields, a valid US phone, and explicit consent", () => {
    expect(detailsSchema.safeParse({ ...input, firstName: "", phone: "555" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...input, smsConsent: false }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...input, slug: "../other" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...input, timeZone: "made-up" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse(input).success).toBe(true);
    expect(detailsSchema.parse({ ...input, email: " alex@example.com " }).email).toBe(
      "alex@example.com",
    );
  });
  it("normalizes a US country code without dropping national digits", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("1551234567")).toBe("1551234567");
  });
  it("preserves the existing Appointments insert contract and computes the end time", () => {
    expect(bookingPayload(input, demoServices[0])).toEqual({
      stylist_slug: "jane-doe",
      services: "Signature haircut",
      client_name: "Alex Smith",
      client_email: "alex@example.com",
      client_phone: "5551234567",
      appointment_date: "2026-10-20",
      appointment_start_time: "10:30",
      appointment_end_time: "11:30",
      notes: "A little shorter.",
      status: "requested",
      price: 85,
      is_online_booking: true,
    });
    expect(bookingPayload({ ...input, notes: " " }, demoServices[0]).notes).toBeNull();
  });
});
