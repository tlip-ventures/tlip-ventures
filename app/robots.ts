import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** /robots.txt: crawl the shop, not the admin, the stock app, cart, checkout, search results or private order links. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/pos", "/api/", "/cart", "/order-sent", "/o/", "/search"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
