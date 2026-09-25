import type { NextConfig } from "next";

type RemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
};

// Only trusted image hosts. No wildcard (*) is allowed.
const remotePatterns: RemotePattern[] = [
  { protocol: "https", hostname: "res.cloudinary.com" },
];

// Trust the configured remote object-storage host (if any) for next/image.
const uploadUrl = process.env.STORAGE_UPLOAD_URL;
if (uploadUrl) {
  try {
    const u = new URL(uploadUrl);
    if (u.protocol === "https:" || u.protocol === "http:") {
      remotePatterns.push({
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
      });
    }
  } catch {
    /* ignore malformed STORAGE_UPLOAD_URL */
  }
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Lets a second (development-mode) instance run next to a production build without touching
  // .next — used by the P2-10 storage cleanup regression step. Defaults to the standard folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Dev-only: allow the local origins to load Next.js dev resources (HMR/client
  // bundle). Without this, Next 16 blocks cross-origin dev resources and the
  // app never hydrates when accessed via 127.0.0.1. Has no effect in production.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns,
    // Local media is served by /api/media/[id] with a `?v=<storage key>` cache-busting token,
    // so next/image must be told that a query string on these local paths is expected.
    // `search` is deliberately omitted: any version token is accepted for these two prefixes.
    localPatterns: [{ pathname: "/api/media/**" }, { pathname: "/images/**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
