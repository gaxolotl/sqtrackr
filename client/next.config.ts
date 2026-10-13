import type { NextConfig } from "next";

// Conservative CSP baseline. Served as Content-Security-Policy-Report-Only
// (not enforcing) because Next.js hydration injects inline scripts and the
// root layout sets inline theme styles (see app/layout.tsx), both of which a
// static `script-src 'self'` would block. connect-src covers the default
// dev API origins on :3001; same-origin deployments are covered by 'self'.
// TODO(csp-enforce): generate a per-request nonce in middleware, forward it
// via Next's nonce support (`script-src 'self' 'nonce-...'`), then flip this
// header to enforcing `Content-Security-Policy`. Keep nginx.conf in sync.
// Deployments whose NEXT_PUBLIC_API_URL points off-origin must extend
// connect-src with that origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:3001 http://127.0.0.1:3001",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version on responses (the API also
  // disables x-powered-by). Matches the API's no-referrer policy below.
  poweredByHeader: false,
  transpilePackages: ["@sqtrackr/plugin-sdk", "@sqtrackr/plugin-reseed-radar", "@sqtrackr/plugin-collages", "@sqtrackr/plugin-member-ranks", "@sqtrackr/plugin-upload-subscriptions"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        port: "",
        pathname: "/t/p/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
