// The owner's Reports: which stretch of time the overview covers. Ghana is on
// GMT all year, so days start at midnight UTC.

import { formatDay } from "./format";

export const REPORT_PERIODS = ["today", "week", "month", "last_month", "year", "custom"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last_month: "Last month",
  year: "This year",
  custom: "Pick dates",
};

const DAY = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value: string | undefined): Date | null {
  if (!value || !ISO_DAY.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export type ReportRange = {
  period: ReportPeriod;
  from: Date;
  /** The day after the last day. */
  to: Date;
  /** "9 Nov 2026" or "1 Nov 2026 – 30 Nov 2026" */
  label: string;
  /** For the date boxes: the first and last day, as yyyy-mm-dd. */
  first: string;
  last: string;
};

/**
 * The range for a period as of `now`. "custom" takes the first and last day
 * (yyyy-mm-dd, either order); bad or missing dates fall back to this month.
 * A custom range is at most about five years long.
 */
export function reportRange(period: ReportPeriod, now: Date, first?: string, last?: string): ReportRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  let from: Date;
  let to: Date;
  let chosen = period;

  if (period === "today") {
    from = new Date(Date.UTC(y, m, d));
    to = new Date(Date.UTC(y, m, d + 1));
  } else if (period === "week") {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    from = new Date(Date.UTC(y, m, d - sinceMonday));
    to = new Date(Date.UTC(y, m, d - sinceMonday + 7));
  } else if (period === "last_month") {
    from = new Date(Date.UTC(y, m - 1, 1));
    to = new Date(Date.UTC(y, m, 1));
  } else if (period === "year") {
    from = new Date(Date.UTC(y, 0, 1));
    to = new Date(Date.UTC(y + 1, 0, 1));
  } else {
    const a = period === "custom" ? day(first) : null;
    const b = period === "custom" ? day(last) : null;
    if (a && b) {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      from = lo;
      to = new Date(Math.min(hi.getTime() + DAY, lo.getTime() + 5 * 366 * DAY));
    } else {
      chosen = "month";
      from = new Date(Date.UTC(y, m, 1));
      to = new Date(Date.UTC(y, m + 1, 1));
    }
  }

  const lastDay = new Date(to.getTime() - DAY);
  return {
    period: chosen,
    from,
    to,
    label: to.getTime() - from.getTime() === DAY ? formatDay(from) : `${formatDay(from)} – ${formatDay(lastDay)}`,
    first: from.toISOString().slice(0, 10),
    last: lastDay.toISOString().slice(0, 10),
  };
}

/** Share of a whole as a whole percent, or "—". */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}
