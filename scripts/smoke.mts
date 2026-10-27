/**
 * Quick check of a deployed site, for right after a deploy. Read-only: it
 * never places orders or changes anything.
 *
 *   npm run smoke -- https://tlip-ventures.example.workers.dev
 *   npm run smoke -- https://… --whatsapp 0242959396     also check the shop's number is shown
 */
import { formatGhanaPhone, normaliseGhanaPhone } from "@/lib/phone";

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:\/\//.test(a))?.replace(/\/+$/, "");
const whatsappArg = args.includes("--whatsapp") ? args[args.indexOf("--whatsapp") + 1] : undefined;
if (!base) {
  console.error("Usage: npm run smoke -- <site URL> [--whatsapp 0242959396]");
  process.exit(1);
}
const whatsapp = whatsappArg ? normaliseGhanaPhone(whatsappArg) : null;
if (whatsappArg && !whatsapp) {
  console.error(`Not a Ghanaian number: ${whatsappArg}`);
  process.exit(1);
}

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function get(path: string) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { redirect: "manual", headers: { "User-Agent": "tlip-smoke-test" } });
    const body = res.headers.get("content-type")?.match(/text|json|xml/) ? await res.text() : "";
    return { status: res.status, headers: res.headers, body, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, headers: new Headers(), body: String(error), ms: Date.now() - started };
  }
}

const origin = new URL(base).origin;
console.log(`Checking ${base}\n`);

const home = await get("/");
check(home.status === 200, "home page loads", `HTTP ${home.status}`);
check(home.body.includes("Tlip Ventures"), "home page shows the shop name");
const canonical = home.body.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
check(Boolean(canonical), "home page has a canonical URL");
// Canonical, sitemap and order links are built from NEXT_PUBLIC_SITE_URL at build time.
check(canonical.startsWith(origin), `canonical URL uses this site's address (${origin})`, canonical || "none");
check(home.body.includes('property="og:image"'), "home page has a share image");
check(home.body.includes('"@type":"Store"'), "home page has Store data for search engines");
check(home.ms < 5000, `home page answered in ${home.ms} ms`, "slower than 5 s");
if (whatsapp) {
  check(home.body.includes(formatGhanaPhone(whatsapp)), `footer shows WhatsApp ${formatGhanaPhone(whatsapp)}`);
  check(!home.body.includes("020 000 0000"), "placeholder WhatsApp number is gone");
}

const csp = home.headers.get("content-security-policy") ?? "";
check(csp.includes("frame-ancestors 'none'"), "pages can't be framed by other sites");
check(home.headers.get("x-content-type-options") === "nosniff", "nosniff header");
check(Boolean(home.headers.get("strict-transport-security")), "HTTPS-only header");

for (const path of ["/products", "/deals", "/categories", "/how-to-order", "/about", "/privacy", "/cart", "/search?q=kettle"]) {
  const page = await get(path);
  check(page.status === 200, `${path} loads`, `HTTP ${page.status}`);
}

const sitemap = await get("/sitemap.xml");
const productUrl = sitemap.body.match(/<loc>([^<]*\/products\/[^<]+)<\/loc>/)?.[1];
check(sitemap.status === 200 && sitemap.body.includes("<urlset"), "sitemap.xml loads", `HTTP ${sitemap.status}`);
check(Boolean(productUrl), "sitemap lists products");
if (productUrl) {
  const product = await get(new URL(productUrl).pathname);
  check(product.status === 200, `a product page loads (${new URL(productUrl).pathname})`, `HTTP ${product.status}`);
  check(product.body.includes('"@type":"Product"') && product.body.includes('"priceCurrency":"GHS"'), "product page has Product data in GHS");
  check(product.body.includes("Add to cart") || product.body.includes("Out of stock"), "product page shows Add to cart");
  check(productUrl.startsWith(origin), `sitemap uses this site's address`, productUrl);
}

const robots = await get("/robots.txt");
check(robots.status === 200 && /Disallow: \/admin/.test(robots.body) && /Sitemap: https?:\/\//.test(robots.body), "robots.txt blocks /admin and points to the sitemap");
const manifest = await get("/manifest.webmanifest");
check(manifest.status === 200, "web app manifest loads", `HTTP ${manifest.status}`);
for (const path of ["/brand/logo.webp", "/brand/share.png", "/brand/icon-192.png"]) {
  const file = await get(path);
  check(file.status === 200, `${path} is served`, `HTTP ${file.status}`);
}

const missing = await get("/products/this-product-does-not-exist-smoke-test");
check(missing.status === 404, "missing product returns 404", `HTTP ${missing.status}`);
const badOrder = await get("/o/AAAAAAAAAAAAAAAAAAAAAAAA");
check(badOrder.status === 404, "unknown order link returns 404", `HTTP ${badOrder.status}`);
const admin = await get("/admin");
check([302, 303, 307, 308].includes(admin.status) && (admin.headers.get("location") ?? "").includes("/admin/login"), "/admin sends visitors to the login page", `HTTP ${admin.status}`);
const login = await get("/admin/login");
check(login.status === 200 && login.body.includes("noindex"), "admin login loads and is hidden from search", `HTTP ${login.status}`);
const badCart = await get("/api/cart?ids=not-a-uuid");
check(badCart.status === 400, "cart API rejects bad input", `HTTP ${badCart.status}`);

console.log(failures ? `\n${failures} check${failures === 1 ? "" : "s"} failed.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
