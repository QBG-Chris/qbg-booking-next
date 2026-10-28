import type { CSSProperties } from "react";
import type { Profile } from "./models";

export function profileAppearance(profile?: Pick<Profile, "theme" | "accent_color">) {
  const theme = profile?.theme === "light" ? "light" : "dark";
  const value = profile?.accent_color?.trim();
  const accent =
    value && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)
      ? value
      : theme === "dark"
        ? "#e1bcac"
        : "#765447";
  const hex = accent.slice(1);
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit.repeat(2)).join("") : hex;
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  // Choose whichever label color has the higher WCAG contrast against the accent.
  const foreground = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";

  return {
    theme,
    style: {
      colorScheme: theme,
      "--primary": `#${expanded}`,
      "--primary-foreground": foreground,
      "--ring": `#${expanded}`,
    } as CSSProperties,
  };
}
