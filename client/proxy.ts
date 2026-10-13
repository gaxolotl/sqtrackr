import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Nonce-based CSP per Next.js docs (dist/docs/01-app/02-guides/
// content-security-policy.md). Uses `proxy` (not deprecated `middleware`)
// with per-request nonce forwarded via x-nonce for Next.js to apply to
// framework scripts. Style attributes (theme vars in app/layout.tsx) still
// need 'unsafe-inline'; scripts are nonce-gated with strict-dynamic.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  const connectSrc = [
    "'self'",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    ...(apiOrigin ? [apiOrigin] : []),
  ].join(" ");
  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
