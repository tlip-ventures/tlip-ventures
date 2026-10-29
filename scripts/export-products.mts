/**
 * Export every product (including hidden ones) to a CSV in the import format.
 *
 *   npm run products:export -- products.csv
 *
 * Edit the file in a spreadsheet and import it again with products:import.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { toCsv } from "@/lib/import/csv";
import { productsToRows, type ExportProduct } from "@/lib/import/products";
import { adminClient, readAll } from "./shared.mjs";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run products:export -- <file.csv>");
  process.exit(1);
}

const supabase = adminClient();
const rows = await readAll((from, to) =>
  supabase
    .from("products")
    .select(
      "slug, name, brand, description, price, compare_at_price, is_active, is_featured, option1_name, option2_name, product_variants(option1_value, option2_value, price_override, sku, in_stock, stock_qty), product_images(url, sort_order), product_categories(categories(slug))",
    )
    .order("name")
    .order("option1_value", { referencedTable: "product_variants" })
    .order("option2_value", { referencedTable: "product_variants" })
    .order("sort_order", { referencedTable: "product_images" })
    .range(from, to),
);

const products: ExportProduct[] = rows.map(({ product_variants, product_images, product_categories, ...p }) => ({
  ...p,
  variants: product_variants,
  imageUrls: product_images.map((img) => img.url),
  categorySlugs: product_categories.map((pc) => pc.categories?.slug).filter((s): s is string => Boolean(s)),
}));

const path = resolve(file);
writeFileSync(path, toCsv(productsToRows(products)));
const options = products.reduce((n, p) => n + p.variants.length, 0);
console.log(`Exported ${products.length} products (${options} options) to ${path}`);
