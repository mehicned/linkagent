// Plan limits. Billing is not wired up yet, so everyone is on the free
// plan; the gates and UI are already plan-aware so Stripe can slot in later.

export type Plan = "free" | "starter" | "pro";

export const REFRESH_OPTIONS: { hours: number; label: string; minPlan: Plan }[] = [
  { hours: 24, label: "Daily", minPlan: "pro" },
  { hours: 168, label: "Weekly", minPlan: "starter" },
  { hours: 720, label: "Monthly", minPlan: "free" },
];

const PLAN_RANK: Record<Plan, number> = { free: 0, starter: 1, pro: 2 };

export function getUserPlan(_userId: string | null): Plan {
  return "free";
}

export function planAllows(plan: Plan, minPlan: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[minPlan];
}

export function allowedRefreshHours(plan: Plan): number[] {
  return REFRESH_OPTIONS.filter((o) => planAllows(plan, o.minPlan)).map((o) => o.hours);
}

// Used to clamp stored values so a site never refreshes faster than its
// plan permits, even if the value predates a plan change.
export function clampRefreshHours(plan: Plan, hours: number): number {
  const allowed = allowedRefreshHours(plan);
  return allowed.includes(hours) ? hours : Math.max(...allowed);
}
