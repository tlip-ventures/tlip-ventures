# Stock and sales: going live

Stock and sales lives at **/pos** on the shop's own address (for example
https://tlipventures.com/pos). It deploys with the website: every push to
`main` deploys both. Nothing here needs a new secret or setting on Cloudflare.

Do the steps in order. Steps 1 to 4 can be done any day; the website keeps
working as before until step 5.

## 1. Sign in (owner)

- Open `/pos` and sign in with the same email and password as the website admin.
- The menu shows everything: Sell, Stock, Buy, People, Import data and Settings.

## 2. People and receipts (owner, Settings)

- **Add a staff member** for each person at the till: name, email and a
  password you give them. They sign in at the same `/pos` address.
- For each person, switch on **Can give discounts** and **Can count and adjust
  stock** only if they should.
- **Receipts:** the line at the bottom of every receipt (returns rule, MoMo
  number). The shop name, address and WhatsApp number come from the website
  settings (`/admin/settings`).

## 3. Bring in the old system's data (owner, Import data)

Export from ChosenPOS as Excel (.xlsx) or CSV. Old .xls files: open in Excel and
Save As .xlsx first. Import in this order:

1. **Products and stock.** Leave "Set the shelf count" ticked. Check the file,
   read the Problems, fix them in the file, check again, then Import.
   New products come in hidden from the website.
2. **Customers**, then **Suppliers**.
3. **Past sales**, then **Past purchases.** They show in Sales, Purchases, the
   dashboard and Reports, and what is still owed shows on the dashboard. They
   don't change the shelf count.

Importing a file again is safe: what is already in is skipped.

## 4. Count what needs it

- Products and stock: **Need a recount** lists items that came in below zero.
  Press Recount on each, or start a **Stock count** for a whole shelf.
- Spot-check five products: does the shelf count match what is really there?

## 5. Switch on website stock (owner, Settings)

- **Website stock from this app → Switch on.** From now on a product shows
  "in stock" on the website while at least one is on the shelf, and every sale,
  delivery, return and count updates it straight away.
- The "In stock" tick boxes in the website admin become read-only.
- To undo: Switch off. Products stay as they are and you set them by hand again.

## 6. Check on a phone and a laptop

On the shop's phone and the owner's laptop:

- [ ] Sell one item for cash with change, one by Mobile Money and one on Pay
      later to a customer. The shelf count goes down each time.
- [ ] Print a receipt (or Save as PDF) and send one on WhatsApp.
- [ ] Mark the Pay later sale paid from the Sales list.
- [ ] Record a delivery from a supplier, part paid. "You owe suppliers" goes up.
- [ ] Return an item from a receipt, back on the shelf.
- [ ] Place an order on the website, then **Mark as paid** in Stock and sales:
      the order shows Paid in the website admin and the shelf count goes down.
- [ ] Download Sales as PDF and as Excel, and open both.
- [ ] Sign in as staff: no Profit, Purchases, Suppliers, Reports, Import or Settings.

## If something is wrong

- A wrong sale: open it and **Cancel sale** (owner). The items go back on the shelf.
- A wrong shelf count: **Recount** on the product, or a Stock count.
- Stock numbers are a ledger: nothing is ever deleted, every change is a new
  line with who and when (open a product to see its history).
