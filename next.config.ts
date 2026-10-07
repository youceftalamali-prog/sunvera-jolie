import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
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
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  outputFileTracingExcludes: {
    "*": [
      ".netlify/**",
      ".git/**",
      "node_modules/@swc/**",
      "node_modules/esbuild/**",
      "node_modules/webpack/**",
      "node_modules/typescript/**",
    ],
  },
  images: {
    remotePatterns,
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

initOpenNextCloudflareForDev();

export default nextConfig;
