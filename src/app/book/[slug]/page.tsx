import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getAvailability, getProfile, getServices } from "@/lib/server/repository";
import { slugSchema } from "@/lib/models";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const [profile, services, schedule] = await Promise.all([
    getProfile(slug),
    getServices(slug),
    getAvailability(slug),
  ]);
  if (!profile) notFound();
  return <BookingFlow key={slug} profile={profile} services={services} schedule={schedule} />;
}
