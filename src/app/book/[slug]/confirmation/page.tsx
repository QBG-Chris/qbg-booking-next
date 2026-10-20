import { Confirmation } from "@/components/booking/confirmation";

export default async function ConfirmationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Confirmation slug={slug} />;
}
