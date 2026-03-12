import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Security middleware — combines Auth.js session checks with
 * CSP and hardening headers (PRD 4.5).
 */
export default auth((req) => {
  const res = NextResponse.next();

  // ── Common security headers ──────────────────────────────────────────
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");

  // ── Content Security Policy ──────────────────────────────────────────
  const csp = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);

  return res;
});

export const config = {
  matcher: [
    // Auth-protected + page routes for security headers.
    // Excludes static assets, API routes (own headers), Next.js internals.
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
