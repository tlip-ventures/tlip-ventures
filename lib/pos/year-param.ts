import { z } from "zod";

/** The years the year summary offers: this one and the four before it. */
export function yearChoices(now = new Date()): number[] {
  const y = now.getUTCFullYear();
  return [y, y - 1, y - 2, y - 3, y - 4];
}

/** ?year=2025, or this year when missing or out of range. */
export function parseYear(value: unknown, now = new Date()): number {
  const choices = yearChoices(now);
  const v = Array.isArray(value) ? value[0] : value;
  return z.coerce.number().int().refine((y) => choices.includes(y)).catch(choices[0]).parse(v ?? choices[0]);
}
