# Testing checklist before launch

Automated tests cover the money, phone, WhatsApp-message, cart, import and
form rules (`npm test`). This list is for what only real phones, real
WhatsApp and the live database can show. Do it on the deployed site
(`NEXT_PUBLIC_SITE_URL`), with the real WhatsApp number set in Admin → Settings.

Use at least: an everyday Android phone (Chrome), an iPhone (Safari), and a
computer (Chrome or Edge). On one phone, switch off Wi-Fi and use mobile data.

Tick each box, and note the phone and what went wrong for anything that fails.

## 1. Browsing (each phone)

- [ ] Home page loads quickly on mobile data; the gold bar shows at the top while pages load.
- [ ] Home page, in order: category circles (swipe on phones), the green banner, "Shop by price" chips, Deals of the week, New arrivals (the 12 newest have a "New" badge), Featured, Kitchen Appliances and Cooking & Baking rows, and the "No card, no account. Just WhatsApp." panel. On computers wider than 1280px the category list and the "Order in 3 steps" / "Chat with the shop" tiles sit beside the banner.
- [ ] Each "Shop by price" chip lists only products in that range, and the price links on the list change or clear it ("Any price").
- [ ] The heart on a product (card or product page) saves it; the Wishlist page (bottom bar on phones, header on computers, menu) lists saved products with Add to cart, and tapping the heart again removes it. The wishlist is still there after closing the browser.
- [ ] After opening a few products, the home page shows them under "Recently viewed", newest first; "Clear" removes them.
- [ ] Admin: Banners can be added (upload a 1440 × 720 image, description, optional link), switched off and on, moved earlier and later, edited and deleted. The home page shows the switched-on ones, sliding slowly with arrows and dots on computers and swiping on phones; with none switched on it shows the green panel, with up to 3 of the products ticked "Featured on the home page" on its right (1 on phones); tapping one opens it. A "Join our team" slide follows, and its button opens WhatsApp with "Hi Tlip Ventures, I'd like to join your team".
- [ ] Menu (header) and Categories (bottom bar on phones) open the category menu from the left; each category opens to show its sub-categories; the menu closes on the X, on tapping the dimmed page, on Esc and after choosing a category.
- [ ] On phones the bottom bar (Home, Categories, Cart, WhatsApp) never covers the footer or the "Added to your cart" popup.
- [ ] A category shows its products and subcategories; Next/Previous pages work; sort links work.
- [ ] Search finds a product from part of its name (e.g. “blend” finds the blender).
- [ ] A product page shows photos, price, “was” price and discount badge (e.g. −16%) where set, options, and a Qty box (− and +, or type a number up to 99) that adds that many to the cart; the button shows the total when more than 1.
- [ ] Product cards: the green + (phones) or “Add to cart” (computers, on hover) adds a one-option product and shows “Added to your cart”; a product with options goes to its page; out-of-stock products say so and have no button; products without photos show “Photo coming soon”.
- [ ] An out-of-stock option is crossed out and can’t be chosen; a sold-out product can’t be added.
- [ ] A wrong address (e.g. /products/xyz) shows “Page not found”.

## 2. Cart and order (each phone)

- [ ] Add two different products, one with an option. Each time, an “Added to your cart” popup appears at the bottom of
      the screen without scrolling, and the cart badge counts them.
- [ ] Close the browser completely, open the site again: the cart is still there.
- [ ] Change a quantity and remove an item; the total updates.
- [ ] Try to order with an empty name, an empty location and phone “12345”: clear messages, no order saved.
- [ ] Order with phone in each form: `024 123 4567`, `+233 24 123 4567`, `233241234567`.
- [ ] **WhatsApp opens by itself** with the order message ready, addressed to the shop’s number.
- [ ] The message lists every item with option and price, the total, your name, phone, location, note and an order link.
- [ ] Send it. In the shop’s WhatsApp, tap the order link: it shows the items and total, **not** your name, phone or location.
- [ ] Go back to the browser: the “Now send it on WhatsApp” page is still there; the cart is empty.
- [ ] On the computer: WhatsApp does **not** open by itself; “Order on WhatsApp” opens WhatsApp Web;
      “Copy order” copies the message, and it pastes correctly.
- [ ] If the shop uses **WhatsApp Business**, confirm orders arrive there.

## 3. Admin (on the owner’s phone and on a computer)

- [ ] Sign in at /admin with the owner account. A wrong password is refused.
- [ ] The test orders from section 2 show as “Awaiting WhatsApp”, with name, phone, note and items.
- [ ] “WhatsApp customer” and “Call” open the right number.
- [ ] Move an order through Confirmed → Paid → Dispatched → Delivered; set another to Cancelled.
- [ ] On the products list, tap an option to mark it out of stock; the shop shows it out of stock.
      Tap again to put it back.
- [ ] Edit a product’s price; the shop shows the new price. Hide a product; it disappears from the shop.
- [ ] Add a product with two colours and **upload photos from the phone camera**; check them in the shop.
- [ ] Change the announcement in Settings; it shows at the top of the shop.
- [ ] Sign out; /admin asks you to sign in again.

## 4. Things that take time

- [ ] Leave one test order unsent on WhatsApp. After 48 hours it shows as “Not sent”
      (the database job runs every 15 minutes; check Supabase → Integrations → Cron if it doesn’t).
- [ ] Place 4 orders within one minute from the same phone: the 4th is refused with
      “Too many orders in a short time”.

## 5. Sharing and search

- [ ] Send a product link in a WhatsApp chat: the preview shows the product name and photo.
      Send the home page link: the preview shows the Tlip Ventures image.
- [ ] Add the site to the phone’s home screen: the Tlip Ventures icon appears.
- [ ] Google Search Console: add the site and submit `https://<site>/sitemap.xml`.
- [ ] Google’s Rich Results Test on a product page finds a Product with price in GHS.

## 6. Accessibility (quick pass)

- [ ] Android TalkBack or iPhone VoiceOver: buttons and fields are read with sensible names;
      you can add to cart and fill in the order form.
- [ ] On the computer, use only the Tab and Enter keys to reach and order a product; the focus ring is always visible.
- [ ] Phone text size set to large: pages still fit without sideways scrolling.

## 7. Content check (owner)

- [ ] Real logo in place of the placeholder (then remake the icons and share image).
- [ ] Real WhatsApp number, address, opening hours and social links in Settings.
- [ ] Bathroom and Kids & Baby subcategories added.
- [ ] Demo products removed (`supabase/seed/demo_products_remove.sql`) and real products loaded
      (Admin → Products, or `scripts/README.md` for a spreadsheet import).
- [ ] “How to order”, “About and contact” and “Privacy” pages read and corrected by the owner.
- [ ] Test orders deleted or cancelled after testing.
