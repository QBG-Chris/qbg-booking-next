import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  availabilitySchema,
  busyPeriodSchema,
  profileSchema,
  scheduleBlockSchema,
  serviceSchema,
  type BookingPayload,
  type SocialLink,
} from "../models";
import { scheduleBlockPeriods } from "../booking";
import {
  demoAvailability,
  demoProfile,
  demoScheduleBlocks,
  demoServices,
  demoSocialLinks,
} from "../demo";

export const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error(
      "Add your Supabase settings to .env.local, or run npm run dev:demo to preview with sample data.",
    );
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getProfile(slug: string) {
  if (isDemo) return slug === demoProfile.slug ? demoProfile : null;
  const client = database();
  const { data, error } = await client
    .from("BookingProfiles")
    .select(
      "id,slug,display_name,bio,avatar_url,phone,email,location_address,location_city,location_state,location_zip,theme,accent_color",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("We couldn’t load this stylist. Please try again.");
  if (!data) return null;
  const profile = profileSchema.parse(data);
  // Existing profiles store a path in the BookingProfiles storage bucket.
  if (profile.avatar_url && !/^https?:\/\//i.test(profile.avatar_url)) {
    profile.avatar_url = client.storage
      .from("BookingProfiles")
      .getPublicUrl(profile.avatar_url).data.publicUrl;
  }
  return profile;
}
export async function getServices(slug: string) {
  if (isDemo) return slug === demoProfile.slug ? demoServices : [];
  const { data, error } = await database()
    .from("BookingServices")
    // Some existing installations omit optional fields such as image_url.
    // Parse and strip the returned row instead of selecting absent columns.
    .select()
    .eq("slug", slug)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error("We couldn’t load the services. Please try again.");
  return z.array(serviceSchema).parse(data);
}

const socialLinkRowSchema = z.object({
  social_id: z.union([z.string().min(1), z.number()]).transform(String),
  link: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ })),
  platform: z.object({ name: z.string().trim().min(1) }),
});

export async function getSocialLinks(slug: string): Promise<SocialLink[]> {
  if (isDemo) return slug === demoProfile.slug ? demoSocialLinks : [];
  const { data, error, status } = await database()
    .from("SocialLinks")
    .select("social_id,link,platform:SocialPlatforms!platform_id(name)")
    .eq("stylist_slug", slug)
    .order("social_id");
  if (error) {
    console.error("[booking] Social links lookup failed.", { code: error.code, status });
    return [];
  }
  // Incomplete profiles or unsafe URLs should not prevent clients from booking.
  return (data ?? []).flatMap((row) => {
    const parsed = socialLinkRowSchema.safeParse(row);
    return parsed.success
      ? [{ id: parsed.data.social_id, platform: parsed.data.platform.name, url: parsed.data.link }]
      : [];
  });
}

export async function getAvailability(slug: string) {
  if (isDemo) return slug === demoProfile.slug ? demoAvailability : [];
  const { data, error } = await database()
    .from("Availability")
    .select("exception_id,stylist_slug,day_of_week,start_at,end_at")
    .eq("stylist_slug", slug)
    .order("day_of_week");
  if (error) throw new Error("We couldn’t load the schedule. Please try again.");
  return z.array(availabilitySchema).parse(data);
}
export async function getBusyPeriods(slug: string, date: string) {
  if (isDemo)
    return [
      { appointment_start_time: "09:00:00", appointment_end_time: "10:00:00" },
      ...scheduleBlockPeriods(date, demoScheduleBlocks),
    ];
  const client = database();
  const [appointments, owner] = await Promise.all([
    client
      .from("Appointments")
      .select("appointment_start_time,appointment_end_time")
      .eq("stylist_slug", slug)
      .eq("appointment_date", date)
      .neq("status", "cancelled"),
    // ScheduleBlocks belongs to the stylist's user, not the booking profile's id.
    client.from("BookingProfiles").select("user_id").eq("slug", slug).single(),
  ]);
  if (appointments.error || owner.error)
    throw new Error("We couldn’t check availability. Please try again.");
  const { user_id } = z.object({ user_id: z.string().min(1) }).parse(owner.data);
  const { data, error } = await client
    .from("ScheduleBlocks")
    .select("date,start_time,end_time,is_daily,is_weekly,days_of_week")
    .eq("user_id", user_id)
    .or(`date.eq.${date},and(date.is.null,or(is_daily.eq.true,is_weekly.eq.true))`);
  if (error) throw new Error("We couldn’t check availability. Please try again.");
  return [
    ...z.array(busyPeriodSchema).parse(appointments.data),
    ...scheduleBlockPeriods(date, z.array(scheduleBlockSchema).parse(data)),
  ];
}
export async function createBooking(payload: BookingPayload): Promise<string> {
  if (isDemo) return `demo-${crypto.randomUUID()}`;
  const { data, error, status } = await database()
    .from("Appointments")
    .insert(payload)
    // The existing database uses appointment_id; receipts expose it as id.
    .select("id:appointment_id")
    .single();
  if (error) {
    // Database details can contain client data, so log only the failure code and status.
    console.error("[booking] Appointment insert failed.", { code: error.code, status });
    throw new Error("Your request couldn’t be sent. Please try again.");
  }
  return z.coerce.string().parse(data.id);
}
