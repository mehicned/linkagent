import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser, userOwnsSite } from "@/lib/session";
import { gscConfigured, gscAuthUrl } from "@/lib/gsc";

// Starts the Google OAuth flow for Search Console access.
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!gscConfigured()) return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 501 });

  const siteId = Number(req.nextUrl.searchParams.get("siteId"));
  if (!siteId || !(await userOwnsSite(user.id, siteId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nonce = crypto.randomBytes(12).toString("hex");
  const state = `${siteId}.${nonce}`;
  const origin = (process.env.BETTER_AUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const res = NextResponse.redirect(gscAuthUrl(`${origin}/api/gsc/callback`, state));
  res.cookies.set("la_gsc_state", state, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  return res;
}
