import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import type { Profile } from "@/lib/models";
import { cn } from "@/lib/utils";

export function StylistAvatar({ profile, large = false }: { profile: Profile; large?: boolean }) {
  return (
    <Avatar className={cn("size-12 ring-4 ring-secondary", large && "size-28 text-3xl")}>
      {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.display_name} />}
      <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
        {profile.display_name
          .split(/\s+/)
          .map((word) => word[0])
          .slice(0, 2)
          .join("")}
      </AvatarFallback>
    </Avatar>
  );
}
export function StylistIdentity({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-4">
      <StylistAvatar profile={profile} />
      <div className="min-w-0">
        <p className="font-semibold">{profile.display_name}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {[profile.location_city, profile.location_state].filter(Boolean).join(", ") ||
            "Your stylist"}
        </p>
      </div>
    </div>
  );
}
