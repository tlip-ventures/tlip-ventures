/**
 * Cloudinary upload signature: SHA-1 of the parameters sorted by name and
 * joined as "a=1&b=2", followed by the API secret. Uses Web Crypto, so it runs
 * on Cloudflare Workers. Server-only in practice: the secret must never reach
 * the browser (callers live in server actions).
 * https://cloudinary.com/documentation/authentication_signatures
 */
export async function cloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string,
): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(toSign + apiSecret));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
