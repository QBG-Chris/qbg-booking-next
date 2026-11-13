export type MapsPlatform = "ios" | "android" | "desktop";

/** iPadOS reports a desktop Safari user agent, so touch support identifies it instead. */
export function mapsPlatform(userAgent: string, maxTouchPoints = 0): MapsPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1))
    return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** Keyless Google Maps embed centered on the address. */
export function mapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`;
}

/**
 * iOS opens Apple Maps with driving directions. Android hands Google Maps links to the Maps app.
 * Desktop opens the same Google Maps directions in a new tab so the booking page stays open.
 */
export function directionsLink(
  address: string,
  platform: MapsPlatform,
): { href: string; newTab: boolean } {
  const destination = encodeURIComponent(address);
  if (platform === "ios")
    return { href: `https://maps.apple.com/?daddr=${destination}&dirflg=d`, newTab: false };
  return {
    href: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    newTab: platform === "desktop",
  };
}
