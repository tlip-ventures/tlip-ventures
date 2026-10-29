Tlip Ventures — online shop
What this is
Mobile-first e-commerce site for Tlip Ventures, a home and kitchen goods shop in Ghana. Customers browse, add to cart, enter name and phone, and are handed off to the shop's WhatsApp with a pre-filled order message. The website takes NO payments and handles NO delivery: in the WhatsApp chat the owner confirms availability, agrees delivery and its fee, and shares a payment number or method. The owner manages the website (products, photos, categories, banners, orders) at /admin, and runs the shop counter in Stock and sales at /pos: point of sale, stock, purchases, returns, money owed and reports, shared with staff.
Stack

* Next.js, latest stable, App Router, TypeScript strict. Server Components by default, Server Actions for mutations.
* Tailwind CSS, latest. No UI framework; small hand-built components.
* Supabase: Postgres, Auth (admin only), row-level security. Use @supabase/ssr.
* Cloudinary for all product images, delivered via URL transforms (f_auto, q_auto, width) through a custom next/image loader.
* Hosting: Cloudflare Workers via the OpenNext Cloudflare adapter (@opennextjs/cloudflare). Follow its current docs.
* Zustand for the cart (persisted to localStorage). Zod for all input validation.
* Vitest for unit tests of pure functions. npm as package manager.

Commands

