import type { Metadata } from "next";
import type { Profile } from "./models";

const DESCRIPTION_LENGTH = 160;

function summary(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= DESCRIPTION_LENGTH
    ? flat
    : `${flat.slice(0, DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

/** Shared links (Instagram bios, texts) should preview the stylist, not the generic platform. */
export function stylistMetadata(
  profile: Profile,
  { title, fallbackDescription }: { title: string; fallbackDescription: string },
): Metadata {
  const description = summary(profile.bio || fallbackDescription);
  const images = profile.avatar_url ? [{ url: profile.avatar_url, alt: profile.display_name }] : [];
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images },
    twitter: { card: "summary", title, description, images: images.map((image) => image.url) },
  };
}
