import Image from "next/image";
import type { SocialLink } from "@/lib/models";
import { cn } from "@/lib/utils";

const platformNames: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  twitter: "Twitter",
  x: "X",
  threads: "Threads",
  snapchat: "Snapchat",
};

const platformLogos = new Map([
  ["instagram", "/images/instagram_icon.png"],
  ["facebook", "/images/facebook_icon.png"],
  ["youtube", "/images/youtube_logo.png"],
  ["tiktok", "/images/tiktok_icon.png"],
]);

export function StylistSocialLinks({
  links,
  className,
}: {
  links: SocialLink[];
  className?: string;
}) {
  if (!links.length) return null;

  return (
    <nav aria-label="Stylist social profiles" className={cn("space-y-3", className)}>
      <p className="text-xs font-medium text-muted-foreground">Connect with your stylist</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => {
          const platform = link.platform.toLowerCase();
          const name = Object.hasOwn(platformNames, platform)
            ? platformNames[platform]
            : link.platform;
          const logo = platformLogos.get(platform);
          return (
            <li key={link.id} className="min-w-0 max-w-full">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="break-words [overflow-wrap:anywhere]">{name}</span>
                {logo && (
                  <Image
                    src={logo}
                    alt=""
                    width={20}
                    height={20}
                    className={cn(
                      "size-5 shrink-0 object-contain",
                      platform === "tiktok" && "rounded-sm bg-white p-0.5",
                    )}
                  />
                )}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
