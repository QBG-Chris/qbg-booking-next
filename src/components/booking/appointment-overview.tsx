import { CalendarDays, Clock, MapPin, Scissors } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StylistIdentity } from "@/components/stylist-identity";
import { StylistSocialLinks } from "@/components/stylist-social-links";
import { address, displayDate, displayTime, duration, money } from "@/lib/booking";
import type { Profile, Service, SocialLink } from "@/lib/models";

export function Detail({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-1 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="mb-1 text-xs text-muted-foreground">{label}</p>
        <p className="text-sm leading-6 break-words font-medium">{value}</p>
        {subtitle && (
          <p className="mt-1 text-xs leading-6 break-words text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
export function AppointmentOverview({
  profile,
  service,
  date,
  time,
  socialLinks,
}: {
  profile: Profile;
  service?: Service;
  date: string;
  time: string;
  socialLinks: SocialLink[];
}) {
  return (
    <Card className="rounded-xl py-0">
      <CardContent className="p-6">
        <p className="mb-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Your appointment
        </p>
        <StylistIdentity profile={profile} />
        <StylistSocialLinks links={socialLinks} className="mt-5" />
        <Separator className="my-6" />
        <div className="space-y-5">
          <Detail
            icon={Scissors}
            label="Service"
            value={service?.name || "Choose your service"}
            subtitle={
              service ? duration(service.duration_minutes) : "A little time for a fresh look."
            }
          />
          <Detail
            icon={CalendarDays}
            label="Date"
            value={date ? displayDate(date) : "Choose a date"}
          />
          <Detail icon={Clock} label="Time" value={time ? displayTime(time) : "Choose a time"} />
          {address(profile) && <Detail icon={MapPin} label="Location" value={address(profile)} />}
        </div>
        {service && (
          <>
            <Separator className="my-6" />
            <div className="flex justify-between gap-3 text-sm">
              <span>Service total</span>
              <span className="font-semibold">{money(service.price)}</span>
            </div>
          </>
        )}
        <p className="mt-6 text-xs leading-6 text-muted-foreground">
          Your stylist will review your request and confirm your appointment.
        </p>
      </CardContent>
    </Card>
  );
}
