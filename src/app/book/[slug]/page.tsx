import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
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
    title: `Book with ${profile.display_name}`,
    fallbackDescription: `Choose a service and time to book with ${profile.display_name}.`,
  });
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const [profile, services, schedule, socialLinks] = await Promise.all([
    getProfile(slug),
    getServices(slug),
    getAvailability(slug),
    getSocialLinks(slug),
  ]);
  if (!profile) notFound();
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
