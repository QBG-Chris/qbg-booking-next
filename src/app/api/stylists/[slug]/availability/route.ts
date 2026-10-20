import { NextRequest, NextResponse } from "next/server";
import { dateSchema } from "@/lib/booking";
import { slugSchema } from "@/lib/models";
import { getBusyPeriods } from "@/lib/server/repository";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const date = dateSchema.safeParse(request.nextUrl.searchParams.get("date"));
  if (!slugSchema.safeParse(slug).success || !date.success)
    return NextResponse.json({ error: "Choose a valid stylist and date." }, { status: 400 });
  try {
    return NextResponse.json(
      { busy: await getBusyPeriods(slug, date.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "We couldn’t check availability. Please try again." },
      { status: 503 },
    );
  }
}
