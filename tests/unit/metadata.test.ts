import { describe, expect, it } from "vitest";
import { demoProfile } from "@/lib/demo";
import { stylistMetadata } from "@/lib/metadata";

const options = { title: "Jane Doe", fallbackDescription: "Book with Jane Doe." };

describe("stylist link previews", () => {
  it("uses the stylist's bio and avatar", () => {
    const metadata = stylistMetadata(
      { ...demoProfile, avatar_url: "https://example.supabase.co/avatar.png" },
      options,
    );
    expect(metadata.title).toBe("Jane Doe");
    expect(metadata.description).toBe(demoProfile.bio);
    expect(metadata.openGraph?.images).toEqual([
      { url: "https://example.supabase.co/avatar.png", alt: "Jane Doe" },
    ]);
  });

  it("falls back without a bio and trims long bios to one preview line", () => {
    expect(stylistMetadata({ ...demoProfile, bio: null }, options).description).toBe(
      "Book with Jane Doe.",
    );
    const long = stylistMetadata({ ...demoProfile, bio: `Line one\n\n${"x".repeat(300)}` }, options)
      .description as string;
    expect(long).toHaveLength(160);
    expect(long.startsWith("Line one x")).toBe(true);
    expect(long.endsWith("…")).toBe(true);
  });
});