* npm run dev: Next.js dev server at http://localhost:3000 (reads .env.local; Cloudflare bindings via initOpenNextCloudflareForDev)
* npm run build: Next.js production build (plain `next build`)
* npm run preview: build for Workers with OpenNext, then serve on the local Workers runtime (wrangler dev) at http://localhost:8787
* npm run deploy: build for Workers and deploy to Cloudflare (needs `wrangler login` or CLOUDFLARE_API_TOKEN)
* Automatic deploys: .github/workflows/deploy.yml runs on every push to main (and manually from the Actions tab). Needs repo secret CLOUDFLARE_API_TOKEN (the Cloudflare account ID is in wrangler.jsonc); after deploying it copies the repo secrets SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET into the Worker's secrets (wrangler secret bulk). NEXT_PUBLIC_* come from the committed .env.
* npm run upload: build and upload a new Worker version without making it live
* npm run cf-typegen: regenerate cloudflare-env.d.ts after changing wrangler.jsonc bindings
* npm run typecheck: `next typegen` then `tsc --noEmit`
* npm run lint: ESLint
* npm test: Vitest once (npm run test:watch to watch)
* npm run check: typecheck, lint, tests and build in one go (run before calling a task done)
* npm run db:new -- <name>: new SQL migration in supabase/migrations/
* npm run db:push: apply migrations to the linked Supabase project (first `npx supabase login` and `npx supabase link --project-ref <ref>`)
* npm run db:types: generate lib/database.types.ts from the linked project (or use the Supabase connector's type generation); regenerate after every migration
* npm run products:export -- <file.csv> / npm run products:import -- <file.csv> [--apply]: spreadsheet export and import of products, run locally with the secret key in .env.local (scripts/README.md). Import is a dry run unless --apply is given. Without a computer: put the CSV and photos under imports/ on main and run the "Import products" GitHub Action (.github/workflows/import-products.yml; repo secrets SUPABASE_SERVICE_ROLE_KEY, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).
* Testing on real phones before launch: docs/testing-checklist.md
* Stock and sales go-live steps (owner): docs/pos-go-live.md
* npm run smoke -- <site URL> [--whatsapp 0242959396]: read-only check of a deployed site (pages, 404s, SEO files, security headers, admin redirect). Launch steps: docs/launch.md
* Supabase project: tlip-ventures (ref raxbsxepqyewbxoqcpaj). Migration file names must match the version recorded in the database.
* Seed data: supabase/seed/categories.sql, settings.sql, demo_products.sql (all safe to re-run); demo_products_remove.sql deletes the demo products; make_admin.sql gives an existing Supabase Auth user access to /admin (create the user first in the dashboard)
* is_admin() lives in the `private` schema (not exposed by the API); RLS policies call private.is_admin()
* Environment: public values (Supabase URL + publishable key, site URL) are in the committed .env; never put secrets there. Use .env.local for local overrides and secrets. On Cloudflare, NEXT_PUBLIC_* are inlined at build time; secrets are Worker secrets. Cache Components are off (they hang on Workers).
* Caching (ISR, open-next.config.ts): shop pages and storefront Supabase reads (lib/supabase/public.ts) are cached in Workers KV for 10 minutes; tag cache in KV, background refresh via a Durable Object queue. Admin saves call revalidatePath("/", "layout") to clear it at once (KV may take up to a minute in other regions). CSV imports and direct SQL edits show within 10 minutes. Search, cart lines and checkout always read live data. Anything time-dependent on a shop page (like reply hours) must be worked out in the browser.
Folder layout

* app/(shop)/ storefront routes; app/admin/ admin routes (protected); app/o/[token] order page; app/pos/ Stock and sales (login at /pos/login, pages under app/pos/(app)/, receipt, print and export routes)
* components/ui, components/shop, components/admin, components/pos
* lib/ supabase clients, cloudinary loader, money, phone, whatsapp message builder, zod schemas; lib/pos/ pure POS logic with tests (basket, receipt, periods, records, import, spreadsheet reader, xlsx writer, schemas)
* lib/server/ server-only code; lib/server/pos/ POS queries, role guard (requirePosUser / requireOwner) and refreshPosAndShop()
* supabase/migrations/ SQL migrations; supabase/seed/ seed data; scripts/ CSV import etc.

Domain rules (do not break; ask before changing)

1. Money is integer pesewas everywhere (GHS 450.00 = 45000). Format only for display: "GH₵ 450", "GH₵ 1,250.50". Never use floats for money.
2. The database is the source of truth for prices. The checkout server action recalculates every line from the database and ignores prices sent by the browser.
3. Shelf stock lives in the Stock & POS app (/pos): per variant, the sum of stock_movements (sales, purchases, returns, counts), never edited directly and never below zero. Each variant also has in_stock (boolean) and stock_qty, which the website reads. While settings.website_stock_sync is off, the owner sets them by hand in /admin; while it is on, a database trigger copies them from the shelf count (in_stock = on hand > 0) and hand edits are overridden. Website orders never change stock; "Mark as paid" on the order's sale in /pos does. Out-of-stock variants cannot be added to the cart or ordered.
4. No delivery fees, zones or options anywhere (the customer's free-text location is the only delivery-related field; the owner agrees delivery in WhatsApp). No payment gateway. Order total = items total.
5. Checkout collects only: customer name, phone, location (required free text: area and a landmark, or "Pickup"), optional note. Phone must be Ghanaian: accept 0XXXXXXXXX, +233XXXXXXXXX or 233XXXXXXXXX; store as 233XXXXXXXXX.
6. WhatsApp hand-off: save the order first, then open https://wa.me/<settings.whatsapp_number>?text=<encodeURIComponent(message)>. Number format 233XXXXXXXXX (no +, no leading 0). Always show a fallback with the number and a "Copy order" button for desktop users.
7. Order codes TV-1001, TV-1002... from a Postgres sequence. The public order page uses a random unguessable token (not the code) and shows items and total only, never name, phone or location.
8. Order lines copy product name, option values and unit price at checkout.
9. Orders still awaiting_whatsapp after 48 hours become not_sent (pg_cron job).
10. Secrets (Supabase secret/service-role key, Cloudinary API secret) are server-only. Never import them into client components or prefix them with NEXT_PUBLIC_.
11. RLS on every table. Public may read active products, their images and variants, categories and settings. Public may NOT read orders. Orders are inserted only by the checkout server action. Admin access is checked by an is_admin() SQL function backed by the admins table.

WhatsApp message format

```
Hi Tlip Ventures, I'd like to place this order.
Order: TV-1042
1 x Blender 1.5L (Black) - GH₵ 450
2 x Foldable storage stool - GH₵ 240
Items total: GH₵ 690
Name: Ama Mensah | Phone: 024 123 4567
Location: Dansoman, near Sharp Curve
Note: Please call before delivery
Order link: https://<site>/o/<token>

```

Order statuses
awaiting_whatsapp -> confirmed -> paid -> dispatched -> delivered; also cancelled, not_sent. The owner changes status in admin. Every order is mirrored as a /pos sale with the same code (awaiting_whatsapp = Ordered, confirmed = Pending, cancelled/not_sent = Cancelled); "paid" is set only by Mark as paid in /pos, and a paid order is cancelled by voiding its sale there.
Data model

* categories(id, name, slug, parent_id, image_url, sort_order)
* products(id, name, slug, brand, description, price, compare_at_price, option1_name, option2_name, is_active, is_featured, search_vector, created_at, updated_at)
* product_categories(product_id, category_id)
* product_images(id, product_id, url, public_id, alt, sort_order)
* product_variants(id, product_id, option1_value, option2_value, sku, in_stock, stock_qty, price_override)
* orders(id, order_code, public_token, customer_name, phone, location, notes, items_total, status, created_at, updated_at)
* order_items(id, order_id, variant_id, product_name, option_values, unit_price, qty, line_total)
* settings(id = 1, store_name, whatsapp_number, shop_address, opening_hours, announcement, social_links jsonb, tagline, contact_email, response_promise, reply_open, reply_close, reply_days smallint[] 1=Mon..7=Sun; reply times are Ghana time)
* banners(id, image_url, public_id, alt, link_url, is_active, sort_order, created_at, updated_at): home page carousel, 1440 × 720 (2:1) Cloudinary artwork, managed at /admin/banners; the home page shows the first 5 active ones, or, when none, a green "Quality home and kitchen goods in Ghana" panel showing up to 3 products ticked "Featured on the home page" (1 on phones; the logo if none). A "Join our team" slide (WhatsApp "I'd like to join your team" message) always follows; slides play slowly with controls under the banner. link_url is a site path ("/deals") or https:// address. Public reads active banners only.
* Wishlist and recently viewed (last 12) are product ids in the browser's localStorage only (tlip-wishlist, tlip-recent); no customer accounts. Cards for them come from /api/products?ids=.
* admins(user_id, role, display_name, is_active, can_give_discounts, can_adjust_stock): role 'owner' (one; /admin and everything in /pos) or 'staff' (/pos only). A product with no options has exactly one variant with null option values.
* Stock and sales (/pos), all money in pesewas:
   * product_variants also has barcode and reorder_level (alert level); variant_costs(variant_id, cost_price) owner only
   * stock_movements (append-only ledger: opening, sale, sale_void, purchase, purchase_void, return, adjustment, count) and stock_levels (on_hand cache, written only by the movement trigger); stock_counts, stock_count_lines; view pos_stock_rows
   * customers (phone unique 233…); sales (code SL_1001… from sale_code_seq, or the order's TV- code for website orders; source shop|website|import; status ordered|pending|completed|cancelled|voided), sale_items, sale_item_costs (owner only), payments (cash/momo/bank; pay later = no payment yet)
   * suppliers, purchases (PR_…), purchase_items, purchase_payments; returns (RT_…), return_items (back_on_shelf), refund_payments
   * views pos_sales_list, pos_purchases_list, pos_returns_list give paid and owed; settings.receipt_footer and settings.website_stock_sync

Catalogue

* Kitchen Appliances: Blenders, Juicers, Food Processors, Fufu & Swallow Makers, Stand & Hand Mixers, Kettles, Dispensers, Food Dehydrators, Ice Makers, Snack & Dessert Makers
* Cooking & Baking: Rice & Multi Cookers, Ovens, Gas Burners, Coal Pots
* Kitchen Storage & Utensils: Utensils, Food Racks, Storage Organizers & Racks
* Home Organization: Storage Organizers & Racks, Foldable & Storage Stools, Packing Cubes, Mats & Rugs, Home Essentials
* Laundry & Cleaning: Washing Machines, Laundry Baskets & Drying Racks, Irons & Garment Steamers, Cleaning Items & Tools
* Bathroom: Bathroom Accessories
* Kids & Baby: Baby Feeding A product can sit in several subcategories. Expect thousands of products: paginate (24 per page) and index slugs, category joins and the search vector.

Brand and design

* Name: Tlip Ventures. Logo tagline: Judges 6:24.
* Tailwind theme colours:
   * brand-orange #E8641E: block band, search button, Deals bar, count badges; only dark (ink) text or icons on it, never white
   * brand-orange-dark #B84A14: "Order on WhatsApp" and other WhatsApp buttons (white text on it), sale text and discount badges, orange text on white
   * brand-orange-deep #963B0F: hover state of brand-orange-dark buttons
   * brand-green #0F6B43: header, primary buttons (Add to cart), links, menus
   * brand-green-dark #0C3B29: footer, dark panels, link hover
   * brand-gold #F2B705: small accents, on dark green only
   * ink #111111: body text, logo badge background; secondary text #4F4A43 / #6B665E
   * page #F3F1ED behind white panels and product cards (marketplace look); image wells #F6F5F2; tints #E7F0EB (green) and #FDEEE3 (orange); discount badge #FDE9DC with brand-orange-dark text
* White text goes on brand-orange-dark, never on brand-orange (white on #E8641E is only 3.3:1; ink on it is 5.6:1). Meet WCAG AA contrast everywhere.
* Fonts via next/font: Instrument Sans (400–700) for all UI text and headings; Instrument Serif (with italic) only for the wordmark, banner headlines and the "No card, no account. Just WhatsApp." panel. Neither has the cedi sign, so app/fonts/cedi-sign.woff2 (Inter's ₵ only) comes first in the font stack.
* Design reference: the marketplace redesign (desktop, phone and pop-up category menu), modelled on Jumia Ghana but cleaner. Radius 12px panels, 8–10px cards and buttons, pills for chips and counts.
* The orange/green block band (from the shopfront) sits under the header and above the footer; keep it.
* Logo: round badge. Original in docs/brand/logo-source.jpg, cut-out in docs/brand/logo-cutout.png; site files public/brand/logo.webp (header), logo.png, icon-192/512.png, app/icon.png, app/apple-icon.png. Share image: public/brand/share.png.
* Mobile-first, designed at 360px wide first. Most customers are on phones and mobile data: keep client JS small, lazy-load images, no heavy libraries. The only carousel is the hand-built home page banner (no carousel library).

Conventions

* Validate every form and server action input with Zod.
* Accessible: labelled inputs, alt text, visible focus, 44px tap targets.
* Unit tests for lib/money, lib/phone and lib/whatsapp.
* Before calling a task done: typecheck, lint, tests and build all pass.
* Explain any new dependency before adding it.
* Commit only when asked, with the message "Phase N: <summary>" ("POS phase N: <summary>" for Stock and sales work).

Stock and sales (/pos)

* Design spec: design/pos/ (four screens and tokens.json); colours are the pos-* tokens in app/globals.css, Gloock for titles and big money. Money shows as "GH₵ 1,250.50". No developer credit in the UI.
* Roles: staff sell, take payments, record returns and see stock; the owner also sees costs, profit, purchases, suppliers, reports, import and settings, and switches staff "Can give discounts" and "Can count and adjust stock". Checked in the UI, in server actions and in the database (private.is_owner(), is_member(), can_give_discounts(), can_adjust_stock()).
* Every write goes through a SECURITY DEFINER pos_* function that checks the role; reads run as the user under RLS. Error code TV001 = would take the shelf below zero; TV002 = a website order status that must change in /pos. friendlyDbError passes their messages through.
* Stock never goes below zero (except an imported 'opening' figure, shown as Recount until counted). A sale locks the shelf rows and is refused if short.
* Website orders: mirrored as sales by a trigger at checkout (never failing the checkout); Mark as paid takes stock off the shelf and sets the order to paid.
* Every POS change that can affect the shop (stock, prices, "On the website", the stock sync) calls refreshPosAndShop() so cached shop pages update at once.
* Downloads: Excel via lib/pos/xlsx.ts (no library), PDF via the print pages (/pos/print/[list], "Save as PDF"). Import (/pos/import, owner): .xlsx/CSV read in the browser (lib/pos/spreadsheet.ts), checked (lib/pos/import.ts), dry-run then applied by pos_import_* functions; importing twice skips what is in.
* Migrations: try new SQL first with execute_sql inside one transaction that ends in an exception (rolled back), with checks; sequences don't roll back, so save and restore them with setval in the test. Avoid the words drop/delete/truncate in execute_sql (the connector asks to confirm). Then apply_migration and name the file after the recorded version.

Build phases
0 Setup · 1 Database · 2 Storefront · 3 Cart + WhatsApp checkout · 4 Admin · 5 SEO + polish · 6 Content + testing · 7 Launch. Work one phase per session. Do not start work from a later phase unless asked.
