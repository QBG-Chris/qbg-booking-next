import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MAX_REQUEST_IMAGE_BYTES, requestImageError } from "@/lib/request-images";

vi.mock("server-only", () => ({}));
const { storageClient, bucket, upload, getBucket } = vi.hoisted(() => {
  const upload = vi.fn();
  const getBucket = vi.fn();
  const bucket = vi.fn(() => ({ upload }));
  const storageClient = vi.fn(() => ({ storage: { from: bucket, getBucket } }));
  return { storageClient, bucket, upload, getBucket };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: storageClient }));
import {
  createImageUploadToken,
  checkRequestImageStorage,
  verifyImageUploadToken,
} from "@/lib/server/request-images";
import { POST } from "@/app/api/bookings/[id]/images/route";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYl0AAAAASUVORK5CYII=",
  "base64",
);
const uploads = [{ kind: "inspo" as const, contentType: "image/png" as const }];

function request(
  token: string,
  file = new File([png], "photo.png", { type: "image/png" }),
  kind = "inspo",
) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  return new NextRequest("http://localhost/api/bookings/123/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}
const params = () => ({ params: Promise.resolve({ id: "123" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  upload.mockResolvedValue({ error: null });
  getBucket.mockResolvedValue({ data: { public: false }, error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("appointment photo storage", () => {
  it("identifies missing server credentials before contacting storage", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(checkRequestImageStorage()).rejects.toThrow(
      "Missing server-only Supabase storage key",
    );
    expect(storageClient).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SUPABASE_SECRET_KEY"));
  });
  it("supports an existing server-only service-role key", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-server-secret");
    await checkRequestImageStorage();
    expect(storageClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "legacy-server-secret",
      expect.any(Object),
    );
  });
  it("requires a private bucket before the booking is inserted", async () => {
    await checkRequestImageStorage();
    expect(getBucket).toHaveBeenCalledWith("RequestImages");
    getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    await expect(checkRequestImageStorage()).rejects.toThrow();
  });
  it("rejects forged, expired, and different-appointment tokens", () => {
    vi.useFakeTimers();
    const token = createImageUploadToken("123", uploads);
    expect(verifyImageUploadToken(token, "123")).toMatchObject({ appointmentId: "123" });
    expect(verifyImageUploadToken(token, "456")).toBeNull();
    expect(verifyImageUploadToken(`bad.${token.split(".")[1]}`, "123")).toBeNull();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(verifyImageUploadToken(token, "123")).toBeNull();
  });
  it("stores under the appointment and photo kind, using the same path for retries", async () => {
    const token = createImageUploadToken("123", uploads);
    const first = await POST(request(token), params());
    const second = await POST(request(token), params());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(bucket).toHaveBeenCalledWith("RequestImages");
    expect(upload.mock.calls[0][0]).toMatch(/^123\/inspo\/[a-f0-9-]+\.png$/);
    expect(upload.mock.calls[0][2]).toMatchObject({
      upsert: true,
      contentType: "image/png",
      metadata: { appointment_id: "123", kind: "inspo" },
    });
  });
  it("rejects missing permission, unselected kinds, and spoofed content without writing", async () => {
    const token = createImageUploadToken("123", uploads);
    expect((await POST(request(""), params())).status).toBe(403);
    expect((await POST(request(token, undefined, "selfie"), params())).status).toBe(403);
    expect(
      (
        await POST(
          request(token, new File(["not a png"], "photo.png", { type: "image/png" })),
          params(),
        )
      ).status,
    ).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
  it("bounds uploads even when the sender omits Content-Length", async () => {
    const token = createImageUploadToken("123", uploads);
    const oversized = new NextRequest("http://localhost/api/bookings/123/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data; boundary=test",
      },
      body: new Uint8Array(MAX_REQUEST_IMAGE_BYTES + 65537),
    });
    expect((await POST(oversized, params())).status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });
  it("can retry storage failures without changing the appointment or path", async () => {
    const token = createImageUploadToken("123", uploads);
    upload.mockResolvedValueOnce({ error: new Error("private internal failure") });
    const failed = await POST(request(token), params());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private internal failure");
    expect((await POST(request(token), params())).status).toBe(201);
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0]);
  });
  it("does not connect to storage in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await checkRequestImageStorage();
    expect((await POST(request(createImageUploadToken("123", uploads)), params())).status).toBe(
      201,
    );
    expect(storageClient).not.toHaveBeenCalled();
  });
  it("rejects empty, unsupported, and oversized files on the client", () => {
    expect(requestImageError({ size: 0, type: "image/png" })).toContain("empty");
    expect(requestImageError({ size: 100, type: "image/heic" })).toContain("HEIC");
    expect(requestImageError({ size: MAX_REQUEST_IMAGE_BYTES + 1, type: "image/jpeg" })).toContain(
      "4 MB",
    );
    expect(requestImageError({ size: 100, type: "image/webp" })).toBeUndefined();
  });
});
