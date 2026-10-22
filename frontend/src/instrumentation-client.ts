const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

if (DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    const rate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
    Sentry.init({
      dsn: DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpBodies: [],
        httpHeaders: { request: { deny: ["authorization", "cookie", "x-internal-key"] }, response: false },
      },
    });
    Sentry.setTag("component", "frontend-browser");
  });
}
