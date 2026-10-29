import { formErrors, productFormSchema, type ProductForm, type ProductFormInput } from "@/lib/admin-product";
import { pesewasToInput } from "@/lib/money";
import { slugify } from "@/lib/slug";

/**
 * Spreadsheet format for importing products: one row per option (variant).
 * Product columns are read from a product's first row; later rows add options.
 * See scripts/README.md.
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
  "option1_name",
  "option2_name",
  "option1_value",
  "option2_value",
  "variant_price",
  "sku",
  "in_stock",
  "stock_qty",
  "images",
] as const;

export type Column = (typeof COLUMNS)[number];
export type ImportRow = Record<Column, string> & { line: number };
export type ImportError = { line: number; message: string };

export type ImportProduct = {
  slug: string;
  /** Spreadsheet line of each option, in order (line 1 is the header). */
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
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  header.forEach((h, i) => {
    if (h && !COLUMNS.includes(h as Column)) errors.push({ line: 1, message: `Unknown column “${table[0][i]}”.` });
  });
  for (const required of ["name", "price"] as const) {
    if (!header.includes(required)) errors.push({ line: 1, message: `Missing the “${required}” column.` });
  }
  const rows = table.slice(1).map((cells, i) => {
    const row = { line: i + 2 } as ImportRow;
    for (const column of COLUMNS) {
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

/** Groups rows into products. Rows with the same slug (or, without a slug, the same name) are one product. */
export function groupProducts(rows: ImportRow[]): { products: ImportProduct[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const bySlug = new Map<string, ImportProduct>();

  for (const row of rows) {
    const slug = row.slug.toLowerCase() || slugify(row.name);
    if (!slug) {
      errors.push({ line: row.line, message: "Each row needs a slug or a name." });
      continue;
    }
    let product = bySlug.get(slug);
    if (!product) {
      product = {
        slug,
        lines: [],
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
          option1Name: row.option1_name,
          option2Name: row.option2_name,
          variants: [],
        },
        categorySlugs: row.categories ? list(row.categories).map((c) => c.toLowerCase()) : null,
        imageSources: row.images ? list(row.images) : null,
      };
      bySlug.set(slug, product);
    } else if (!product.form.option1Name) {
      errors.push({
        line: row.line,
        message: `“${product.form.name || slug}” has more than one row but no option1_name (e.g. Colour).`,
      });
      continue;
    }
    product.lines.push(row.line);
    product.form.variants.push({
      id: null,
      option1Value: row.option1_value,
      option2Value: row.option2_value,
      sku: row.sku,
      inStock: yesNo(row.in_stock, true, row.line, "in_stock", errors),
      stockQty: row.stock_qty,
      priceOverride: row.variant_price,
    });
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
  option1Name: "option1_name",
  option2Name: "option2_name",
  option1Value: "option1_value",
  option2Value: "option2_value",
  sku: "sku",
  stockQty: "stock_qty",
  priceOverride: "variant_price",
  variants: "options",
  images: "images",
};

export type ExistingProduct = {
  id: string;
  variants: { id: string; option1_value: string | null; option2_value: string | null }[];
  categoryIds: string[];
  images: ProductFormInput["images"];
};

/**
 * Turns a grouped product into checked database values. Existing options keep
 * their ids (matched on option values), and empty categories or images
 * columns keep what the product already has.
 */
export function validateImportProduct(
  product: ImportProduct,
  resolved: { categoryIds: string[] | null; images: ProductFormInput["images"] | null; existing: ExistingProduct | null },
): { form: ProductForm | null; errors: ImportError[] } {
  const { existing } = resolved;
  const key = (a: string | null | undefined, b: string | null | undefined) => `${(a ?? "").toLowerCase()}|${(b ?? "").toLowerCase()}`;
  const existingIds = new Map(existing?.variants.map((v) => [key(v.option1_value, v.option2_value), v.id]) ?? []);
  const hasOptions = Boolean(product.form.option1Name);

  const input: ProductFormInput = {
    ...product.form,
    id: existing?.id ?? null,
    variants: product.form.variants.map((v) => ({
      ...v,
      // Without options the single variant has no values, so it matches the existing single variant.
      id: existingIds.get(hasOptions ? key(v.option1Value, v.option2Value) : key(null, null)) ?? null,
    })),
    categoryIds: resolved.categoryIds ?? existing?.categoryIds ?? [],
    images: resolved.images ?? existing?.images ?? [],
  };

  const parsed = productFormSchema.safeParse(input);
  if (parsed.success) return { form: parsed.data, errors: [] };
  const errors = Object.entries(formErrors(parsed.error)).map(([path, message]) => {
    const [field, index, sub] = path.split(".");
    const variantLine = field === "variants" && index !== undefined ? product.lines[Number(index)] : undefined;
    const column = FIELD_COLUMNS[sub ?? field] ?? field;
    return { line: variantLine ?? product.lines[0], message: `${column}: ${message}` };
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
  option2_name: string | null;
  categorySlugs: string[];
  imageUrls: string[];
  variants: {
    option1_value: string | null;
    option2_value: string | null;
    price_override: number | null;
    sku: string | null;
    in_stock: boolean;
    stock_qty: number | null;
  }[];
};

/** Products → spreadsheet rows in the import format (header first), so they can be edited and imported again. */
export function productsToRows(products: ExportProduct[]): string[][] {
  const rows: string[][] = [[...COLUMNS]];
  for (const p of products) {
    p.variants.forEach((v, i) => {
      const first = i === 0;
      const cell: Record<Column, string> = {
        slug: p.slug,
        name: first ? p.name : "",
        brand: first ? (p.brand ?? "") : "",
        description: first ? (p.description ?? "") : "",
        price: first ? pesewasToInput(p.price) : "",
        compare_at_price: first ? pesewasToInput(p.compare_at_price) : "",
        categories: first ? p.categorySlugs.join(LIST_SEPARATOR) : "",
        active: first ? (p.is_active ? "yes" : "no") : "",
        featured: first ? (p.is_featured ? "yes" : "no") : "",
        option1_name: first ? (p.option1_name ?? "") : "",
        option2_name: first ? (p.option2_name ?? "") : "",
        option1_value: v.option1_value ?? "",
        option2_value: v.option2_value ?? "",
        variant_price: pesewasToInput(v.price_override),
        sku: v.sku ?? "",
        in_stock: v.in_stock ? "yes" : "no",
        stock_qty: v.stock_qty === null ? "" : String(v.stock_qty),
        images: first ? p.imageUrls.join(LIST_SEPARATOR) : "",
      };
      rows.push(COLUMNS.map((c) => cell[c]));
    });
  }
  return rows;
}
