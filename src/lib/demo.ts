import type { Availability, Profile, ScheduleBlock, Service, SocialLink } from "./models";

export const demoProfile: Profile = {
  id: "stylist-1",
  slug: "jane-doe",
  display_name: "Jane Doe",
  theme: "light",
  accent_color: "#765447",
  bio: "Thoughtful cuts, lived-in color, and a little time just for you. I love helping you find a look that feels like yourself.",
  phone: "+1 (555) 123-4567",
  email: "jane@example.com",
  location_address: "123 Main Street",
  location_city: "Nashville",
  location_state: "TN",
  location_zip: "37201",
};
export const demoSocialLinks: SocialLink[] = [
  { id: "instagram", platform: "instagram", url: "https://www.instagram.com/example/" },
  { id: "facebook", platform: "facebook", url: "https://www.facebook.com/example/" },
];
export const demoServices: Service[] = [
  {
    id: "cut",
    slug: "jane-doe",
    name: "Signature haircut",
    category: "Cuts & styling",
    description: "A tailored cut, wash, and finish for your everyday style.",
    duration_minutes: 60,
    price: 85,
    is_active: true,
  },
  {
    id: "color",
    slug: "jane-doe",
    name: "Lived-in color",
    category: "Color",
    description: "Soft dimension and effortless color, made just for you.",
    duration_minutes: 120,
    price: 180,
    is_active: true,
  },
  {
    id: "blowout",
    slug: "jane-doe",
    name: "Wash & blowout",
    category: "Cuts & styling",
    description: "A wash, a beautiful finish, and a little extra confidence.",
    duration_minutes: 30,
    price: 45,
    is_active: true,
  },
];
export const demoAvailability: Availability[] = Array.from({ length: 7 }, (_, day) => ({
  exception_id: day + 1,
  stylist_slug: "jane-doe",
  day_of_week: day,
  start_at: "09:00",
  end_at: "17:00",
}));
export const demoScheduleBlocks: ScheduleBlock[] = [
  {
    date: null,
    start_time: "12:00:00",
    end_time: "13:00:00",
    is_daily: true,
    is_weekly: false,
    days_of_week: null,
  },
];
