import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { slugSchema } from "@/lib/models";

export default async function Home({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  const parsed = slugSchema.safeParse(slug);
  if (parsed.success) redirect(`/${parsed.data}`);
  return <Landing />;
}
