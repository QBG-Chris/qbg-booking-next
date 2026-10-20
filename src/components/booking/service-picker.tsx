"use client";

import { useState } from "react";
import { Check, Clock, Scissors } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { duration, money } from "@/lib/booking";
import type { Service } from "@/lib/models";
import { cn } from "@/lib/utils";

export function ServicePicker({
  services,
  selected,
  onSelect,
}: {
  services: Service[];
  selected?: Service;
  onSelect: (service: Service) => void;
}) {
  const [category, setCategory] = useState("All");
  const categories = ["All", ...new Set(services.map((service) => service.category || "Other"))];
  if (!services.length)
    return (
      <Card>
        <CardContent className="text-sm leading-7 text-muted-foreground">
          There are no services available for online booking yet. Please contact your stylist
          directly.
        </CardContent>
      </Card>
    );
  return (
    <div>
      {categories.length > 2 && (
        <div aria-label="Filter services by category" className="mb-5 flex flex-wrap gap-2">
          {categories.map((item) => (
            <Button
              key={item}
              variant={category === item ? "secondary" : "ghost"}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className="h-9 rounded-full px-4"
            >
              {item}
            </Button>
          ))}
        </div>
      )}
      <fieldset className="space-y-3">
        <legend className="sr-only">Choose a service</legend>
        {services
          .filter((service) => category === "All" || (service.category || "Other") === category)
          .map((service) => (
            <label key={service.id} className="relative block cursor-pointer">
              <input
                type="radio"
                name="service"
                value={service.id}
                checked={selected?.id === service.id}
                onChange={() => onSelect(service)}
                className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                aria-label={service.name}
              />
              <Card
                className={cn(
                  "rounded-xl py-0 shadow-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:border-primary/50",
                  selected?.id === service.id &&
                    "border-primary bg-secondary/30 ring-1 ring-primary",
                )}
              >
                <CardContent className="flex items-start gap-4 p-5">
                  {service.image_url && (
                    <Avatar className="size-14 rounded-lg">
                      <AvatarImage src={service.image_url} alt="" className="rounded-lg" />
                      <AvatarFallback className="rounded-lg">
                        <Scissors className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-sm leading-6 font-semibold">{service.name}</h2>
                      <span
                        className={cn(
                          "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border",
                          selected?.id === service.id &&
                            "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {selected?.id === service.id && <Check className="size-3" />}
                      </span>
                    </div>
                    {service.description && (
                      <p className="mt-2 text-xs leading-6 text-muted-foreground">
                        {service.description}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {duration(service.duration_minutes)}
                      </span>
                      <span className="text-sm font-semibold">{money(service.price)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </label>
          ))}
      </fieldset>
    </div>
  );
}
