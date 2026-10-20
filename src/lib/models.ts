import { z } from "zod";
import type { RequestImageRecord } from "./request-images";

export const slugSchema = z
  .string()
  .min(2, "Enter a booking name such as jane-doe.")
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Enter a booking name such as jane-doe.");

export const profileSchema = z.object({
  id: z.coerce.string(),
  slug: slugSchema,
  display_name: z.string(),
  bio: z.string().nullish(),
  avatar_url: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  location_address: z.string().nullish(),
  location_city: z.string().nullish(),
  location_state: z.string().nullish(),
  location_zip: z.string().nullish(),
});
export const serviceSchema = z.object({
  id: z.coerce.string(),
  slug: z.coerce.string(),
  name: z.string(),
  category: z.string().nullish(),
  description: z.string().nullish(),
  duration_minutes: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
  image_url: z.string().nullish(),
  is_active: z.boolean().default(true),
});
export const availabilitySchema = z.object({
  exception_id: z.coerce.number(),
  stylist_slug: z.string(),
  day_of_week: z.number().int().min(0).max(6),
  start_at: z.string(),
  end_at: z.string(),
});
export const busyPeriodSchema = z.object({
  appointment_start_time: z.string(),
  appointment_end_time: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type BusyPeriod = z.infer<typeof busyPeriodSchema>;
export type ClientDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
};
export type BookingPayload = {
  stylist_slug: string;
  services: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  appointment_date: string;
  appointment_start_time: string;
  appointment_end_time: string;
  notes: string | null;
  status: "requested";
  price: number;
  is_online_booking: true;
};
export type Receipt = {
  id: string;
  booking: BookingPayload;
  stylist: Profile;
  service: Service;
  images?: RequestImageRecord[];
};
