import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  availabilitySchema,
  busyPeriodSchema,
  profileSchema,
  serviceSchema,
  type BookingPayload,
} from "../models";
import { demoAvailability, demoProfile, demoServices } from "../demo";

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
      "id,slug,display_name,bio,avatar_url,phone,email,location_address,location_city,location_state,location_zip",
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
  if (isDemo) return [{ appointment_start_time: "09:00:00", appointment_end_time: "10:00:00" }];
  const { data, error } = await database()
    .from("Appointments")
    .select("appointment_start_time,appointment_end_time")
    .eq("stylist_slug", slug)
    .eq("appointment_date", date)
    .neq("status", "cancelled");
  if (error) throw new Error("We couldn’t check availability. Please try again.");
  return z.array(busyPeriodSchema).parse(data);
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
