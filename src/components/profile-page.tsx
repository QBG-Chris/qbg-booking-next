import Link from "next/link";
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import { Shell } from "./shell";
import { StylistAvatar } from "./stylist-identity";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Separator } from "./ui/separator";
import { address } from "@/lib/booking";
import type { Profile } from "@/lib/models";

export function ProfilePage({ profile }: { profile: Profile }) {
  return (
    <Shell title={profile.display_name} backHref="/">
      <div className="grid gap-12 py-3 md:grid-cols-[1fr_380px] md:gap-20">
        <section>
          <Badge variant="secondary" className="mb-9">
            Welcome to your stylist’s space
          </Badge>
          <StylistAvatar profile={profile} large />
          <h1 className="mt-7 text-4xl font-semibold tracking-tight sm:text-5xl">
            {profile.display_name}
          </h1>
          <p className="mt-3 text-muted-foreground">A fresh look starts here.</p>
          {profile.bio && (
            <div className="mt-9 border-t pt-7">
              <h2 className="font-semibold">About your stylist</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-8 text-muted-foreground">
                {profile.bio}
              </p>
            </div>
          )}
        </section>
        <Card className="h-fit rounded-2xl py-0">
          <CardContent className="p-6 sm:p-7">
            <h2 className="text-xl font-semibold tracking-tight">Let’s make it a good hair day.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Choose a service and find a time that fits your schedule.
            </p>
            <Link
              href={`/book/${profile.slug}`}
              className={`${buttonVariants()} mt-6 h-11 w-full justify-between px-4`}
            >
              Book an appointment
              <ArrowRight className="size-4" />
            </Link>
            <Separator className="my-7" />
            <h3 className="mb-6 text-sm font-semibold">Contact & location</h3>
            <div className="space-y-6 text-sm">
              {profile.phone && (
                <div className="flex gap-3">
                  <Phone className="mt-1 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Phone</p>
                    <a
                      className="break-all hover:underline"
                      href={`tel:${profile.phone.replace(/[^+\d]/g, "")}`}
                    >
                      {profile.phone}
                    </a>
                  </div>
                </div>
              )}
              {profile.email && (
                <div className="flex gap-3">
                  <Mail className="mt-1 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="mb-1 text-xs text-muted-foreground">Email</p>
                    <a className="break-all hover:underline" href={`mailto:${profile.email}`}>
                      {profile.email}
                    </a>
                  </div>
                </div>
              )}
              {address(profile) && (
                <div className="flex gap-3">
                  <MapPin className="mt-1 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Location</p>
                    <p className="leading-6">{address(profile)}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
