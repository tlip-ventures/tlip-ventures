import { formErrors, parseChoices, productFormSchema, type ProductForm, type ProductFormInput } from "@/lib/admin-product";
import { pesewasToInput } from "@/lib/money";
import { slugify } from "@/lib/slug";

/**
 * Spreadsheet format for importing products: one row per product. Colours (or
 * designs) are choices in one cell, e.g. choice_name "Colour" and choices
 * "Black|Red|Grey"; stock is one number for the product. See scripts/README.md.
 */
export const COLUMNS = [
  "slug",
  "name",
  "brand",
  "description",
  "price",
  "compare_at_price",
  "categories",
  "active",
  "featured",
  "choice_name",
  "choices",
  "sku",
  "in_stock",
  "stock_qty",
  "images",
] as const;

/**
 * Columns of the older format (one row per colour). Still read, so older files
 * import: each row's option values become a choice of the product.
 */
const LEGACY_COLUMNS = ["option1_name", "option2_name", "option1_value", "option2_value", "variant_price"] as const;

export type Column = (typeof COLUMNS)[number];
type LegacyColumn = (typeof LEGACY_COLUMNS)[number];
export type ImportRow = Record<Column | LegacyColumn, string> & { line: number };
export type ImportError = { line: number; message: string };

export type ImportProduct = {
  slug: string;
  /** Spreadsheet lines of the product (more than one only in the older format). */
  lines: number[];
  form: Omit<ProductFormInput, "categoryIds" | "images">;
  /** Category slugs, or null when the column is empty (keep a product's current categories). */
  categorySlugs: string[] | null;
  /** Photo URLs or file paths, or null when the column is empty (keep current photos). */
  imageSources: string[] | null;
};

const LIST_SEPARATOR = "|";

