"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ImagePlus, Mail, Scissors } from "lucide-react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StylistIdentity } from "@/components/stylist-identity";
import { Detail } from "./appointment-overview";
import { displayDate, displayTime, duration, money } from "@/lib/booking";
import { loadReceipt } from "@/lib/receipt";
import type { Profile, Receipt } from "@/lib/models";
import { requestImageLabels } from "@/lib/request-images";

export function Confirmation({ profile }: { profile: Profile }) {
  const { slug } = profile;
  const [receipt, setReceipt] = useState<Receipt | null | undefined>(undefined);
  useEffect(() => {
    startTransition(() => setReceipt(loadReceipt(slug)));
  }, [slug]);
  if (receipt === undefined)
    return (
      <Shell profile={profile}>
        <Skeleton className="mx-auto h-96 max-w-xl" />
      </Shell>
    );
  if (!receipt)
    return (
      <Shell profile={profile} className="max-w-2xl text-center">
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">No booking request to show</h1>
        <p className="my-6 text-sm leading-7 text-muted-foreground">
          Your request details are available in the browser tab where you made your booking. Start a
          new request to book with your stylist.
        </p>
        <Link href={`/book/${slug}`} className={`${buttonVariants()} h-11 px-5`}>
          Book an appointment
        </Link>
      </Shell>
    );
  const { stylist, service, booking, id } = receipt;
  return (
    <Shell profile={profile} title={stylist.display_name} className="max-w-2xl">
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-secondary text-primary">
        <Check className="size-9" />
      </div>
      <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        You’re one step closer.
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-center text-sm leading-7 text-muted-foreground">
        Your booking request has been sent to {stylist.display_name}. Your stylist will review it
        and confirm your appointment.
      </p>
      <div className="my-6 text-center">
        <Badge variant="secondary">Booking requested</Badge>
      </div>
      <Card className="rounded-xl py-0">
        <CardContent className="p-6">
          <StylistIdentity profile={stylist} />
          <Separator className="my-6" />
          <div className="space-y-5">
            <Detail
              icon={Scissors}
              label="Service"
              value={service.name}
              subtitle={`${duration(service.duration_minutes)} · ${money(service.price)}`}
            />
            <Detail
              icon={CalendarDays}
              label="Date & time"
              value={displayDate(booking.appointment_date)}
              subtitle={displayTime(booking.appointment_start_time)}
            />
            <Detail icon={Mail} label="Updates sent to" value={booking.client_email} />
            {!!receipt.images?.length && (
              <Detail
                icon={ImagePlus}
                label="Photos attached"
                value={receipt.images.map((image) => requestImageLabels[image.kind]).join(" · ")}
              />
            )}
          </div>
          <Separator className="my-6" />
          <div className="flex flex-wrap justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Booking reference</span>
            <span className="font-mono font-semibold">{id.slice(0, 8).toUpperCase()}</span>
          </div>
        </CardContent>
      </Card>
      <Link
        href={`/${slug}`}
        className={`${buttonVariants({ variant: "outline" })} mt-6 h-11 w-full`}
      >
        Back to stylist
      </Link>
    </Shell>
  );
}
