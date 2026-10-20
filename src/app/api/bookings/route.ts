import { NextRequest, NextResponse } from "next/server";
import { availableSlots, bookingPayload, bookingRequestSchema, wallClock } from "@/lib/booking";
import { checkRequestImageStorage, createImageUploadToken } from "@/lib/server/request-images";
import {
  createBooking,
  getAvailability,
  getBusyPeriods,
  getProfile,
  getServices,
} from "@/lib/server/repository";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid booking request." }, { status: 400 });
  }
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  try {
    const [profile, services, schedule, busy] = await Promise.all([
      getProfile(input.slug),
      getServices(input.slug),
      getAvailability(input.slug),
      getBusyPeriods(input.slug, input.date),
    ]);
    const service = services.find((item) => item.id === input.serviceId);
    if (!profile || !service)
      return NextResponse.json(
        { error: "This service is no longer available. Please choose another." },
        { status: 404 },
      );
    if (
      !availableSlots(input.date, service, schedule, busy, wallClock(input.timeZone)).includes(
        input.time,
      )
    ) {
      return NextResponse.json(
        { error: "That time is no longer available. Please choose another time." },
        { status: 409 },
      );
    }
    if (input.imageUploads.length) {
      try {
        await checkRequestImageStorage();
      } catch {
        return NextResponse.json(
          {
            error:
              "Photo uploads are unavailable right now. Please try again, or remove the photos to send your booking.",
          },
          { status: 503 },
        );
      }
    }
    const booking = bookingPayload(input, service);
    const id = await createBooking(booking);
    return NextResponse.json(
      {
        id,
        booking,
        stylist: profile,
        service,
        ...(input.imageUploads.length && {
          imageUploadToken: createImageUploadToken(id, input.imageUploads),
        }),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Your request couldn’t be sent. Please try again." },
      { status: 503 },
    );
  }
}
