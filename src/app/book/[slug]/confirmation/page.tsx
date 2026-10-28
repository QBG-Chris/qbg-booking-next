import { Confirmation } from "@/components/booking/confirmation";
import { notFound } from "next/navigation";
import { slugSchema } from "@/lib/models";
import { getProfile } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const profile = await getProfile(slug);
  if (!profile) notFound();
  return <Confirmation profile={profile} />;
}
