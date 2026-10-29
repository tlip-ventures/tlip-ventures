import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * How long (seconds) cached shop data and pages are reused before being
 * refreshed in the background. Admin changes refresh them at once
 * (revalidatePath("/", "layout")); CSV imports and direct database edits show
 * within this time. Keep in step with `revalidate` in app/(shop)/layout.tsx.
 */
export const CATALOGUE_REVALIDATE = 600;

/**
 * Supabase client for public shop data, as an anonymous visitor (RLS applies).
 * Reads no cookies, so pages using it can be cached and served to everyone.
 * With `cache: true` (the default) responses go into Next's data cache (on
 * Cloudflare: the KV incremental cache) for CATALOGUE_REVALIDATE seconds.
 */
export function createPublicClient({ cache = true }: { cache?: boolean } = {}) {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, cache ? { ...init, next: { revalidate: CATALOGUE_REVALIDATE } } : { ...init, cache: "no-store" }),
    },
  });
}
