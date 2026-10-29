// The dashboard's This week / This month / This year: the time ranges, the
// chart's bars and labels, and what each is compared with. Ghana is on GMT
// all year, so days start at midnight UTC.

import { formatPesewas, type Pesewas } from "@/lib/money";

export const PERIODS = ["week", "month", "year"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = { week: "This week", month: "This month", year: "This year" };

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type PeriodRange = {
  /** n + 1 times for n bars; the first is the start, the last the end. */
  bounds: Date[];
  labels: string[];
  /** Narrow screens: "23" instead of "Fri 23". */
  shortLabels: string[];
  prevFrom: Date;
  prevTo: Date;
  /** "this week", "in October", "in 2026" */
  word: string;
  /** "last week", "1–29 Sep", "2025 to 29 Oct" */
  prevWord: string;
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The range for a period, as of `now`. */
export function periodRange(period: Period, now: Date): PeriodRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = Date.UTC(y, m, d);

  if (period === "week") {
    // The last seven days, today included, against the seven before.
    const bounds = Array.from({ length: 8 }, (_, i) => new Date(today + (i - 6) * DAY));
    return {
      bounds,
      labels: bounds.slice(0, 7).map((b) => `${WEEKDAYS[b.getUTCDay()]} ${b.getUTCDate()}`),
      shortLabels: bounds.slice(0, 7).map((b) => String(b.getUTCDate())),
      prevFrom: new Date(today - 13 * DAY),
      prevTo: new Date(today - 6 * DAY),
      word: "this week",
      prevWord: "last week",
    };
  }

  if (period === "month") {
    // Weeks of the month: 1–7, 8–14, 15–21, 22–28 and what is left.
    const days = daysInMonth(y, m);
    const starts = [1, 8, 15, 22, 29].filter((s) => s <= days);
    const bounds = [...starts.map((s) => new Date(Date.UTC(y, m, s))), new Date(Date.UTC(y, m + 1, 1))];
    const labels = starts.map((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] - 1 : days;
      return end === s ? String(s) : `${s}–${end}`;
    });
    // The same days of last month, so a month in progress isn't compared with a whole one.
    const pm = new Date(Date.UTC(y, m - 1, 1));
    const span = Math.min(d, daysInMonth(pm.getUTCFullYear(), pm.getUTCMonth()));
    return {
      bounds,
      labels,
      shortLabels: labels,
      prevFrom: pm,
      prevTo: new Date(pm.getTime() + span * DAY),
      word: `in ${LONG_MONTHS[m]}`,
      prevWord: span === 1 ? `1 ${MONTHS[pm.getUTCMonth()]}` : `1–${span} ${MONTHS[pm.getUTCMonth()]}`,
    };
  }

  // The year so far, month by month, against last year up to the same day.
  const bounds = Array.from({ length: m + 2 }, (_, i) => new Date(Date.UTC(y, i, 1)));
  return {
    bounds,
    labels: MONTHS.slice(0, m + 1),
    shortLabels: MONTHS.slice(0, m + 1).map((name) => name.charAt(0)),
    prevFrom: new Date(Date.UTC(y - 1, 0, 1)),
    prevTo: new Date(Date.UTC(y - 1, m, d + 1)),
    word: `in ${y}`,
    prevWord: `${y - 1} to ${d} ${MONTHS[m]}`,
  };
}

/** "+12%", "−5%" or "0%"; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `−${-pct}%`;
  return "0%";
}

/** Top of the chart's scale, in pesewas: a round number of cedis above the tallest bar. */
export function chartTop(max: Pesewas): Pesewas {
  const cedis = max / 100;
  const step = cedis > 20_000 ? 10_000 : cedis > 4_000 ? 2_000 : 1_000;
  return Math.max(1, Math.ceil(cedis / step)) * step * 100;
}

/** Axis labels: "GH₵ 2k", "GH₵ 2.5k", "GH₵ 500". */
export function shortMoney(pesewas: Pesewas): string {
  const cedis = pesewas / 100;
  if (cedis >= 1000) return `GH₵ ${Math.round(cedis / 100) / 10}k`;
  return formatPesewas(Math.round(cedis) * 100);
}

/** Bar height as a percentage of the chart; a sliver for zero sales, nothing for zero purchases. */
export function barHeight(value: Pesewas, top: Pesewas, minimum: number): string {
  if (value <= 0) return `${minimum}%`;
  return `${Math.max(1, Math.min(100, (value / top) * 100))}%`;
}

/** "Good morning", "Good afternoon" or "Good evening", Ghana time. */
export function greeting(now: Date): string {
  const h = now.getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
