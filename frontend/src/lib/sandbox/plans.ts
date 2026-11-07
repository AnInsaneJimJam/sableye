// Billing periods offered by the sandbox's "Pro plan" (1 USDT per period). The 2-minute one is the demo default
// (and keeps its original plan id, so existing subscriptions still resolve).
export const PERIODS = [
  { id: "2m", seconds: 120, label: "Every 2 minutes (demo)" },
  { id: "5s", seconds: 5, label: "Every 5 seconds (fast demo)" },
  { id: "10m", seconds: 600, label: "Every 10 minutes" },
  { id: "1h", seconds: 3600, label: "Hourly" },
  { id: "1d", seconds: 86_400, label: "Daily" },
  { id: "1w", seconds: 604_800, label: "Weekly" },
  { id: "30d", seconds: 2_592_000, label: "Monthly (30 days)" },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

export const periodOf = (id?: string | null) =>
  PERIODS.find((p) => p.id === id) ?? PERIODS[0];
export const planIdFor = (id?: string | null) =>
  periodOf(id).id === "2m" ? "pro_plan" : `pro_plan_${periodOf(id).id}`;

/** "1 d 4 h", "12 min", "45 s". */
export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 86_400)
    return `${Math.floor(s / 86_400)} d${s % 86_400 >= 3600 ? ` ${Math.floor((s % 86_400) / 3600)} h` : ""}`;
  if (s >= 3600)
    return `${Math.floor(s / 3600)} h${s % 3600 >= 60 ? ` ${Math.floor((s % 3600) / 60)} min` : ""}`;
  if (s >= 60)
    return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
  return `${s} s`;
}
/** "every 2 minutes", "daily", "every 30 days". */
export function cadence(seconds: number) {
  const known = PERIODS.find((p) => p.seconds === seconds);
  if (known)
    return known.id === "2m"
      ? "every 2 minutes"
      : known.id === "10m"
        ? "every 10 minutes"
        : known.label.toLowerCase().replace(" (30 days)", "");
  return `every ${duration(seconds)}`;
}
