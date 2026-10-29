/**
 * Where to go after signing in. Only same-site /admin paths are allowed, so a
 * crafted ?next= link can't send the owner to another website.
 */
export function safeAdminPath(next: string | null | undefined): string {
  if (!next || !/^\/admin(?:[/?#]|$)/.test(next)) return "/admin";
  // Backslashes and protocol-relative tricks ("/admin/..//evil", "/admin\\evil") are never needed.
  if (next.includes("\\") || next.includes("//")) return "/admin";
  return next;
}
