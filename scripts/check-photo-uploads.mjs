import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(
  fileURLToPath(new URL("..", import.meta.url)),
  process.env.NODE_ENV !== "production",
  {
    info() {},
    error() {
      console.error("An environment file could not be loaded.");
    },
  },
);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function check() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    console.log("Demo mode is enabled. Photos are simulated and are not stored in Supabase.");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    fail("NEXT_PUBLIC_SUPABASE_URL is missing. Set it in .env.local or the server environment.");
    return;
  }
  if (!key) {
    fail("SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is missing.");
    console.log("Copy your server secret from Supabase Settings > API Keys into .env.local.");
    console.log("Restart Next.js after saving it. Do not use the public/anonymous key here.");
    return;
  }
  let role;
  try {
    role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
  } catch {
    // Modern sb_secret_ keys aren't JWTs.
  }
  if (key.startsWith("sb_publishable_") || role === "anon" || role === "authenticated") {
    fail("The storage key is a public/user key. Configure a server secret or service_role key.");
    return;
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(10000) }),
    },
  });
  const { data, error } = await client.storage.getBucket("RequestImages");
  if (error || !data) {
    const status = Number(error?.status || error?.statusCode);
    fail(`Cannot read the RequestImages bucket${status ? ` (HTTP ${status})` : ""}.`);
    console.log("Verify the bucket exists and the secret key belongs to NEXT_PUBLIC_SUPABASE_URL.");
    console.log("Bucket setup: supabase/migrations/202610190001_request_images.sql");
    return;
  }
  if (data.public) fail("RequestImages is public. The booking app requires a private bucket.");
  if (data.file_size_limit != null && data.file_size_limit < 4 * 1024 * 1024)
    fail("The bucket size limit is below the app's 4 MB photo limit.");
  const mimeTypes = data.allowed_mime_types;
  if (
    mimeTypes?.length &&
    !["image/jpeg", "image/png", "image/webp"].every(
      (type) =>
        mimeTypes.includes(type) || mimeTypes.includes("image/*") || mimeTypes.includes("*/*"),
    )
  )
    fail("The bucket must allow image/jpeg, image/png, and image/webp.");
  if (!process.exitCode) {
    console.log(
      "PASS: The server key can read the private RequestImages bucket; photo limits match.",
    );
    console.log(
      "This check reads configuration only. It does not upload photos or create bookings.",
    );
  }
}

check().catch(() => {
  fail("Storage could not be reached. Check the Supabase URL, key, and network connection.");
});
