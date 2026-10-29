# Stock sheets (not imported)

Working spreadsheets kept for reference. They live here, outside `imports/`,
so merging them never starts the "Import products" workflow (which applies
every CSV added under `imports/` on main).

- `2026-10-26-all-products/products.csv`: the 106 products from the owner's
  notebook and the live shop, last refreshed on 27 October 2026. The live shop
  has changed since (later imports under `imports/`), so importing this file as
  it is could undo newer prices and descriptions. To use it, export the shop
  first (`npm run products:export`), compare, and import only the rows you
  still need.

Shelf stock now lives in Stock and sales (`/pos`); its Import data screen reads
the old system's exports.
