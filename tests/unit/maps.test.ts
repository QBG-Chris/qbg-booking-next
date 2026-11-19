import { describe, expect, it } from "vitest";
import { directionsLink, mapEmbedUrl, mapsPlatform } from "@/lib/maps";

const location = "123 Main Street, Nashville, TN 37201";
const encoded = "123%20Main%20Street%2C%20Nashville%2C%20TN%2037201";

describe("stylist location maps", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", 5, "ios"],
    // iPadOS requests desktop sites by default; touch support identifies it.
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5, "ios"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0 Mobile Safari/537.36", 5, "android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36", 0, "desktop"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36", 0, "desktop"],
  ] as const)("detects %s as %s", (userAgent, touchPoints, platform) => {
    expect(mapsPlatform(userAgent, touchPoints)).toBe(platform);
  });

  it("opens Apple Maps driving directions in place on iOS", () => {
    expect(directionsLink(location, "ios")).toEqual({
      href: `https://maps.apple.com/?daddr=${encoded}&dirflg=d`,
      newTab: false,
    });
  });

  it("hands Google Maps directions to the Android Maps app in place", () => {
    expect(directionsLink(location, "android")).toEqual({
      href: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      newTab: false,
    });
  });

  it("opens Google Maps directions in a new tab on the web", () => {
    expect(directionsLink(location, "desktop")).toEqual({
      href: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      newTab: true,
    });
  });

  it("encodes addresses that contain URL syntax", () => {
    const tricky = "1 A&B St #2, Nashville, TN";
    const url = new URL(directionsLink(tricky, "desktop").href);
    expect(url.searchParams.get("destination")).toBe(tricky);
    expect(new URL(mapEmbedUrl(tricky)).searchParams.get("q")).toBe(tricky);
  });
});
