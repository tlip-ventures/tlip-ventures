import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Cloudflare Workers rate limiting binding (wrangler.jsonc "ratelimits"). */
type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

/**
 * True if this visitor may place another order now: at most 3 a minute per IP
 * address, counted by Cloudflare. Allows the order when the limiter isn't
 * available (local `next dev` without the binding), so checkout never breaks
 * because of it.
 */
export async function checkoutAllowedForIp(ip: string | null): Promise<boolean> {
  if (!ip) return true;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const limiter = (env as unknown as { CHECKOUT_RATE_LIMITER?: RateLimiter }).CHECKOUT_RATE_LIMITER;
    if (!limiter) return true;
    const { success } = await limiter.limit({ key: `checkout:${ip}` });
    return success;
  } catch {
    return true;
  }
}
