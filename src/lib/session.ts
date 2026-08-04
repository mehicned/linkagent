import { headers } from "next/headers";
import { eq, isNull } from "drizzle-orm";
import { auth } from "./auth";
import { db, sites } from "./db";

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// Sites created before auth existed have no owner. The first signed-in user
// to touch the app claims them, which keeps self-hosted upgrades painless.
export async function claimUnownedSites(userId: string) {
  await db.update(sites).set({ userId }).where(isNull(sites.userId));
}

export async function userOwnsSite(userId: string, siteId: number): Promise<boolean> {
  const [site] = await db.select({ userId: sites.userId }).from(sites).where(eq(sites.id, siteId)).limit(1);
  return !!site && site.userId === userId;
}
