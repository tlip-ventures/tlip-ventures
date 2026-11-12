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
* Seed data: supabase/seed/categories.sql, settings.sql, demo_products.sql, delivery_areas.sql (all safe to re-run); demo_products_remove.sql deletes the demo products; make_admin.sql gives an existing Supabase Auth user access to /admin (create the user first in the dashboard)
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
3. Stock lives in the Stock & POS app (/pos): one stock entry per product (its one entry in use, a product_variants row) with a count in each place (the Shop, where everything is sold from, and the Warehouse; locations), each the sum of that place's stock_movements (sales, purchases, returns, counts, transfers), never edited directly and never below zero. Colours and designs are only choices the customer or cashier picks (products.option1_name + products.choices); the choice is copied onto the order, sale or invoice line (option_values) but never counted separately. The entry also has in_stock (boolean) and stock_qty, which the website reads. While settings.website_stock_sync is off, the owner sets them by hand in /admin; while it is on (it is, since POS phase 9), a database trigger copies them from the count of every place together (in_stock = shop + warehouse > 0) and hand edits are overridden. Website orders never change stock; "Mark as paid" on the order's sale in /pos does. Out-of-stock products cannot be added to the cart or ordered.
4. No delivery fees, zones or options on the website (the customer's free-text location is the only delivery-related field; the owner agrees delivery in WhatsApp). No payment gateway. Order total = items total. Delivery fees exist only in Stock and sales (/pos): a till sale can be a delivery, and a website order can get its agreed fee when marked paid; the order itself keeps its items total.
5. Checkout collects only: customer name, phone, location (required free text: area and a landmark, or "Pickup"), optional note. Phone must be Ghanaian: accept 0XXXXXXXXX, +233XXXXXXXXX or 233XXXXXXXXX; store as 233XXXXXXXXX.
6. WhatsApp hand-off: save the order first, then open https://wa.me/<settings.whatsapp_number>?text=<encodeURIComponent(message)>. Number format 233XXXXXXXXX (no +, no leading 0). Always show a fallback with the number and a "Copy order" button for desktop users.
7. Order codes TV-1001, TV-1002... from a Postgres sequence. The public order page uses a random unguessable token (not the code) and shows items and total only, never name, phone or location.
8. Order lines copy product name, the colour picked (option_values, checked against products.choices) and unit price at checkout.
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
awaiting_whatsapp -> confirmed -> paid -> dispatched -> delivered; also cancelled, not_sent. The owner changes status in admin. Every order is mirrored as a /pos sale with the same code (awaiting_whatsapp = Ordered, confirmed = Pending, cancelled/not_sent = Cancelled); "paid" is set only by Mark as paid in /pos, and a paid order is cancelled by voiding its sale there. A part payment in Mark as paid puts the sale On hold (items off the shelf, order confirmed); its last payment sets the order paid, and until then /admin can't set it paid or cancelled.
Data model

* categories(id, name, slug, parent_id, image_url, sort_order)
* products(id, name, slug, brand, description, price, compare_at_price, option1_name (choice heading, e.g. Colour; null when nothing to pick), choices text[] (e.g. {Black,Pink}; not stocked separately), option2_name (unused, always null), is_active, is_featured, search_vector, created_at, updated_at)
* product_redirects(old_slug, product_id): web addresses of merged duplicate products; /products/<old_slug> redirects to the kept product. private.merge_products(keep_slug, dup_slug) merges a duplicate (its shelf to zero, history and photo/category/description moved across, old address redirected)
* product_categories(product_id, category_id)
* product_images(id, product_id, url, public_id, alt, sort_order)
* product_variants(id, product_id, option1_value, option2_value, sku, in_stock, stock_qty, price_override, retired): exactly one entry per product is in use (retired = false, null option values; unique index product_variants_one_in_use). Retired entries (former per-colour entries, merged duplicates) keep their stock history only: no stock, never sold, hidden everywhere except a product's /pos stock history
* orders(id, order_code, public_token, customer_name, phone, location, notes, items_total, status, created_at, updated_at)
* order_items(id, order_id, variant_id, product_name, option_values, unit_price, qty, line_total)
* settings(id = 1, store_name, whatsapp_number, shop_address, opening_hours, announcement, social_links jsonb, tagline, contact_email, response_promise, reply_open, reply_close, reply_days smallint[] 1=Mon..7=Sun; reply times are Ghana time; delivery_* pricing and shop_lat/shop_lng, see Delivery prices under Stock and sales)
* banners(id, image_url, public_id, alt, link_url, is_active, sort_order, created_at, updated_at): home page carousel, 1440 × 720 (2:1) Cloudinary artwork, managed at /admin/banners; the home page shows the first 5 active ones, or, when none, a green "Quality home and kitchen goods in Ghana" panel showing up to 3 products ticked "Featured on the home page" (1 on phones; the logo if none). A "Join our team" slide (WhatsApp "I'd like to join your team" message) always follows; slides play slowly with controls under the banner. link_url is a site path ("/deals") or https:// address. Public reads active banners only.
* Wishlist and recently viewed (last 12) are product ids in the browser's localStorage only (tlip-wishlist, tlip-recent); no customer accounts. Cards for them come from /api/products?ids=.
* admins(user_id, role, display_name, is_active, can_give_discounts, can_adjust_stock): role 'owner' (one; /admin and everything in /pos) or 'staff' (/pos only). Every product has exactly one stock entry in use.
* Stock and sales (/pos), all money in pesewas:
   * product_variants also has barcode and reorder_level (alert level); variant_costs(variant_id, cost_price) owner only
   * stock_movements (append-only ledger: opening, sale, sale_void, purchase, purchase_void, return, adjustment, count, transfer; location_id = the place) and stock_levels (the shop's on_hand cache) and stock_place_levels (each place's on_hand), both written only by the movement trigger; stock_counts, stock_count_lines; view pos_stock_rows (on_hand = shop, warehouse_on_hand, total_on_hand)
   * locations(id smallint, name, sells, sort_order): 1 Shop (sells = true, exactly one) and 2 Warehouse; more places can be added later
   * customers (phone unique 233…); sales (code SL_1001… from sale_code_seq, or the order's TV- code for website orders; source shop|website|import; status ordered|pending|on_hold|reserved|completed|cancelled|voided; on_hold = part paid, items off the shelf, completed by its last payment; reserved = kept for the customer, not paid in full, items still on the shelf; sales.reserved, reserved_until, collected_at, collected_by), sale_items (kind item|delivery: a delivery fee is a "Delivery" line), sale_item_costs (owner only), payments (cash/momo/bank, delivery_amount = the part for the delivery fee; pay later = no payment yet)
   * deliveries(sale_id, address, contact_name, contact_phone, note, status to_deliver|out|delivered, rider, out_at, delivered_at); view pos_deliveries_list
   * invoices (INV_1001… from invoice_code_seq; status open|sold|cancelled; customer, discount, delivery fee and address, valid_until, sale_id once sold), invoice_items (prices copied from the catalogue); view pos_invoices_list. An invoice takes nothing off the shelf; "Sell this invoice" loads it into the till at today's prices (warning what changed) and pos_invoice_sold links the sale
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
* Website orders: mirrored as sales by a trigger at checkout (never failing the checkout); Mark as paid takes stock off the shelf and records what was paid each way (MoMo, Cash, Bank boxes, any mix; pos_take_order_payment). Paid in full: the order is paid. Less: the sale is On hold and the order confirmed.
* On hold (sales.status on_hold): a sale part paid (or not paid yet) whose items are already off the shelf, for a customer. At the till "Put on hold (part paid)" (pos_hold_sale: like pos_complete_sale, with what is paid now in any mix, refused when that pays it all; needs a customer). Mark paid (pos_record_payment) takes the rest in as many payments as needed; the payment that leaves nothing owed completes the sale (completed_at set) and pays its website order. The owner cancels a hold like a sale (pos_void_sale: items back). Held sales count in money owed but not in sales figures, profit or reports until completed; deliveries and invoices work on them.
* Delivery prices (motorbike; till and invoices now, website checkout later): the fee depends only on the road km from the shop, in lib/delivery.ts (deliveryFeeForKm, shared so till and website agree): settings.delivery_base_fee for the first delivery_base_km, + delivery_mid_rate per km up to delivery_mid_end_km, + delivery_far_rate per km after, rounded up to delivery_round_to; up to delivery_close_km a flat delivery_close_fee; beyond delivery_max_km no price (agree on WhatsApp). Approved 11 Nov 2026: GH₵ 20 for the first 2 km, GH₵ 4/km to 7 km, GH₵ 1.50/km after, round up to GH₵ 5, GH₵ 20 within 1 km, 65 km max (Lapaz and Tabora 40, Airport 50); no profit (the whole fee goes to the rider). An area can have its own set price (delivery_areas.fixed_fee, pesewas; null = the formula; areaFee). Delivery discounts by order size: settings.delivery_discounts [{from, off}] (pesewas, at most 5; off null = free delivery); the highest level the items after discount reach is taken off the fee (deliveryDiscountOff); delivery_free_from/delivery_free_off are superseded and no longer read. delivery_areas(id, name unique ignoring case, km numeric(5,1), lat, lng, is_active, fixed_fee): the price list's areas with road km from the shop (settings.shop_lat/shop_lng = Dansoman Sharp Curve); public reads areas in use, shop users all; pos_add_delivery_area (any shop user, used when a place found on the map is kept) and pos_update_delivery_area (owner; the five-argument version sets fixed_fee). At the till the cashier picks the area (or searches the map, or pastes the customer's Google Maps link) and the fee fills itself in (delivery draft area + auto); typing a fee overrides it. Map search (lib/server/delivery-distance.ts): OpenStreetMap Nominatim to find places, the OSRM route server for road km, straight line × 1.35 when routing fails; free, no key, light use only; swap for Google there if needed. Owner edits the formula, shop position and areas at /pos/settings/delivery. Areas keep their km when the shop moves.
* Deliveries: at the till "Collect in shop" or "Delivery" (address, phone for the rider, fee typed by the cashier; the discount never applies to the fee). The fee is a sale line of kind 'delivery', so totals and money owed include it, while sales figures, profit and best sellers count items only and show delivery fees apart. /pos/deliveries follows each one (to deliver, out with a rider, delivered); pay on delivery is Pay later, settled with Mark paid. A delivery fee can't be returned (cancel the sale). The Sales list has "Deliveries by rider" for its period (pos_rider_summary; rider names match ignoring case) and a rider filter (?rider=, also in the downloads); Send out suggests riders used before. Each sale on the list shows where it was delivered (pos_sales_list.delivery_address, or "In the shop") and how it was paid (payment_methods, under the Payment pill); the Excel has Deliver to and Paid by columns. Every sale payment records its part for delivery (payments.delivery_amount; items paid = amount - delivery_amount): full payments at the till and Mark as paid split themselves (a before-insert trigger, items first), and Mark paid on a delivery sale asks "Of this, for delivery", checked against what is owed for each. The list, cards, sale page and Excel show paid and owed for items and for delivery apart. A delivery fee can be "Already in the price" (till, invoice, Mark as paid): the total stays as agreed and the fee is part of it (sales.delivery_included / invoices.delivery_included; item sales = total - fee as always). Sales keep subtotal = items so total = subtotal - discount; invoices store subtotal = items - fee so their check still holds.
* Split payments at the till: under Mobile Money, a MoMo amount below the total splits the sale; the rest is paid by Cash (with change on the cash part), Bank transfer, or Pay later (owed; needs a customer). pos_complete_sale(..., p_delivery, p_payments, p_cash_received, p_note) with method 'split' saves one payment per way with the sale; the seven-argument version hands over to it.
* Wholesale: each product can have a wholesale price (product_wholesale_prices; shop users read it, the owner sets it with pos_set_wholesale_price on /pos/wholesale; never on the website). At the till a Retail / Wholesale switch (owner and staff with Can give discounts, checked in the database too): items with a wholesale price use it, others their normal price. pos_complete_sale(..., p_payments, p_wholesale, ...) and pos_create_invoice(..., p_valid_until, p_wholesale, p_note) (earlier signatures hand over at retail); sales.wholesale / invoices.wholesale; sale_items.list_price keeps the retail price of lines sold below it, for "Given off at wholesale prices" in Reports. The Sales list tags Wholesale and filters All / Retail / Wholesale (?type=, cards via pos_sales_totals, also in the downloads).
* Reserved orders (/pos/reserved, all shop users): at the till "Reserve for later (pick up or deliver)" keeps an order for a customer (needed), with any amount paid now and an optional agreed date (pos_reserve_sale). Paid in full: a completed sale whose items come off the shelf at once (put aside). Not paid in full: sale status 'reserved', items stay on the shelf (the sale lines skip the stock while it is made: apply_stock_movement ignores 'sale' rows while tv.keep_on_shelf is on); the shop must have them at the time. The last payment (pos_record_payment) takes them off and completes it; Collected (pos_mark_collected) or sending it out (pos_update_delivery 'out'/'delivered') also takes them off, and with money still owed the sale goes On hold. Cancelling a reserved sale puts nothing back (pos_void_sale). It is open until collected or delivered (collected_at); pos_set_reserved_until changes the date. Reserved sales count in money owed, not in sales figures until completed. The Reserved list shows each with its due date (late / today), items, paid and owed; the sidebar counts the open ones.
* Warehouse (places): every sale (till, wholesale, website orders, holds) comes off the Shop; returns and voids work on the Shop too. Supplier deliveries arrive at the Warehouse by default ("Arrives at" on the purchase; purchases.location_id). Stock goes from one place to another with Move stock (pos_move_stock: two 'transfer' movements; owner and staff with Can count and adjust stock); the product page also recounts and adjusts each place (pos_recount_at, pos_adjust_stock_at; the older pos_recount / pos_adjust_stock are the Shop's). The website shows shop + warehouse; Reports and the stock value count every place. The Warehouse section (/pos/warehouse, sidebar under Stock) lists what is in the warehouse (filters: In the warehouse, Shop running low, All), with Bring to shop and Recount per product, cards for products, units and value at cost (owner), and the latest warehouse movements. The till shows "N in the warehouse" on tiles; the stock list has a Warehouse column and "Bring to shop" when the shop is low and the warehouse has some. Stock counts work per place (stock_counts.location_id; /pos/count?place=, a Shop / Warehouse switch; "Count the warehouse" on the Warehouse section): lines compare with that place's count and finishing corrects that place; one count is open at a time, of either place (pos_start_count(p_note, p_location); the one-argument version counts the shop). Cartons: each product can have a carton size (product_variants.units_per_carton, set by anyone who may count stock with pos_set_carton_size, on the product page or in a count); stock stays in single items and screens show it as "3 cartons + 5" (cartonsText); a count line is typed as Cartons + Singles (pos_save_count_line(p_count_id, p_variant_id, p_cartons, p_singles) works out the total and keeps stock_count_lines.cartons / singles). Not yet per place: product import and merging duplicates (Shop only).
* Every POS change that can affect the shop (stock, prices, "On the website", the stock sync) calls refreshPosAndShop() so cached shop pages update at once.
* Invoices (/pos/invoices, all shop users): "Make invoice instead" at the till saves the basket as an A4 invoice (/pos/invoice/[id]: Print / Save as PDF, WhatsApp, Sell this invoice, Cancel). Prices held 7 days by default.
* Reports (/pos/reports, owner): pos_report_overview(from, to) gives everything for a period (sales, delivery, discounts, profit, money in by method, refunds, paid to suppliers, purchases, returns, invoices, deliveries, staff) and where things stand now (owed both ways, stock value, open invoices).
* Downloads: Excel via lib/pos/xlsx.ts (no library), PDF via the print pages (/pos/print/[list], "Save as PDF"). Import (/pos/import, owner): .xlsx/CSV read in the browser (lib/pos/spreadsheet.ts), checked (lib/pos/import.ts), dry-run then applied by pos_import_* functions; importing twice skips what is in.
* Migrations: try new SQL first with execute_sql inside one transaction that ends in an exception (rolled back), with checks; sequences don't roll back, so save and restore them with setval in the test. Avoid the words drop/delete/truncate in execute_sql (the connector asks to confirm). Then apply_migration and name the file after the recorded version.

Build phases
0 Setup · 1 Database · 2 Storefront · 3 Cart + WhatsApp checkout · 4 Admin · 5 SEO + polish · 6 Content + testing · 7 Launch. Work one phase per session. Do not start work from a later phase unless asked.
