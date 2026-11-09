# Product import and export

Load or update many products at once from a spreadsheet (Excel, Google Sheets
or LibreOffice saved as **CSV UTF-8**). These scripts run on your computer
with the Supabase secret key, so put `SUPABASE_SERVICE_ROLE_KEY` (and, for
photo uploads, the Cloudinary keys) in `.env.local` first.

```sh
npm run products:export -- products.csv            # every product, in this format
npm run products:import -- products.csv            # check only: changes nothing
npm run products:import -- products.csv --apply    # import
```

### Without a computer: GitHub

The **Import products** job runs the same import on GitHub. Put the spreadsheet
and its photos in a folder under `imports/` (photo paths are relative to the
spreadsheet). When it reaches `main`, the job imports it by itself; nothing is
written unless the whole file checks out, and the job log lists any problems.
To run one by hand: GitHub → Actions → **Import products** → Run workflow, enter
the spreadsheet's path, and leave **Make the changes** unticked for a check only. It needs three repository secrets (Settings →
Secrets and variables → Actions): `SUPABASE_SERVICE_ROLE_KEY`,
`CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.

The check reads the whole file and lists every problem with its line number;
nothing is written until the file has no problems. Starting from an export is
the easiest way to edit many products. `templates/products-template.csv` shows
every kind of product; its slugs, Cloudinary URL and photo paths are examples
to replace with your own.

## Rows and columns

One row per product. Stock is one number per product: colours (or designs)
are only choices the customer picks, listed in one cell. (Older files with one
row per colour still import: their colours are collected into `choices`.)

| Column | Meaning |
| --- | --- |
| `slug` | Web address name, e.g. `blender-1-5l`. Matches existing products: same slug = update. Empty = made from the name. |
| `name` | Product name (required). |
| `brand`, `description` | Optional. Descriptions can have line breaks inside quotes. |
| `price` | In cedis: `450` or `1250.50` (required). |
| `compare_at_price` | Optional “was” price, higher than `price`; shows a discount badge (e.g. −16%) and lists the product under Deals. |
| `categories` | Category slugs separated by `\|`, e.g. `blenders\|food-processors`. Empty = keep current. |
| `active` | `yes` (shown in the shop, default) or `no` (hidden). |
| `featured` | `yes` to show on the home page; default `no`. |
| `choice_name` | What the customer picks, e.g. `Colour` or `Design`. Empty = nothing to pick. |
| `choices` | The choices separated by `\|`, e.g. `Black\|Red\|Grey`. Needed when `choice_name` is filled in. |
| `sku` | Optional stock code, unique across the shop. |
| `in_stock` | `yes` (default) or `no`. Ignored while the website stock comes from Stock and sales (the shelf count decides). |
| `stock_qty` | Optional count for your own reference. |
| `images` | Photo URLs or file paths separated by `\|`, first = main photo. Empty = keep current. |

Photos can be Cloudinary URLs (kept as they are), other web URLs, or file
paths relative to the CSV file (both uploaded to Cloudinary into
`tlip/products`). Uploads need `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.

A product that needs its own price (a bigger size, say) is a separate product
with its own row.
