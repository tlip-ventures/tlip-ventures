// Dates and names for the Stock & POS app. Ghana is on GMT all year, so
// "Ghana time" is UTC: dates are formatted in UTC whatever the device says.

import { formatGhanaPhone } from "@/lib/phone";

const TIME_ZONE = "UTC";

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });

/** "16 May 2023" */
export function formatDay(value: string | Date): string {
  return dayFormat.format(new Date(value));
}

/** "Thursday, 29 October 2026" (Intl leaves out the comma in en-GB). */
export function formatLongDay(value: string | Date): string {
  const parts = longDayFormat.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}`;
}

/** "16 May 2023, 14:05" */
export function formatDayTime(value: string | Date): string {
  const date = new Date(value);
  return `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
}

/** "OW" for Owner, "AM" for Ama Mensah. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** What to call someone: their name, else their role. */
export function personName(displayName: string | null, role: string): string {
  return displayName?.trim() || (role === "owner" ? "Owner" : "Staff");
}

/** "1 product", "3 products" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** "024 123 4567" for a stored 233… number; anything else as it is. */
export function phoneText(phone: string | null): string | null {
  if (!phone) return null;
  try {
    return formatGhanaPhone(phone);
  } catch {
    return phone;
  }
}
