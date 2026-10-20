"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Link2, MessageCircle, Scissors, Sparkles } from "lucide-react";
import { Shell } from "./shell";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { slugSchema } from "@/lib/models";

const features = [
  {
    icon: Scissors,
    title: "Your stylist, your services",
    description: "A personalized booking page for every stylist.",
  },
  {
    icon: CalendarDays,
    title: "A time that works for you",
    description: "Explore available dates and appointment times.",
  },
  {
    icon: MessageCircle,
    title: "Stay in the loop",
    description: "Get updates as your stylist reviews your request.",
  },
];

export function Landing() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  return (
    <Shell>
      <div className="grid items-center gap-12 py-3 md:grid-cols-2 md:gap-20 md:py-9">
        <section>
          <Badge variant="secondary" className="mb-7 px-3 py-1.5">
            A little time for you
          </Badge>
          <h1 className="text-4xl leading-[1.12] font-semibold tracking-[-0.045em] sm:text-5xl lg:text-[3.5rem]">
            Good hair.
            <br />
            Great company.
            <br />
            <span className="text-primary">
              Your next
              <br className="hidden lg:block" /> appointment.
            </span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-8 text-muted-foreground">
            Find your stylist, choose your service, and make time for a fresh look. Booking is that
            simple.
          </p>
          <div className="mt-9 space-y-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <Card className="rounded-2xl border-border py-0 shadow-sm">
          <CardContent className="p-6 sm:p-9">
            <Sparkles className="mb-6 size-7 text-primary" />
            <h2 className="text-3xl leading-tight font-semibold tracking-tight">
              Meet your next
              <br />
              good hair day.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Have your stylist’s booking link? Open it to get started, or enter their booking name
              below.
            </p>
            <form
              className="mt-7 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const result = slugSchema.safeParse(slug.trim().toLowerCase());
                if (!result.success) {
                  setError(result.error.issues[0].message);
                  return;
                }
                router.push(`/${result.data}`);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="stylist-slug">Stylist booking name</Label>
                <Input
                  id="stylist-slug"
                  value={slug}
                  onChange={(event) => {
                    setSlug(event.target.value);
                    setError("");
                  }}
                  placeholder="e.g. jane-doe"
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-invalid={!!error}
                  aria-describedby={error ? "slug-error" : undefined}
                  className="h-11"
                />
                {error && (
                  <p id="slug-error" role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" className="h-11 w-full justify-between px-4">
                Find my stylist
                <ArrowRight />
              </Button>
            </form>
            <Alert className="mt-6 bg-muted/60">
              <Link2 />
              <AlertTitle>Your stylist has a personal link</AlertTitle>
              <AlertDescription>
                For example: blendiqbooking.com/jane-doe. Ask your stylist for theirs.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
      <footer className="mt-12 border-t pt-7 text-center text-xs text-muted-foreground">
        Made for stylists. Designed around you.
      </footer>
    </Shell>
  );
}
