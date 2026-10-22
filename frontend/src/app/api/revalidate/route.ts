import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { CACHE_TAGS, isCacheTag } from "@/config/cache";
import { clearProxyCache } from "@/lib/proxyCache";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.INTERNAL_API_KEY || "";
  const given = request.headers.get("x-internal-key") || "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ status: false, message: "Not allowed" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.tags) ? body.tags : [];
  const tags = [...new Set(raw.filter(isCacheTag))];
  if (raw.length && !tags.length) {
    return NextResponse.json({ status: false, message: "Unknown cache tags" }, { status: 422 });
  }

  const everything = CACHE_TAGS.every((t) => tags.includes(t));
  for (const tag of everything ? ["website"] : tags) revalidateTag(tag, { expire: 0 });
  if (tags.length) clearProxyCache(everything ? [] : tags);

  return NextResponse.json(
    { status: true, revalidated: everything ? ["website"] : tags },
    { headers: { "Cache-Control": "no-store" } }
  );
}
