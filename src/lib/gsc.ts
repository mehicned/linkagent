import { eq } from "drizzle-orm";
import { db, gscConnections } from "./db";
import { stripWww } from "./extract";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function gscConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gscAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ refresh_token?: string; access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("Google token exchange failed.");
  return res.json();
}

// Returns a valid access token for the user, refreshing when expired.
export async function getAccessToken(userId: string): Promise<string | null> {
  const [conn] = await db.select().from(gscConnections).where(eq(gscConnections.userId, userId)).limit(1);
  if (!conn) return null;
  if (conn.accessToken && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt > Date.now() + 60_000) {
    return conn.accessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data: { access_token: string; expires_in: number } = await res.json();
  await db
    .update(gscConnections)
    .set({ accessToken: data.access_token, accessTokenExpiresAt: Date.now() + data.expires_in * 1000 })
    .where(eq(gscConnections.userId, userId));
  return data.access_token;
}

export async function listProperties(accessToken: string): Promise<string[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data: { siteEntry?: { siteUrl: string; permissionLevel: string }[] } = await res.json();
  return (data.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl);
}

// Best matching Search Console property for a host: domain property first,
// then URL-prefix properties on either www variant.
export function matchProperty(host: string, properties: string[]): string | null {
  const bare = stripWww(host);
  const domain = properties.find((p) => p === `sc-domain:${bare}`);
  if (domain) return domain;
  const prefixes = [
    `https://${bare}/`,
    `https://www.${bare}/`,
    `http://${bare}/`,
    `http://www.${bare}/`,
  ];
  for (const candidate of prefixes) {
    const hit = properties.find((p) => p === candidate);
    if (hit) return hit;
  }
  return null;
}

export interface GscDailyRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function queryDaily(
  accessToken: string,
  property: string,
  startDate: string,
  endDate: string,
): Promise<GscDailyRow[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 1000 }),
    },
  );
  if (!res.ok) return [];
  const data: { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] } =
    await res.json();
  return (data.rows ?? [])
    .map((r) => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
