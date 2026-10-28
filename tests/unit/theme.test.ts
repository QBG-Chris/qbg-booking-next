import { afterEach, describe, expect, it, vi } from "vitest";
import { profileSchema } from "@/lib/models";
import { profileAppearance } from "@/lib/theme";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("booking profile appearance", () => {
  const profile = { id: 1, slug: "jane-doe", display_name: "Jane Doe" };

  it.each(["light", "dark"] as const)(
    "loads %s appearance from the public profile query",
    async (theme) => {
      vi.resetModules();
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anonymous-key");
      const requests: URL[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          requests.push(new URL(input instanceof Request ? input.url : String(input)));
          return Response.json({
            ...profile,
            theme,
            accent_color: "#2563eb",
            user_id: "private-id",
          });
        }),
      );
      const { getProfile } = await import("@/lib/server/repository");
      const result = await getProfile("jane-doe");
      expect(result).toMatchObject({ theme, accent_color: "#2563eb" });
      expect(result).not.toHaveProperty("user_id");
      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.get("slug")).toBe("eq.jane-doe");
      expect(requests[0].searchParams.get("select")?.split(",")).toEqual(
        expect.arrayContaining(["theme", "accent_color"]),
      );
    },
  );

  it.each([
    {},
    { theme: null, accent_color: null },
    { theme: "system", accent_color: "red" },
    { theme: "", accent_color: "#12345" },
    { theme: "unexpected", accent_color: "url(https://example.com)" },
  ])("keeps profiles bookable when appearance is missing or invalid: %j", (appearance) => {
    const parsed = profileSchema.parse({ ...profile, ...appearance });
    expect(parsed.theme).toBe("dark");
    expect(profileAppearance(parsed).style).toMatchObject({
      "--primary": "#e1bcac",
      "--primary-foreground": "#000000",
    });
  });

  it("retains dark mode and a lighter fallback when only the accent is invalid", () => {
    const parsed = profileSchema.parse({ ...profile, theme: "dark", accent_color: "invalid" });
    expect(profileAppearance(parsed)).toMatchObject({
      theme: "dark",
      style: { colorScheme: "dark", "--primary": "#e1bcac" },
    });
  });

  it.each([
    ["#2563eb", "#2563eb", "#ffffff"],
    ["#ffcc00", "#ffcc00", "#000000"],
    [" #AbC ", "#AAbbCC", "#000000"],
    ["#000", "#000000", "#ffffff"],
    ["#fff", "#ffffff", "#000000"],
  ])("uses %s for accents and a contrasting label", (accent_color, color, foreground) => {
    const parsed = profileSchema.parse({ ...profile, theme: "dark", accent_color });
    expect(profileAppearance(parsed).style).toMatchObject({
      "--primary": color,
      "--ring": color,
      "--primary-foreground": foreground,
    });
  });
});
