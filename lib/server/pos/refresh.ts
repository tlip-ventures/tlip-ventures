import "server-only";
import { revalidatePath } from "next/cache";

/**
 * After a change in Stock and sales: refreshes every page, including the
 * shop's cached pages and data (kept for 10 minutes, see lib/supabase/public.ts).
 * Stock, prices, "On the website" and, while the website stock sync is on,
 * "in stock" all show on the shop, so they must not wait for the cache.
 */
export function refreshPosAndShop() {
  revalidatePath("/", "layout");
}
