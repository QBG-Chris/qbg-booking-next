import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { ProfilePage } from "@/components/profile-page";
import { bookingUnavailableMessage } from "@/lib/booking";
import { getAvailability, getProfile, getServices, getSocialLinks } from "@/lib/server/repository";
import { slugSchema } from "@/lib/models";
import type { Metadata } from "next";
import { stylistMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) return {};
  const profile = await getProfile(slug);
  if (!profile) return {};
  return stylistMetadata(profile, {
    title: profile.is_enabled ? `Book with ${profile.display_name}` : profile.display_name,
    fallbackDescription: profile.is_enabled
      ? `Choose a service and time to book with ${profile.display_name}.`
      : bookingUnavailableMessage,
  });
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const profile = await getProfile(slug);
  if (!profile) notFound();
  const socialLinksPromise = getSocialLinks(slug);
  if (!profile.is_enabled)
    return <ProfilePage profile={profile} socialLinks={await socialLinksPromise} />;

  const [services, schedule, socialLinks] = await Promise.all([
    getServices(slug),
    getAvailability(slug),
    socialLinksPromise,
  ]);
  return (
    <BookingFlow
      key={slug}
      profile={profile}
      services={services}
      schedule={schedule}
      socialLinks={socialLinks}
    />
  );
}
