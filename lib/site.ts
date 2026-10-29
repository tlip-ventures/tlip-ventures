import { publicEnv } from "@/lib/env";

/** The public site address without a trailing slash, e.g. https://tlipventures.com. */
export const SITE_URL = (publicEnv.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Absolute URL for a path on this site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
