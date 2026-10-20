import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep browser checks independent of an already-running local dev server.
  distDir: process.env.BOOKING_E2E === "true" ? ".next/playwright" : ".next",
};
export default nextConfig;
