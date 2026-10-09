import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// Gives `getCloudflareContext()` something to resolve to while running plain
// `next dev`; a no-op everywhere else.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  experimental: {
    // Turns on offline connectivity detection plus automatic retry of blocked
    // navigation, prefetch and Server Action requests, and enables the
    // `useOffline` hook (which returns false without it). Worth having on a
    // phone app that gets used in a supermarket aisle.
    useOffline: true,
  },

  // Prisma's runtime ships as WASM; leaving it in the Next bundle breaks the
  // worker build (OpenNext's documented Prisma requirement). `pg` and its
  // friends come along via the node-runtime client that only `next dev`/tests
  // construct; externalizing them keeps the worker bundle buildable without
  // changing that, and pg-cloudflare makes even the lazy `require()` inside
  // pg resolvable at runtime.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@prisma/adapter-neon",
    "pg",
    "pg-cloudflare",
  ],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // Never cache the worker itself, or a bad one becomes permanent.
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
