/**
 * When the shop answers WhatsApp orders (settings.reply_open, reply_close,
 * reply_days). Times are Ghana time: Africa/Accra is GMT all year, no summer time.
 */
export type ReplyHours = {
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  days: readonly number[];
  /** 24-hour "07:00", or "07:00:00" as Postgres returns it. */
  open: string;
  close: string;
};

export type ReplyStatus =
  | { open: true }
  /** `when` is "today", "tomorrow" or a weekday name; `at` is like "7am". */
  | { open: false; when: string; at: string };

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "07:30" or "07:30:00" → 450. */
export function minutesOf(time: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) throw new Error(`Not a time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "07:00" → "7am", "19:30" → "7:30pm", "12:00" → "12pm". */
export function formatTime(time: string): string {
  const total = minutesOf(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${hours < 12 ? "am" : "pm"}`;
}

/** [1,2,3,4,5,6] → "Mon–Sat"; [1,2,3,5] → "Mon–Wed, Fri"; all seven → "Every day". */
export function formatDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const runs: [number, number][] = [];
  for (const day of sorted) {
    const last = runs.at(-1);
    if (last && day === last[1] + 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs
    .map(([from, to]) => {
      if (from === to) return SHORT_DAYS[from - 1];
      if (to === from + 1) return `${SHORT_DAYS[from - 1]}, ${SHORT_DAYS[to - 1]}`;
      return `${SHORT_DAYS[from - 1]}–${SHORT_DAYS[to - 1]}`;
    })
    .join(", ");
}

/** "Mon–Sat, 7am–7:30pm". */
export function formatReplyHours(hours: ReplyHours): string {
  return `${formatDays(hours.days)}, ${formatTime(hours.open)}–${formatTime(hours.close)}`;
}

const ghanaClockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The weekday (1 = Monday) and minutes since midnight in Ghana at `now`. */
function ghanaClock(now: Date): { day: number; minutes: number } {
  const parts = Object.fromEntries(ghanaClockFormat.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    day: SHORT_DAYS.indexOf(parts.weekday) + 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Whether the shop is replying at `now`, and if not, when it next opens. Null when no reply days are set. */
export function replyStatus(hours: ReplyHours, now: Date): ReplyStatus | null {
  const days = new Set(hours.days);
  if (days.size === 0) return null;
  const { day, minutes } = ghanaClock(now);
  const open = minutesOf(hours.open);
  const close = minutesOf(hours.close);
  const at = formatTime(hours.open);

  if (days.has(day) && minutes >= open && minutes < close) return { open: true };
  if (days.has(day) && minutes < open) return { open: false, when: "today", at };
  for (let ahead = 1; ahead <= 7; ahead++) {
    const next = ((day - 1 + ahead) % 7) + 1;
    if (days.has(next)) return { open: false, when: ahead === 1 ? "tomorrow" : LONG_DAYS[next - 1], at };
  }
  return null;
}

/** "We'll reply when we open tomorrow at 7am." */
export function closedMessage(status: Extract<ReplyStatus, { open: false }>): string {
  const when = status.when === "today" || status.when === "tomorrow" ? status.when : `on ${status.when}`;
  return `We're closed now. We'll reply when we open ${when} at ${status.at}.`;
}

/** The reply hours from the settings row, or null when the owner has not set them. */
export function settingsReplyHours(s: {
  reply_open: string | null;
  reply_close: string | null;
  reply_days: number[];
}): ReplyHours | null {
  if (!s.reply_open || !s.reply_close || s.reply_days.length === 0) return null;
  return { days: s.reply_days, open: s.reply_open, close: s.reply_close };
}
