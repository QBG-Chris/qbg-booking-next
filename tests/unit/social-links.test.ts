import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anonymous-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
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

  function mockReads(rows: unknown[], { publicProfile = true, error = false } = {}) {
    const requests: { url: URL; key: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const key = new Headers(init?.headers).get("apikey");
        requests.push({ url, key });
        if (url.pathname.endsWith("/BookingProfiles"))
          return Response.json(publicProfile ? { user_id: "stylist-user" } : null);
        // Reproduce the live permissions: anon sees [], server sees the saved profile.
        if (key !== "test-server-secret") return Response.json([]);
        if (error)
          return Response.json(
            { code: "42501", message: "private database details" },
            { status: 403 },
          );
        return Response.json(rows);
      }),
    );
    return requests;
  }

  it("reads private links on the server and scopes them to the public stylist and owner", async () => {
    const requests = mockReads([{ ...instagram, user_id: "stylist-user" }]);
    const { getSocialLinks } = await import("@/lib/server/repository");
    expect(await getSocialLinks("jane-doe")).toEqual([
      { id: "12", platform: "instagram", url: "https://www.instagram.com/stylist/" },
    ]);
    expect(requests).toHaveLength(2);
    const [profile, social] = requests;
    expect(profile.url.pathname).toBe("/rest/v1/BookingProfiles");
    expect(profile.url.searchParams.get("slug")).toBe("eq.jane-doe");
    expect(profile.key).toBe("test-anonymous-key");
    expect(social.url.pathname).toBe("/rest/v1/SocialLinks");
    expect(social.key).toBe("test-server-secret");
    expect(social.url.searchParams.get("stylist_slug")).toBe("eq.jane-doe");
    expect(social.url.searchParams.get("user_id")).toBe("eq.stylist-user");
    expect(social.url.searchParams.get("select")).toBe(
      "social_id,link,platform:SocialPlatforms!platform_id(name)",
    );
  });

  it("omits incomplete or unsafe entries while preserving valid profiles and unfamiliar platforms", async () => {
    mockReads([
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
    ]);
    const { getSocialLinks } = await import("@/lib/server/repository");
    expect(await getSocialLinks("jane-doe")).toEqual([
      { id: "12", platform: "instagram", url: "https://www.instagram.com/stylist/" },
      { id: "13", platform: "New social platform", url: "https://www.instagram.com/stylist/" },
    ]);
  });

  it("keeps booking available when social links cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mockReads([], { error: true });
    const { getSocialLinks } = await import("@/lib/server/repository");
    await expect(getSocialLinks("jane-doe")).resolves.toEqual([]);
    expect(log).toHaveBeenCalledExactlyOnceWith("[booking] Social links lookup failed.", {
      code: "42501",
      status: 403,
    });
  });

  it("returns no links for an unconfigured stylist", async () => {
    mockReads([]);
    const { getSocialLinks } = await import("@/lib/server/repository");
    await expect(getSocialLinks("jane-doe")).resolves.toEqual([]);
  });

  it("does not read private links for a stylist without a public booking profile", async () => {
    const requests = mockReads([instagram], { publicProfile: false });
    const { getSocialLinks } = await import("@/lib/server/repository");
    await expect(getSocialLinks("unpublished-stylist")).resolves.toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/rest/v1/BookingProfiles");
  });
});
