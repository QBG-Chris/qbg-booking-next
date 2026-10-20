import { notFound } from "next/navigation";
import { ProfilePage } from "@/components/profile-page";
import { getProfile } from "@/lib/server/repository";
import { slugSchema } from "@/lib/models";

export const dynamic = "force-dynamic";

export default async function StylistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const profile = await getProfile(slug);
  if (!profile) notFound();
  return <ProfilePage profile={profile} />;
}