/** Reads the header and rows. Column names are matched without regard to case or spaces. */
export function readImportRows(table: string[][]): { rows: ImportRow[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  const known: readonly string[] = [...COLUMNS, ...LEGACY_COLUMNS];
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  header.forEach((h, i) => {
    if (h && !known.includes(h)) errors.push({ line: 1, message: `Unknown column “${table[0][i]}”.` });
  });
  for (const required of ["name", "price"] as const) {
    if (!header.includes(required)) errors.push({ line: 1, message: `Missing the “${required}” column.` });
  }
  const rows = table.slice(1).map((cells, i) => {
    const row = { line: i + 2 } as ImportRow;
    for (const column of known as (Column | LegacyColumn)[]) {
      const at = header.indexOf(column);
      row[column] = at >= 0 ? (cells[at] ?? "").trim() : "";
    }
    return row;
  });
  return { rows, errors };
}

function yesNo(value: string, fallback: boolean, line: number, column: string, errors: ImportError[]): boolean {
  const v = value.toLowerCase();
  if (v === "") return fallback;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  errors.push({ line, message: `${column} must be yes or no, not “${value}”.` });
  return fallback;
}

const list = (value: string) =>
  value
    .split(LIST_SEPARATOR)
    .map((v) => v.trim())
    .filter(Boolean);

/** A row's colour in the older format: "Black", or "Black / Large" with two options. */
const legacyChoice = (row: ImportRow) => [row.option1_value, row.option2_value].filter(Boolean).join(" / ");

/**
 * Groups rows into products. One row per product; in the older format, rows
 * with the same slug (or, without a slug, the same name) are its colours.
 */
export function groupProducts(rows: ImportRow[]): { products: ImportProduct[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const bySlug = new Map<string, ImportProduct>();

  for (const row of rows) {
    const slug = row.slug.toLowerCase() || slugify(row.name);
    if (!slug) {
      errors.push({ line: row.line, message: "Each row needs a slug or a name." });
      continue;
    }
    if (row.variant_price) {
      errors.push({ line: row.line, message: "variant_price: colours can't have their own price. Use a separate product." });
    }
    const choice = legacyChoice(row);
    let product = bySlug.get(slug);
    if (!product) {
      const choiceName = row.choice_name || [row.option1_name, row.option2_name].filter(Boolean).join(" / ");
      product = {
        slug,
        lines: [row.line],
        form: {
          id: null,
          name: row.name,
          slug,
          brand: row.brand,
          description: row.description,
          price: row.price,
          compareAtPrice: row.compare_at_price,
          isActive: yesNo(row.active, true, row.line, "active", errors),
          isFeatured: yesNo(row.featured, false, row.line, "featured", errors),
          choiceName,
          choices: [row.choices, choice].filter(Boolean).join(LIST_SEPARATOR),
          sku: row.sku,
          inStock: yesNo(row.in_stock, true, row.line, "in_stock", errors),
          stockQty: row.stock_qty,
        },
        categorySlugs: row.categories ? list(row.categories).map((c) => c.toLowerCase()) : null,
        imageSources: row.images ? list(row.images) : null,
      };
      bySlug.set(slug, product);
      continue;
    }
    if (!choice) {
      errors.push({ line: row.line, message: `“${product.form.name || slug}” is listed twice. Use one row per product.` });
      continue;
    }
    // Older format: another colour of the same product. Stock adds up; in stock if any colour was.
    product.lines.push(row.line);
    product.form.choices = [product.form.choices, choice].filter(Boolean).join(LIST_SEPARATOR);
    product.form.inStock = product.form.inStock || yesNo(row.in_stock, true, row.line, "in_stock", errors);
    if (/^\d+$/.test(row.stock_qty)) {
      const sum = Number(row.stock_qty) + (/^\d+$/.test(product.form.stockQty) ? Number(product.form.stockQty) : 0);
      product.form.stockQty = String(sum);
    }
  }
  return { products: [...bySlug.values()], errors };
}

/** Field names in productFormSchema → spreadsheet columns, for error messages. */
const FIELD_COLUMNS: Record<string, string> = {
  name: "name",
  slug: "slug",
  brand: "brand",
  description: "description",
  price: "price",
  compareAtPrice: "compare_at_price",
  choiceName: "choice_name",
  choices: "choices",
  sku: "sku",
  stockQty: "stock_qty",
  images: "images",
};

export type ExistingProduct = {
  id: string;
  categoryIds: string[];
  images: ProductFormInput["images"];
};

/**
 * Turns a grouped product into checked database values. Empty categories or
 * images columns keep what the product already has.
 */
export function validateImportProduct(
  product: ImportProduct,
  resolved: { categoryIds: string[] | null; images: ProductFormInput["images"] | null; existing: ExistingProduct | null },
): { form: ProductForm | null; errors: ImportError[] } {
  const { existing } = resolved;
  const input: ProductFormInput = {
    ...product.form,
    id: existing?.id ?? null,
    categoryIds: resolved.categoryIds ?? existing?.categoryIds ?? [],
    images: resolved.images ?? existing?.images ?? [],
  };

  const parsed = productFormSchema.safeParse(input);
  if (parsed.success) return { form: parsed.data, errors: [] };
  const errors = Object.entries(formErrors(parsed.error)).map(([path, message]) => {
    const [field] = path.split(".");
    return { line: product.lines[0], message: `${FIELD_COLUMNS[field] ?? field}: ${message}` };
  });
  return { form: null, errors };
}

export type ExportProduct = {
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
  is_featured: boolean;
  option1_name: string | null;
  choices: string[];
  categorySlugs: string[];
  imageUrls: string[];
  /** The stock entry in use; null if the product somehow has none. */
  stock: { sku: string | null; in_stock: boolean; stock_qty: number | null } | null;
};

/** Products → spreadsheet rows in the import format (header first), so they can be edited and imported again. */
export function productsToRows(products: ExportProduct[]): string[][] {
  const rows: string[][] = [[...COLUMNS]];
  for (const p of products) {
    const cell: Record<Column, string> = {
      slug: p.slug,
      name: p.name,
      brand: p.brand ?? "",
      description: p.description ?? "",
      price: pesewasToInput(p.price),
      compare_at_price: pesewasToInput(p.compare_at_price),
      categories: p.categorySlugs.join(LIST_SEPARATOR),
      active: p.is_active ? "yes" : "no",
      featured: p.is_featured ? "yes" : "no",
      choice_name: p.choices.length > 0 ? (p.option1_name ?? "") : "",
      choices: parseChoices(p.choices.join(LIST_SEPARATOR)).join(LIST_SEPARATOR),
      sku: p.stock?.sku ?? "",
      in_stock: p.stock?.in_stock === false ? "no" : "yes",
      stock_qty: p.stock?.stock_qty == null ? "" : String(p.stock.stock_qty),
      images: p.imageUrls.join(LIST_SEPARATOR),
    };
    rows.push(COLUMNS.map((c) => cell[c]));
  }
  return rows;
}
