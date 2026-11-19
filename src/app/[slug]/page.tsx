import { notFound } from "next/navigation";
import { ProfilePage } from "@/components/profile-page";
import { getProfile, getSocialLinks } from "@/lib/server/repository";
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
    title: profile.display_name,
    fallbackDescription: `Book an appointment with ${profile.display_name}.`,
  });
}

export default async function StylistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const [profile, socialLinks] = await Promise.all([getProfile(slug), getSocialLinks(slug)]);
  if (!profile) notFound();
  return <ProfilePage profile={profile} socialLinks={socialLinks} />;
}
