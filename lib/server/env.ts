import "server-only";
import { z } from "zod";

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

// Optional at startup so the storefront still runs without it; checkout and the
// order page need SUPABASE_SERVICE_ROLE_KEY and fail with a clear error if it is missing.
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string().min(20)),
  CLOUDINARY_API_KEY: optional(z.string().regex(/^\d+$/, "Cloudinary API key is numeric")),
  CLOUDINARY_API_SECRET: optional(z.string().min(10)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Validated server-only secrets. Read lazily because on Cloudflare Workers
 * process.env is filled from the Worker's bindings when a request arrives.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid server environment variables:\n${z.prettifyError(result.error)}`);
  }
  cached = result.data;
  return cached;
}
