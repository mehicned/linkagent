import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites, gscConnections } from "@/lib/db";
import { requireUser, userOwnsSite } from "@/lib/session";
import { exchangeCode, listProperties, matchProperty } from "@/lib/gsc";

// Completes the Google OAuth flow, stores the refresh token, and tries to
// auto-match the Search Console property for the site that started the flow.
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const cookieState = req.cookies.get("la_gsc_state")?.value ?? "";
  const siteId = Number(state.split(".")[0]);

  const back = (id: number) => NextResponse.redirect(new URL(`/sites/${id}`, req.nextUrl.origin));

  if (!code || !state || state !== cookieState || !siteId) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }
  if (!(await userOwnsSite(user.id, siteId))) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  try {
    const origin = (process.env.BETTER_AUTH_URL ?? req.nextUrl.origin).replace(/\/$/, "");
    const tokens = await exchangeCode(code, `${origin}/api/gsc/callback`);

    const [existing] = await db.select().from(gscConnections).where(eq(gscConnections.userId, user.id)).limit(1);
    const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) return back(siteId);

    const values = {
      refreshToken,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    };
    if (existing) {
      await db.update(gscConnections).set(values).where(eq(gscConnections.userId, user.id));
    } else {
      await db.insert(gscConnections).values({ userId: user.id, ...values, createdAt: Date.now() });
    }

    // Auto-match the property so most users never think about it.
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (site && !site.gscProperty) {
      const properties = await listProperties(tokens.access_token);
      const matched = matchProperty(site.host, properties);
      if (matched) await db.update(sites).set({ gscProperty: matched }).where(eq(sites.id, siteId));
    }
  } catch {
    /* fall through to redirect; the tab shows the connect state again */
  }

  const res = back(siteId);
  res.cookies.delete("la_gsc_state");
  return res;
}
