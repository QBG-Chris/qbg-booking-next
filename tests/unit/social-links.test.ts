import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anonymous-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stylist social profiles", () => {
  const instagram = {
    social_id: 12,
    link: " https://www.instagram.com/stylist/ ",
    platform: { name: " instagram " },
  };

  it("joins the platform name and scopes public links to the requested stylist", async () => {
    const requests: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(new URL(input instanceof Request ? input.url : String(input)));
        return Response.json([{ ...instagram, user_id: "private-user-id" }]);
      }),
    );
    const { getSocialLinks } = await import("@/lib/server/repository");
    expect(await getSocialLinks("jane-doe")).toEqual([
      { id: "12", platform: "instagram", url: "https://www.instagram.com/stylist/" },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe("/rest/v1/SocialLinks");
    expect(requests[0].searchParams.get("stylist_slug")).toBe("eq.jane-doe");
    expect(requests[0].searchParams.get("select")).toBe(
      "social_id,link,platform:SocialPlatforms!platform_id(name)",
    );
  });

  it("omits incomplete or unsafe entries while preserving valid profiles and unfamiliar platforms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          instagram,
          { ...instagram, social_id: 13, platform: { name: "New social platform" } },
          { ...instagram, platform: null },
          { ...instagram, platform: { name: "  " } },
          { ...instagram, link: null },
          { ...instagram, link: "" },
          { ...instagram, link: "/relative-path" },
          { ...instagram, link: "javascript:alert(document.cookie)" },
          { ...instagram, link: "data:text/html,hello" },
          { ...instagram, link: "ftp://example.com/profile" },
        ]),
      ),
    );
    const { getSocialLinks } = await import("@/lib/server/repository");
    expect(await getSocialLinks("jane-doe")).toEqual([
      { id: "12", platform: "instagram", url: "https://www.instagram.com/stylist/" },
      { id: "13", platform: "New social platform", url: "https://www.instagram.com/stylist/" },
    ]);
  });

  it("keeps booking available when social links cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ code: "42501", message: "private database details" }, { status: 403 }),
      ),
    );
    const { getSocialLinks } = await import("@/lib/server/repository");
    await expect(getSocialLinks("jane-doe")).resolves.toEqual([]);
    expect(log).toHaveBeenCalledExactlyOnceWith("[booking] Social links lookup failed.", {
      code: "42501",
      status: 403,
    });
  });

  it("returns no links for an unconfigured stylist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );
    const { getSocialLinks } = await import("@/lib/server/repository");
    await expect(getSocialLinks("jane-doe")).resolves.toEqual([]);
  });
});
