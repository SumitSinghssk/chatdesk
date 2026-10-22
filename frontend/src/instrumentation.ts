import type { Instrumentation } from "next";

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";

function rate(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export async function register() {
  if (!DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: rate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: { deny: ["authorization", "cookie", "x-internal-key"] }, response: false },
    },
  });
  Sentry.setTag("component", process.env.NEXT_RUNTIME === "edge" ? "frontend-edge" : "frontend-server");
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
