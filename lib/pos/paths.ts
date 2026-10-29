/**
 * Where to go after signing in to the Stock & POS app. Only same-site /pos
 * paths are allowed, so a crafted ?next= link can't send someone elsewhere.
 */
export function safePosPath(next: string | null | undefined): string {
  if (!next || !/^\/pos(?:[/?#]|$)/.test(next)) return "/pos";
  if (next.includes("\\") || next.includes("//") || next.startsWith("/pos/login")) return "/pos";
  return next;
}
