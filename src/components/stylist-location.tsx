"use client";

import { useSyncExternalStore } from "react";
import { MapPin, Navigation } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { address as formatAddress } from "@/lib/booking";
import { directionsLink, mapEmbedUrl, mapsPlatform, type MapsPlatform } from "@/lib/maps";
import type { Profile } from "@/lib/models";
import { cn } from "@/lib/utils";

const noSubscription = () => () => {};
// The server renders the desktop link; phones switch to their maps app after hydration.
const serverPlatform = (): MapsPlatform => "desktop";
const browserPlatform = (): MapsPlatform =>
  mapsPlatform(navigator.userAgent, navigator.maxTouchPoints);

export function StylistLocation({
  profile,
  className,
}: {
  profile: Pick<
    Profile,
    "display_name" | "location_address" | "location_city" | "location_state" | "location_zip"
  >;
  className?: string;
}) {
  const platform = useSyncExternalStore(noSubscription, browserPlatform, serverPlatform);
  const location = formatAddress(profile);
  if (!location) return null;
  const directions = directionsLink(location, platform);

  return (
    <section aria-label="Location" className={cn("space-y-4", className)}>
      <div className="flex gap-3">
        <MapPin className="mt-1 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">Location</p>
          <address className="text-sm leading-6 break-words not-italic">{location}</address>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-muted">
        <iframe
          title={`Map showing ${profile.display_name}’s location`}
          src={mapEmbedUrl(location)}
          className="block aspect-[4/3] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <a
        href={directions.href}
        {...(directions.newTab && { target: "_blank", rel: "noopener noreferrer" })}
        className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full gap-2")}
        data-platform={platform}
      >
        <Navigation className="size-4" />
        Get directions
        {directions.newTab && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    </section>
  );
}
