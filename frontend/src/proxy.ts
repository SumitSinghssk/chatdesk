import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_ROUTES,
  CUSTOMER_GUEST_PATHS,
  CUSTOMER_PRIVATE_PATHS,
  CUSTOMER_ROUTES,
  CUSTOMER_SESSION_COOKIE,
  PUBLIC_ADMIN_PATHS,
  WEBSITE_ROUTES,
} from "@/config/routes";
import { proxyCache, type RedirectRule } from "@/lib/proxyCache";
const API = `${(process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001").replace(/\/$/, "")}/api/v1`;
const SESSION_COOKIE = "sk_admin";
const ADMIN_HINT_SECRET = process.env.ADMIN_HINT_SECRET || "";
const CACHE_MS = process.env.INTERNAL_API_KEY ? 300_000 : 30_000;
const FIREWALL_ENDPOINT = "/website/firewall";
const REVALIDATE_PATH = "/api/revalidate";

async function loadFirewall(): Promise<string[]> {
  const cached = proxyCache.firewall;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rules;
  const res = await fetch(`${API}${FIREWALL_ENDPOINT}`, {
    cache: "no-store",
    headers: process.env.INTERNAL_API_KEY ? { "X-Internal-Key": process.env.INTERNAL_API_KEY } : undefined,
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const rules = Array.isArray(res?.data) ? (res.data as string[]) : (cached?.rules ?? []);
  proxyCache.firewall = { at: Date.now(), rules };
  return rules;
}

const TRUST_PROXY = process.env.TRUST_PROXY === "true";

function clientIp(request: NextRequest): string | null {
  if (!TRUST_PROXY) return null;
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = hops.length ? hops[hops.length - 1] : request.headers.get("x-real-ip")?.trim();
  return ip || null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    value = value * 256 + Number(part);
  }
  return value;
}

function ipMatches(ip: string, rule: string): boolean {
  const [base, bits] = rule.split("/");
  const v4 = ip.replace(/^::ffff:/i, "");
  const ipInt = ipv4ToInt(v4);
  const baseInt = ipv4ToInt(base ?? "");
  if (ipInt !== null && baseInt !== null) {
    const prefix = bits === undefined ? 32 : Number(bits);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const size = 2 ** (32 - prefix);
    return Math.floor(ipInt / size) === Math.floor(baseInt / size);
  }
  return bits === undefined && ip.toLowerCase() === rule.toLowerCase();
}

async function loadRules() {
  const cached = proxyCache.rules;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  const [redirects, settings] = await Promise.all([
    fetch(`${API}/website/redirects`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(`${API}/website/settings/`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  proxyCache.rules = {
    at: Date.now(),
    redirects: new Map(
      ((redirects?.data ?? []) as RedirectRule[]).map((r) => [r.source_path.toLowerCase(), r])
    ),
    maintenance: !!settings?.data?.maintenance?.enabled,
  };
  return proxyCache.rules;
}

function customerGate(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(CUSTOMER_SESSION_COOKIE);
  if (!signedIn && CUSTOMER_PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL(CUSTOMER_ROUTES.LOGIN({ next: pathname + search }), request.url));
  }
  if (signedIn && CUSTOMER_GUEST_PATHS.includes(pathname)) {
    const next = request.nextUrl.searchParams.get("next") ?? "";
    const safe =
      next.startsWith("/") &&
      !next.startsWith("//") &&
      !next.startsWith("/admin") &&
      !CUSTOMER_GUEST_PATHS.some((p) => next === p || next.startsWith(`${p}?`));
    return NextResponse.redirect(new URL(safe ? next : CUSTOMER_ROUTES.DASHBOARD(), request.url));
  }
  return null;
}

function normalize(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "").toLowerCase() : path;
}

let hintKey: Promise<CryptoKey> | null = null;

async function hasAdminSession(request: NextRequest): Promise<boolean | null> {
  if (!ADMIN_HINT_SECRET) return null;
  const value = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const match = /^(\d+)\.(\d+)\.([0-9a-f]{64})$/.exec(value);
  if (!match || Number(match[2]) * 1000 < Date.now()) return false;
  hintKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ADMIN_HINT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signature = new Uint8Array(match[3].match(/../g)!.map((byte) => parseInt(byte, 16)));
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hintKey,
      signature,
      new TextEncoder().encode(`${match[1]}.${match[2]}`)
    );
  } catch {
    return false;
  }
}

function forwardToApi(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const headers = new Headers(request.headers);
  const ip = hops[hops.length - 1]?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (ip) headers.set("x-forwarded-for", ip);
  else headers.delete("x-forwarded-for");
  const target = new URL(`${API}${pathname.slice("/api/v1".length)}${search}`);
  return NextResponse.rewrite(target, { request: { headers } });
}

const SENTRY_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_SENTRY_DSN ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin : "";
  } catch {
    return "";
  }
})();

const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001").origin;
  } catch {
    return "";
  }
})();

function withAdminCsp(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${API_ORIGIN}`,
    `media-src 'self' blob: ${API_ORIGIN}`,
    "font-src 'self' data:",
    `connect-src 'self' ${API_ORIGIN} ${SENTRY_ORIGIN} https://*.razorpay.com`,
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com https://*.razorpay.com",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/v1/")) return forwardToApi(request);
  if (pathname === REVALIDATE_PATH) return NextResponse.next();
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return NextResponse.redirect(
      new URL(`${pathname.replace(/\/+$/, "") || "/"}${search}`, request.url),
      308
    );
  }
  const session = await hasAdminSession(request);

  const ip = clientIp(request);
  if (ip) {
    const rules = await loadFirewall();
    if (rules.some((rule) => ipMatches(ip, rule))) {
      return new NextResponse("Access denied", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  if (pathname.startsWith(ADMIN_ROUTES.ROOT())) {
    const isPublic = PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (isPublic && session === true) {
      const next = request.nextUrl.searchParams.get("next") ?? "";
      const safeNext =
        next.startsWith(`${ADMIN_ROUTES.ROOT()}/`) &&
        !next.startsWith("//") &&
        !PUBLIC_ADMIN_PATHS.some((p) => next === p || next.startsWith(`${p}?`) || next.startsWith(`${p}/`));
      return NextResponse.redirect(new URL(safeNext ? next : ADMIN_ROUTES.DASHBOARD(), request.url));
    }
    if (!isPublic && session === false && pathname !== ADMIN_ROUTES.ROOT()) {
      const url = new URL(ADMIN_ROUTES.LOGIN(), request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    return withAdminCsp(request);
  }

  const rules = await loadRules();

  if (rules.maintenance && session !== true && pathname !== WEBSITE_ROUTES.MAINTENANCE()) {
    return NextResponse.rewrite(new URL(WEBSITE_ROUTES.MAINTENANCE(), request.url), {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
  }

  const gate = customerGate(request);
  if (gate) return gate;

  const rule = rules.redirects.get(normalize(pathname));
  if (rule) {
    fetch(`${API}/website/redirects/hit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ip ? { "X-Forwarded-For": ip } : {}) },
      body: JSON.stringify({ source_path: rule.source_path }),
    }).catch(() => {});
    let target: string | URL = rule.target_url;
    if (!/^https?:\/\//i.test(rule.target_url)) {
      target = new URL(rule.target_url, request.url);
      if (!target.search && search) target.search = search;
    }
    return NextResponse.redirect(target, rule.status_code);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/|storage/|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map|txt|xml|json)$).*)",
  ],
};
