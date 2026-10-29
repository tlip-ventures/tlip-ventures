import type { NextConfig } from "next";

// Security headers on every page and route. No full script-blocking CSP: with
// Next.js that needs per-request nonces; these directives can't break scripts.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Photo uploads use the file picker, which these don't affect.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Cache Components (`cacheComponents` / `partialPrefetching`) stay off: on the
  // Workers runtime Next.js warns it "cannot guarantee" them and requests hang.
  // Revisit when @opennextjs/cloudflare supports them.
  images: {
    // All product images come from Cloudinary; see lib/cloudinary-loader.ts.
    loader: "custom",
    loaderFile: "./lib/cloudinary-loader.ts",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Lets `next dev` use Cloudflare bindings (env vars, secrets) from wrangler.jsonc.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
