import { Confirmation } from "@/components/booking/confirmation";
import { notFound } from "next/navigation";
import { slugSchema } from "@/lib/models";
import { getProfile } from "@/lib/server/repository";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Booking requested",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const profile = await getProfile(slug);
  if (!profile) notFound();
  return <Confirmation profile={profile} />;
}
