import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import kvNextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/kv-next-tag-cache";

// Page and data caching (ISR), see https://opennext.js.org/cloudflare/caching
// - Cached pages and Supabase responses live in Workers KV (NEXT_INC_CACHE_KV).
//   KV, not R2: R2 isn't enabled on the account, and KV reads are fast at the edge.
// - revalidatePath/revalidateTag times live in KV too (NEXT_TAG_CACHE_KV), so a
//   cached page needs no trip to a central database. KV is eventually
//   consistent: an admin change can take up to a minute to show in other regions.
// - Background refreshes go through a Durable Object queue (NEXT_CACHE_DO_QUEUE),
//   which stops one page being rebuilt many times at once.
// - Cache interception serves cached pages without loading the Next.js server.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: kvNextTagCache,
  queue: doQueue,
  enableCacheInterception: true,
});
