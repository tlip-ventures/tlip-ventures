# Stock & POS design (the spec)

The four screens of the stock and point-of-sale app at `/pos`, copied from the
design canvas "Tlip Ventures Stock & POS". Their markup, spacing, copy and
colours are the spec; build to them.

| File | Screen | Route |
|---|---|---|
| `dashboard.html` | Dashboard | `/pos` |
| `point-of-sale.html` | Point of sale | `/pos/sell` |
| `sales-purchases-returns.html` | Sales, purchases and returns (tabs) | `/pos/sales`, `/pos/purchases`, `/pos/returns` |
| `products-and-stock.html` | Products and stock | `/pos/products` |
| `tokens.json` | Colours, type, spacing (the Tlip Ventures design system) | |

The files are Design Component pages: the markup between `<x-dc>` tags is the
layout, and the `renderVals()` script at the bottom holds the sample figures and
the interaction logic (period switch, basket, filters). They don't open on their
own (they need the canvas runtime); read them as source.

Where the screens and `tokens.json` differ, the screens win: they use rounded
corners (6px buttons, 8px tiles, 10px cards) where the tokens describe a square
system.
