/**
 * Import products from a CSV file (format: scripts/README.md).
 *
 *   npm run products:import -- products.csv            check only, changes nothing
 *   npm run products:import -- products.csv --apply    import
 *
 * Every row is checked before anything is written; any error stops the import.
 * Products are matched by slug: new ones are added, existing ones updated.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { ProductForm } from "@/lib/admin-product";
import { cloudinarySignature } from "@/lib/cloudinary-sign";
import { cloudinaryPublicId } from "@/lib/cloudinary-url";
import { parseCsv } from "@/lib/import/csv";
import {
  groupProducts,
  readImportRows,
  validateImportProduct,
  type ExistingProduct,
  type ImportError,
  type ImportProduct,
} from "@/lib/import/products";
import { writeProduct } from "@/lib/product-writer";
import { adminClient, env, readAll } from "./shared.mjs";

const UPLOAD_FOLDER = "tlip/products";
// Stand-in URL so a photo that still has to be uploaded passes the check in a dry run.
const PENDING_UPLOAD = "https://res.cloudinary.com/pending/image/upload/pending";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run products:import -- <file.csv> [--apply]");
  process.exit(1);
}
const csvPath = resolve(file);
if (!existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

function fail(errors: ImportError[]): never {
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} in ${basename(csvPath)}. Nothing was imported.\n`);
  for (const e of [...errors].sort((a, b) => a.line - b.line)) console.error(`  line ${e.line}: ${e.message}`);
  process.exit(1);
}

const { rows, errors: headerErrors } = readImportRows(parseCsv(readFileSync(csvPath, "utf8")));
if (headerErrors.length) fail(headerErrors);
const { products, errors: rowErrors } = groupProducts(rows);
if (products.length === 0) fail([...rowErrors, { line: 1, message: "No products found." }]);

const supabase = adminClient();

const categories = await readAll<{ id: string; slug: string }>((from, to) =>
  supabase.from("categories").select("id, slug").range(from, to),
);
const categoryId = new Map(categories.map((c) => [c.slug, c.id]));

// Existing products with the same slugs, in chunks to keep URLs short.
const existing = new Map<string, ExistingProduct>();
const slugs = products.map((p) => p.slug);
for (let i = 0; i < slugs.length; i += 100) {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, product_variants(id, option1_value, option2_value), product_categories(category_id), product_images(url, public_id, alt, sort_order)")
    .in("slug", slugs.slice(i, i + 100))
    .order("sort_order", { referencedTable: "product_images" });
  if (error) throw new Error(`Could not read existing products: ${error.message}`);
  for (const p of data) {
    existing.set(p.slug, {
      id: p.id,
      variants: p.product_variants,
      categoryIds: p.product_categories.map((c) => c.category_id),
      images: p.product_images.map((img) => ({ url: img.url, publicId: img.public_id ?? "", alt: img.alt })),
    });
  }
}

type Upload = { source: string; product: ImportProduct; index: number };
const uploads: Upload[] = [];
// Collect every problem before stopping, so the whole file can be fixed in one go.
const errors: ImportError[] = [...rowErrors];
const checked: { product: ImportProduct; form: ProductForm }[] = [];

for (const product of products) {
  const line = product.lines[0];
  let categoryIds: string[] | null = null;
  if (product.categorySlugs) {
    const unknown = product.categorySlugs.filter((s) => !categoryId.has(s));
    if (unknown.length) errors.push({ line, message: `categories: unknown category slug ${unknown.map((s) => `“${s}”`).join(", ")}.` });
    categoryIds = product.categorySlugs.filter((s) => categoryId.has(s)).map((s) => categoryId.get(s)!);
  }

  let images = null;
  if (product.imageSources) {
    images = product.imageSources.map((source, index) => {
      if (source.startsWith("https://res.cloudinary.com/")) {
        return { url: source, publicId: cloudinaryPublicId(source) ?? "", alt: product.form.name };
      }
      // A site path such as /brand/logo.png (a file in public/) is kept as it is.
      if (source.startsWith("/") && !existsSync(source) && existsSync(resolve("public", `.${source}`))) {
        return { url: source, publicId: "", alt: product.form.name };
      }
      const isUrl = /^https?:\/\//.test(source);
      if (!isUrl && !existsSync(resolve(dirname(csvPath), source))) {
        errors.push({ line, message: `images: file not found: ${source} (paths are relative to the CSV file).` });
      }
      uploads.push({ source, product, index });
      return { url: PENDING_UPLOAD, publicId: "", alt: product.form.name };
    });
  }

  const result = validateImportProduct(product, { categoryIds, images, existing: existing.get(product.slug) ?? null });
  errors.push(...result.errors);
  if (result.form) checked.push({ product, form: result.form });
}
if (errors.length) fail(errors);

const created = checked.filter((c) => c.form.id === null).length;
const options = checked.reduce((n, c) => n + c.form.variants.length, 0);
console.log(`\n${basename(csvPath)}: ${checked.length} products (${created} new, ${checked.length - created} updated), ${options} options, ${uploads.length} photos to upload.`);

if (uploads.length) {
  const missing = ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].filter((n) => !process.env[n]);
  if (missing.length) fail([{ line: 1, message: `Uploading photos needs ${missing.join(", ")} in .env.local. Or use Cloudinary URLs in the images column.` }]);
}

if (!apply) {
  console.log("Everything checks out. Nothing was changed. Run again with --apply to import.\n");
  process.exit(0);
}

/** Uploads a local file or a web URL to Cloudinary with a signed request. */
async function upload(source: string): Promise<{ url: string; publicId: string }> {
  const cloud = env("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new FormData();
  if (/^https?:\/\//.test(source)) {
    body.append("file", source);
  } else {
    const path = resolve(dirname(csvPath), source);
    body.append("file", new Blob([readFileSync(path)]), basename(path));
  }
  body.append("api_key", env("CLOUDINARY_API_KEY"));
  body.append("timestamp", String(timestamp));
  body.append("folder", UPLOAD_FOLDER);
  body.append("signature", await cloudinarySignature({ folder: UPLOAD_FOLDER, timestamp }, env("CLOUDINARY_API_SECRET")));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  const json = (await res.json()) as { secure_url?: string; public_id?: string; error?: { message: string } };
  if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return { url: json.secure_url, publicId: json.public_id ?? "" };
}

for (const [i, u] of uploads.entries()) {
  process.stdout.write(`\rUploading photos ${i + 1}/${uploads.length}…`);
  try {
    const done = await upload(u.source);
    const target = checked.find((c) => c.product === u.product)!;
    target.form.images[u.index] = { ...target.form.images[u.index], url: done.url, publicId: done.publicId };
  } catch (e) {
    console.error(`\nCould not upload ${u.source} (line ${u.product.lines[0]}): ${e instanceof Error ? e.message : e}`);
    console.error("Nothing was imported. Fix the photo and run again; photos already uploaded are simply uploaded again.");
    process.exit(1);
  }
}
if (uploads.length) process.stdout.write("\n");

let failed = 0;
for (const [i, { product, form }] of checked.entries()) {
  const result = await writeProduct(supabase, form);
  if (result.ok) {
    process.stdout.write(`\rSaved ${i + 1}/${checked.length}: ${product.slug}`.padEnd(80));
  } else {
    failed++;
    const detail = result.errors ? Object.values(result.errors).join(" ") : "";
    console.error(`\nline ${product.lines[0]} (${product.slug}): ${result.message} ${detail}`.trimEnd());
  }
}
console.log(`\n\nDone: ${checked.length - failed} saved${failed ? `, ${failed} failed (see above)` : ""}.\n`);
process.exit(failed ? 1 : 0);
