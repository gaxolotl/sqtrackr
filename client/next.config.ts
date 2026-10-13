import type { NextConfig } from "next";

// Security headers other than CSP live here. Content-Security-Policy is set
// as an enforcing header with a per-request nonce by proxy.ts (see
// dist/docs/01-app/02-guides/content-security-policy.md); do not add a
// static or Report-Only CSP here or responses will carry conflicting headers.
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
