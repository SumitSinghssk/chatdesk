import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

import { ADMIN_ROUTES } from "./src/config/routes/admin";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";
const IS_PROD = process.env.NODE_ENV === "production";
const IS_HTTPS = IS_PROD && (process.env.NEXT_PUBLIC_SITE_URL || "").startsWith("https://");
const WEBSITE_CSP = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  `form-action 'self' ${new URL(API_URL).origin}`,
  ...(IS_HTTPS ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/storage/uploads/:path*", destination: `${API_URL}/storage/uploads/:path*` },
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
    ];
  },
  async redirects() {
    const id = ":id(\\d+)";
    const { ENQUIRIES, BLOGS, PAGES, GALLERIES, USERS } = ADMIN_ROUTES;
    return [
      { source: `${ENQUIRIES.path}/${id}`, destination: `${ENQUIRIES.path}?enquiry=:id`, permanent: false },
      { source: `${BLOGS.path}/create`, destination: `${BLOGS.path}?open=new`, permanent: false },
      { source: `${BLOGS.path}/${id}/edit`, destination: `${BLOGS.path}?open=:id`, permanent: false },
      { source: `${PAGES.path}/create`, destination: `${PAGES.path}?open=new`, permanent: false },
      { source: `${PAGES.path}/${id}/edit`, destination: `${PAGES.path}?open=:id`, permanent: false },
      { source: `${GALLERIES.path}/${id}`, destination: `${GALLERIES.path}?open=:id`, permanent: false },
      { source: `${USERS.path}/${id}`, destination: `${USERS.path}?open=:id`, permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(IS_HTTPS
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
      {
        // the website chat (/ai-chat) and embedded diagrams (/embed) are the pages other websites may show in a frame
        source: "/((?!ai-chat/|embed/).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/((?!admin(?:/|$)|_next/|storage/|api/|ai-chat/|embed/).*)",
        headers: [{ key: "Content-Security-Policy", value: WEBSITE_CSP }],
      },
      {
        source: "/ai-chat/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *; object-src 'none'; base-uri 'self'" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *; object-src 'none'; base-uri 'self'" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: `${ADMIN_ROUTES.ROOT.path}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/storage/uploads/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
          },
        ],
      },
    ];
  },
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig;
