import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  REQUEST_IMAGES_BUCKET,
  requestImageUploadsSchema,
  type RequestImageKind,
  type RequestImageUpload,
} from "../request-images";

const isDemo = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function storageKey() {
  if (isDemo()) return "isolated-demo-image-uploads";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error(
      "[photo-upload] Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Set a server-only key and restart Next.js.",
    );
    throw new Error("Missing server-only Supabase storage key.");
  }
  return key;
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing Supabase URL.");
  return createClient(url, storageKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
}

export async function checkRequestImageStorage() {
  if (isDemo()) return;
  const { data, error } = await storage().getBucket(REQUEST_IMAGES_BUCKET);
  if (error || !data) {
    console.error(
      "[photo-upload] Cannot access the RequestImages bucket. Run npm run check:uploads.",
      {
        status: error?.status,
        statusCode: error?.statusCode,
      },
    );
    throw new Error("A private RequestImages bucket is required.");
  }
  if (data.public) {
    console.error(
      "[photo-upload] RequestImages must be private. Check the bucket's configuration.",
    );
    throw new Error("A private RequestImages bucket is required.");
  }
}

const authorizationSchema = z.object({
  appointmentId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  uploads: requestImageUploadsSchema,
  nonce: z.uuid(),
  expiresAt: z.number(),
});

function signature(payload: string) {
  return createHmac("sha256", storageKey()).update(`request-images:v1:${payload}`).digest();
}

/** Only the booking endpoint can issue permission to attach photos to a new appointment. */
export function createImageUploadToken(appointmentId: string, uploads: RequestImageUpload[]) {
  const authorization = authorizationSchema.parse({
    appointmentId,
    uploads,
    nonce: randomUUID(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  const payload = Buffer.from(JSON.stringify(authorization)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyImageUploadToken(token: string, appointmentId: string) {
  try {
    if (token.length > 2000) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, encodedSignature] = parts;
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const authorization = authorizationSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
    if (authorization.appointmentId !== appointmentId || authorization.expiresAt <= Date.now())
      return null;
    return authorization;
  } catch {
    return null;
  }
}

export async function uploadRequestImage(
  authorization: z.infer<typeof authorizationSchema>,
  kind: RequestImageKind,
  bytes: Uint8Array<ArrayBuffer>,
) {
  const upload = authorization.uploads.find((image) => image.kind === kind);
  if (!upload) throw new Error("This photo was not authorized.");
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
    upload.contentType
  ];
  // A stable path makes retries safe, including when an upload's response is lost.
  const path = `${authorization.appointmentId}/${kind}/${authorization.nonce}.${extension}`;
  if (!isDemo()) {
    const { error } = await storage()
      .from(REQUEST_IMAGES_BUCKET)
      .upload(path, bytes, {
        contentType: upload.contentType,
        upsert: true,
        metadata: { appointment_id: authorization.appointmentId, kind },
      });
    if (error) {
      console.error("[photo-upload] Supabase rejected a photo upload. Run npm run check:uploads.", {
        status: error.status,
        statusCode: error.statusCode,
      });
      throw new Error("Your photo couldn’t be uploaded. Please try again.");
    }
  }
  return { kind, path };
}
