import { z } from "zod";
import { requestImageUploadsSchema } from "./request-images";
import {
  slugSchema,
  type Availability,
  type BookingPayload,
  type BusyPeriod,
  type ClientDetails,
  type ScheduleBlock,
  type Service,
} from "./models";

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(parseLocalDate(value)) === value;
}
export const dateSchema = z.string().refine(isCalendarDate, "Choose a valid date.");
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trimStart().startsWith("+") ? "+" : "";
  const hasCountryCode =
    value.trimStart().startsWith("+1") || (digits.length > 10 && digits.startsWith("1"));
  const national = hasCountryCode ? digits.slice(1) : digits;
  const prefix = hasCountryCode ? "+1" : "";
  if (!national) return prefix;
  const formatted =
    national.length <= 3
      ? `(${national}`
      : national.length <= 6
        ? `(${national.slice(0, 3)}) ${national.slice(3)}`
        : `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  return prefix ? `${prefix} ${formatted}` : formatted;
}
export const detailsSchema = z.object({
  firstName: z.string().trim().min(2, "First name must be at least 2 characters.").max(100),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters.").max(100),
  email: z.string().trim().max(254).pipe(z.email("Please enter a valid email address.")),
  phone: z
    .string()
    .refine(
      (value) => /^\d{10}$/.test(normalizePhone(value)),
      "Please enter a valid 10-digit US phone number.",
    ),
  notes: z.string().trim().max(2000, "Please keep notes under 2,000 characters."),
});
export const bookingRequestSchema = detailsSchema.extend({
  slug: slugSchema,
  serviceId: z.string().min(1).max(100),
  date: dateSchema,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  smsConsent: z.literal(true, { error: "SMS consent is required." }),
  imageUploads: requestImageUploadsSchema.optional().default([]),
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone."),
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export function minutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
export function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function displayTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
export function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseLocalDate(value));
}
export function money(price: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
}
export function duration(value: number): string {
  return [
    value >= 60 ? `${Math.floor(value / 60)} hr${value >= 120 ? "s" : ""}` : "",
    value % 60 ? `${value % 60} min` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
export function address(profile: {
  location_address?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_zip?: string | null;
}): string {
  return [
    profile.location_address,
    [
      profile.location_city,
      [profile.location_state, profile.location_zip].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}
export function wallClock(timeZone: string, now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Dated blocks are one-time; undated recurrence uses Monday=0 through Sunday=6. */
export function scheduleBlockPeriods(date: string, blocks: ScheduleBlock[]): BusyPeriod[] {
  if (!isCalendarDate(date)) return [];
  const weekday = String((parseLocalDate(date).getDay() + 6) % 7);
  return blocks
    .filter((block) => {
      if (block.date !== null) return block.date === date;
      if (block.is_daily) return true;
      return (
        block.is_weekly && block.days_of_week?.split(",").some((day) => day.trim() === weekday)
      );
    })
    .map((block) => ({
      appointment_start_time: block.start_time,
      appointment_end_time: block.end_time,
    }));
}

/** Calendar dates stay local; appointments and schedule blocks reserve their entire duration. */
export function availableSlots(
  date: string,
  service: Service,
  schedule: Availability[],
  busy: BusyPeriod[],
  now = {
    date: localDate(new Date()),
    time: timeFromMinutes(new Date().getHours() * 60 + new Date().getMinutes()),
  },
): string[] {
  if (!isCalendarDate(date) || date < now.date) return [];
  const weekday = (parseLocalDate(date).getDay() + 6) % 7;
  const slots = new Set<string>();
  for (const window of schedule.filter((item) => item.day_of_week === weekday)) {
    const close = minutes(window.end_at);
    for (
      let start = minutes(window.start_at);
      start + service.duration_minutes <= close;
      start += 30
    ) {
      if (date === now.date && start <= minutes(now.time)) continue;
      if (
        busy.some(
          (item) =>
            start < minutes(item.appointment_end_time) &&
            start + service.duration_minutes > minutes(item.appointment_start_time),
        )
      )
        continue;
      slots.add(timeFromMinutes(start));
    }
  }
  return [...slots].sort();
}

export function bookingPayload(
  request: Pick<BookingRequest, "slug" | "date" | "time"> & ClientDetails,
  service: Service,
): BookingPayload {
  return {
    stylist_slug: request.slug,
    services: service.name,
    client_name: `${request.firstName.trim()} ${request.lastName.trim()}`,
    client_email: request.email.trim(),
    client_phone: normalizePhone(request.phone),
    appointment_date: request.date,
    appointment_start_time: request.time,
    appointment_end_time: timeFromMinutes(minutes(request.time) + service.duration_minutes),
    notes: request.notes.trim() || null,
    status: "requested",
    price: service.price,
    is_online_booking: true,
  };
}
