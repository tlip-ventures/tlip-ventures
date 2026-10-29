// The data import (old system to Stock & POS): what each kind of file holds,
// matching the file's column headers, reading cells (money, whole numbers,
// dates, phones) and checking each row before anything is saved.

import { normaliseGhanaPhone } from "@/lib/phone";
import { slugify } from "@/lib/slug";
import type { Sheet } from "./spreadsheet";

export const IMPORT_KINDS = ["products", "customers", "suppliers", "sales", "purchases"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

type FieldType = "text" | "money" | "int" | "date" | "phone";
export type ImportField = { key: string; label: string; type: FieldType; required?: boolean; synonyms: string[]; hint?: string };

const NAME = ["product", "product name", "item", "item name", "name", "description", "product description"];
const DATE = ["date", "sale date", "purchase date", "date time", "datetime", "created", "created at", "time", "transaction date"];
const TOTAL = ["total", "grand total", "total amount", "amount", "net total", "sale total", "invoice total", "total price"];
const PAID = ["paid", "amount paid", "paid amount", "total paid", "payment"];
const OWED = ["balance", "due", "amount due", "balance due", "outstanding", "owed", "credit", "unpaid"];
const METHOD = ["payment method", "method", "paid by", "payment type", "mode of payment", "payment mode"];

export const IMPORT_FIELDS: Record<ImportKind, ImportField[]> = {
  products: [
    { key: "name", label: "Product name", type: "text", required: true, synonyms: NAME },
    { key: "sku", label: "Code (SKU)", type: "text", synonyms: ["sku", "code", "item code", "product code", "ref", "reference"] },
    { key: "barcode", label: "Barcode", type: "text", synonyms: ["barcode", "bar code", "ean", "upc"] },
    { key: "category", label: "Category", type: "text", synonyms: ["category", "categories", "group", "department", "sub category", "subcategory"] },
    { key: "price", label: "Selling price", type: "money", required: true, synonyms: ["selling price", "price", "retail price", "sale price", "unit price", "sell price"] },
    { key: "cost", label: "Cost price", type: "money", synonyms: ["cost price", "cost", "buying price", "purchase price", "unit cost", "buy price"] },
    {
      key: "qty",
      label: "Stock on the shelf",
      type: "int",
      synonyms: ["quantity", "qty", "stock", "in stock", "stock level", "quantity on hand", "on hand", "stock quantity", "available", "quantity in stock"],
      hint: "Becomes the shelf count. Below zero shows as Recount.",
    },
    {
      key: "reorder",
      label: "Alert level",
      type: "int",
      synonyms: ["reorder level", "alert", "alert quantity", "min stock", "minimum", "minimum stock", "low stock alert", "reorder point", "stock alert"],
    },
  ],
  customers: [
    { key: "name", label: "Name", type: "text", required: true, synonyms: ["name", "customer", "customer name", "client", "full name"] },
    { key: "phone", label: "Phone", type: "phone", synonyms: ["phone", "phone number", "mobile", "telephone", "contact", "tel", "mobile number"] },
  ],
  suppliers: [
    { key: "name", label: "Name", type: "text", required: true, synonyms: ["name", "supplier", "supplier name", "vendor", "company"] },
    { key: "phone", label: "Phone", type: "phone", synonyms: ["phone", "phone number", "mobile", "telephone", "contact", "tel"] },
  ],
  sales: [
    {
      key: "code",
      label: "Sale number",
      type: "text",
      required: true,
      synonyms: ["reference", "ref", "sale no", "sale number", "invoice", "invoice no", "invoice number", "receipt", "receipt no", "sale id", "code", "number", "transaction id", "order no"],
    },
    { key: "date", label: "Date", type: "date", required: true, synonyms: DATE },
    { key: "customer", label: "Customer", type: "text", synonyms: ["customer", "customer name", "client", "client name", "sold to"] },
    { key: "phone", label: "Customer phone", type: "phone", synonyms: ["customer phone", "phone", "mobile", "phone number", "contact"] },
    { key: "product", label: "Product (one row per item)", type: "text", synonyms: ["product", "product name", "item", "item name", "description"] },
    { key: "qty", label: "Quantity", type: "int", synonyms: ["quantity", "qty", "units"] },
    { key: "unitPrice", label: "Price each", type: "money", synonyms: ["unit price", "price", "selling price", "rate"] },
    { key: "unitCost", label: "Cost each", type: "money", synonyms: ["unit cost", "cost", "cost price", "buying price"] },
    { key: "total", label: "Sale total", type: "money", synonyms: TOTAL },
    { key: "paid", label: "Amount paid", type: "money", synonyms: PAID },
    { key: "owed", label: "Still owed", type: "money", synonyms: OWED },
    { key: "method", label: "Payment method", type: "text", synonyms: METHOD },
    { key: "status", label: "Status", type: "text", synonyms: ["status", "sale status", "state"], hint: "Cancelled or void sales are left out." },
  ],
  purchases: [
    {
      key: "code",
      label: "Purchase number",
      type: "text",
      required: true,
      synonyms: ["reference", "ref", "purchase no", "purchase number", "po", "po number", "order no", "invoice", "invoice no", "bill no", "code", "number"],
    },
    { key: "date", label: "Date", type: "date", required: true, synonyms: DATE },
    { key: "supplier", label: "Supplier", type: "text", required: true, synonyms: ["supplier", "supplier name", "vendor", "company"] },
    { key: "product", label: "Product (one row per item)", type: "text", synonyms: ["product", "product name", "item", "item name", "description"] },
    { key: "qty", label: "Quantity", type: "int", synonyms: ["quantity", "qty", "units"] },
    { key: "unitCost", label: "Cost each", type: "money", synonyms: ["unit cost", "cost", "cost price", "buying price", "unit price", "price", "rate"] },
    { key: "total", label: "Purchase total", type: "money", synonyms: TOTAL },
    { key: "paid", label: "Amount paid", type: "money", synonyms: PAID },
    { key: "owed", label: "Still owed", type: "money", synonyms: OWED },
    { key: "method", label: "Payment method", type: "text", synonyms: METHOD },
    { key: "status", label: "Status", type: "text", synonyms: ["status", "state"], hint: "Cancelled purchases are left out." },
  ],
};

export const KIND_LABELS: Record<ImportKind, { title: string; body: string }> = {
  products: { title: "Products and stock", body: "Names, codes, prices, costs and how many are on the shelf. Import these first." },
  customers: { title: "Customers", body: "Names and phone numbers." },
  suppliers: { title: "Suppliers", body: "Names and phone numbers." },
  sales: { title: "Past sales", body: "History for your figures and what customers still owe. Doesn't change the shelf count." },
  purchases: { title: "Past purchases", body: "History, and what you still owe suppliers. Doesn't change the shelf count." },
};

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Which column (index) holds each field, by header name; -1 when none. Exact names first. */
export function autoMap(kind: ImportKind, headers: string[]): Record<string, number> {
  const normal = headers.map(norm);
  const used = new Set<number>();
  const map: Record<string, number> = {};
  const fields = IMPORT_FIELDS[kind];
  // Pass 1: exact matches, in each field's order of preference.
  for (const f of fields) {
    map[f.key] = -1;
    for (const syn of f.synonyms) {
      const i = normal.findIndex((h, j) => !used.has(j) && h === syn);
      if (i >= 0) {
        map[f.key] = i;
        used.add(i);
        break;
      }
    }
  }
  // Pass 2: a header that starts with a synonym ("Selling price (GHS)" was cut already; "Qty sold").
  for (const f of fields) {
    if (map[f.key] >= 0) continue;
    for (const syn of f.synonyms) {
      const i = normal.findIndex((h, j) => !used.has(j) && h !== "" && (h.startsWith(`${syn} `) || h.endsWith(` ${syn}`)));
      if (i >= 0) {
        map[f.key] = i;
        used.add(i);
        break;
      }
    }
  }
  return map;
}

/** The header row: within the first 10 rows, the one that names the most fields (reports often start with a title). */
export function findHeaderRow(kind: ImportKind, sheet: Sheet): number {
  let best = 0;
  let bestScore = -1;
  for (let r = 0; r < Math.min(sheet.length, 10); r++) {
    const map = autoMap(kind, sheet[r]);
    const score = Object.values(map).filter((i) => i >= 0).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * Money in cedis as pesewas: "GH₵ 1,250.50", "1250.5", or Excel's
 * "449.99999999999994". Rounded to the pesewa with string arithmetic.
 */
export function parseMoneyCell(input: string): number | null {
  const s = input.trim().replace(/^(GH₵|GHS|GH¢|GHC|₵|¢)\s*/i, "").replace(/\s*(GH₵|GHS|GHC)$/i, "").replace(/[,\s]/g, "");
  const m = /^(\d{1,9})(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = (m[2] ?? "").padEnd(3, "0");
  let pesewas = whole * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) pesewas += 1;
  return Number.isSafeInteger(pesewas) ? pesewas : null;
}

/** Whole numbers, may be negative: "12", "1,200", "12.0", "-4". */
export function parseIntCell(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  const m = /^(-?\d{1,7})(?:\.0+)?$/.exec(s);
  return m ? Number(m[1]) : null;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function iso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, mo, d, h, mi, s));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  return date.toISOString();
}

function time(rest: string | undefined): [number, number, number] | null {
  if (!rest || !rest.trim()) return [0, 0, 0];
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?\s*$/i.exec(rest);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[4]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return [h, Number(m[2]), Number(m[3] ?? 0)];
}

/**
 * A date (and time) as an ISO string, Ghana time = UTC. Excel date numbers,
 * 2023-05-16, 16/05/2023 (day first, as in Ghana), 16-05-23, 16 May 2023,
 * May 16, 2023, with or without a time.
 */
export function parseDateCell(input: string): string | null {
  const s = input.trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial < 36526 || serial > 73051) return null; // 2000 to 2100
    const ms = Math.round((serial - 25569) * 86_400_000 / 1000) * 1000;
    return new Date(ms).toISOString();
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(.*?))?(?:Z|[+-]00:?00)?$/.exec(s);
  if (m) {
    const t = time(m[4]);
    return t ? iso(Number(m[1]), Number(m[2]) - 1, Number(m[3]), ...t) : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[\s,]+(.*))?$/.exec(s);
  if (m) {
    const t = time(m[4]);
    return t ? iso(Number(m[3]), Number(m[2]) - 1, Number(m[1]), ...t) : null;
  }
  m = /^(\d{1,2})[\s-]([a-z]{3,9})[\s,-]+(\d{2}|\d{4})(?:[\s,]+(.*))?$/i.exec(s);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    const t = time(m[4]);
    return t ? iso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]), ...t) : null;
  }
  m = /^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?:[\s,]+(.*))?$/i.exec(s);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    const t = time(m[4]);
    return t ? iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]), ...t) : null;
  }
  return null;
}

/** Cash, Mobile Money or Bank from the old system's wording; cash when unclear. */
export function paymentMethodOf(text: string): "cash" | "momo" | "bank" {
  const t = text.toLowerCase();
  if (/momo|mobile|mtn|vodafone|telecel|airtel|\bat\b|e-?cash/.test(t)) return "momo";
  if (/bank|transfer|card|cheque|check|visa|pos\b/.test(t)) return "bank";
  return "cash";
}

/** Sale and purchase numbers: trimmed, upper case; bare numbers get the prefix (1209 -> SL_1209). */
export function recordCode(raw: string, prefix: "SL_" | "PR_"): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(s) ? `${prefix}${s}` : s;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type RowError = { row: number; message: string };

export type ProductRow = {
  row: number;
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  price: number;
  cost: number | null;
  qty: number | null;
  reorder: number | null;
};
export type PersonRow = { row: number; name: string; phone: string | null };
export type RecordLine = { name: string; qty: number; unitPrice: number; unitCost: number | null };
export type SaleRecord = {
  row: number;
  code: string;
  date: string;
  party: string | null;
  phone: string | null;
  lines: RecordLine[];
  total: number;
  paid: number;
  method: "cash" | "momo" | "bank";
};

export type Checked<T> = { rows: T[]; errors: RowError[]; skipped: RowError[] };

type Cells = Record<string, string>;

/** Data rows under the header, each as field -> cell text, with its spreadsheet row number. */
export function rowsOf(sheet: Sheet, headerRow: number, map: Record<string, number>): { row: number; cells: Cells }[] {
  const out: { row: number; cells: Cells }[] = [];
  for (let r = headerRow + 1; r < sheet.length; r++) {
    const line = sheet[r];
    if (!line || line.every((c) => c === "")) continue;
    const cells: Cells = {};
    for (const [key, i] of Object.entries(map)) cells[key] = i >= 0 ? (line[i] ?? "").trim() : "";
    out.push({ row: r + 1, cells });
  }
  return out;
}

const LIMIT = { name: 200, code: 40, text: 100 };

function personRows(input: { row: number; cells: Cells }[]): Checked<PersonRow> {
  const rows: PersonRow[] = [];
  const errors: RowError[] = [];
  const skipped: RowError[] = [];
  const seen = new Map<string, number>();
  for (const { row, cells } of input) {
    const name = cells.name.replace(/\s+/g, " ").trim();
    if (!name) {
      errors.push({ row, message: "No name." });
      continue;
    }
    if (name.length > LIMIT.text) {
      errors.push({ row, message: "Name longer than 100 letters." });
      continue;
    }
    if (/^walk[\s-]?in/i.test(name)) {
      skipped.push({ row, message: "Walk-in customer: not a person to keep." });
      continue;
    }
    let phone: string | null = null;
    if (cells.phone) {
      phone = normaliseGhanaPhone(cells.phone);
      if (!phone) {
        errors.push({ row, message: `“${cells.phone}” isn't a Ghana phone number. Fix it or clear the cell.` });
        continue;
      }
    }
    const key = phone ?? name.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ row, message: `Same ${phone ? "phone" : "name"} as row ${seen.get(key)}.` });
      continue;
    }
    seen.set(key, row);
    rows.push({ row, name, phone });
  }
  return { rows, errors, skipped };
}

function productRows(input: { row: number; cells: Cells }[]): Checked<ProductRow> {
  const rows: ProductRow[] = [];
  const errors: RowError[] = [];
  const skipped: RowError[] = [];
  const skus = new Map<string, number>();
  const barcodes = new Map<string, number>();
  const names = new Map<string, number>();
  for (const { row, cells } of input) {
    const problems: string[] = [];
    const name = cells.name.replace(/\s+/g, " ").trim();
    if (!name) problems.push("No product name.");
    else if (name.length > LIMIT.name) problems.push("Name longer than 200 letters.");
    const price = cells.price ? parseMoneyCell(cells.price) : null;
    if (price === null) problems.push(cells.price ? `Price “${cells.price}” isn't an amount.` : "No selling price.");
    const cost = cells.cost ? parseMoneyCell(cells.cost) : null;
    if (cells.cost && cost === null) problems.push(`Cost “${cells.cost}” isn't an amount.`);
    const qty = cells.qty ? parseIntCell(cells.qty) : null;
    if (cells.qty && qty === null) problems.push(`Stock “${cells.qty}” isn't a whole number.`);
    else if (qty !== null && Math.abs(qty) > 100_000) problems.push("Stock is more than 100,000.");
    const reorder = cells.reorder ? parseIntCell(cells.reorder) : null;
    if (cells.reorder && (reorder === null || reorder < 0 || reorder > 100_000)) problems.push(`Alert level “${cells.reorder}” isn't a whole number from 0.`);
    const sku = cells.sku ? cells.sku.slice(0, 60) : null;
    const barcode = cells.barcode ? cells.barcode.replace(/\s+/g, "").slice(0, 60) : null;
    const slug = name ? slugify(name) : "";
    if (name && !slug) problems.push("The name needs some letters or numbers.");

    if (sku) {
      const k = sku.toLowerCase();
      if (skus.has(k)) problems.push(`Same code as row ${skus.get(k)}.`);
      else skus.set(k, row);
    }
    if (barcode) {
      if (barcodes.has(barcode)) problems.push(`Same barcode as row ${barcodes.get(barcode)}.`);
      else barcodes.set(barcode, row);
    }
    if (name && !sku && !barcode) {
      const k = name.toLowerCase();
      if (names.has(k)) problems.push(`Same name as row ${names.get(k)} and no code to tell them apart.`);
      else names.set(k, row);
    }
    if (problems.length) {
      errors.push({ row, message: problems.join(" ") });
      continue;
    }
    rows.push({
      row,
      name,
      slug,
      sku,
      barcode,
      category: cells.category ? cells.category.slice(0, 80) : null,
      price: price!,
      cost,
      qty,
      reorder,
    });
  }
  return { rows, errors, skipped };
}

/** Sales or purchases: rows with the same number are one record (one row per item, or one row per record). */
function recordRows(kind: "sales" | "purchases", input: { row: number; cells: Cells }[]): Checked<SaleRecord> {
  const errors: RowError[] = [];
  const skipped: RowError[] = [];
  const groups = new Map<string, { row: number; cells: Cells }[]>();
  for (const item of input) {
    const code = recordCode(item.cells.code, kind === "sales" ? "SL_" : "PR_");
    if (!code) {
      errors.push({ row: item.row, message: kind === "sales" ? "No sale number." : "No purchase number." });
      continue;
    }
    if (code.length > LIMIT.code) {
      errors.push({ row: item.row, message: "Number longer than 40 characters." });
      continue;
    }
    const g = groups.get(code);
    if (g) g.push(item);
    else groups.set(code, [item]);
  }

  const rows: SaleRecord[] = [];
  for (const [code, items] of groups) {
    const first = items[0].row;
    const pick = (key: string) => items.find((i) => i.cells[key])?.cells[key] ?? "";
    const problems: string[] = [];

    const status = pick("status");
    if (/cancel|void|delete|refund/i.test(status)) {
      skipped.push({ row: first, message: `${code} is ${status.toLowerCase()}: left out.` });
      continue;
    }

    const date = pick("date") ? parseDateCell(pick("date")) : null;
    if (!date) problems.push(pick("date") ? `Date “${pick("date")}” isn't a date (use day/month/year).` : "No date.");

    const party = pick(kind === "sales" ? "customer" : "supplier").replace(/\s+/g, " ").trim().slice(0, LIMIT.text) || null;
    if (kind === "purchases" && !party) problems.push("No supplier.");
    let phone: string | null = null;
    if (kind === "sales" && pick("phone")) {
      phone = normaliseGhanaPhone(pick("phone"));
      if (!phone) problems.push(`“${pick("phone")}” isn't a Ghana phone number.`);
    }

    const priceKey = kind === "sales" ? "unitPrice" : "unitCost";
    const lines: RecordLine[] = [];
    for (const { row, cells } of items) {
      if (!cells.product) continue;
      const qty = cells.qty ? parseIntCell(cells.qty) : 1;
      if (qty === null || qty < 1 || qty > (kind === "sales" ? 999 : 100_000)) {
        problems.push(`Row ${row}: quantity “${cells.qty}” isn't a whole number from 1.`);
        continue;
      }
      let unit = cells[priceKey] ? parseMoneyCell(cells[priceKey]) : null;
      if (cells[priceKey] && unit === null) {
        problems.push(`Row ${row}: “${cells[priceKey]}” isn't an amount.`);
        continue;
      }
      // One item per row and no price: the row's total is the line.
      if (unit === null && cells.total && items.length > 1) {
        const t = parseMoneyCell(cells.total);
        if (t !== null && t % qty === 0) unit = t / qty;
      }
      const cost = kind === "sales" && cells.unitCost ? parseMoneyCell(cells.unitCost) : null;
      lines.push({ name: cells.product.slice(0, LIMIT.name), qty, unitPrice: unit ?? 0, unitCost: cost });
    }

    const linesTotal = lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
    const totals = items.map((i) => i.cells.total).filter(Boolean).map(parseMoneyCell);
    let total: number | null = null;
    if (totals.some((t) => t === null)) problems.push(`Total “${items.find((i) => i.cells.total && parseMoneyCell(i.cells.total) === null)!.cells.total}” isn't an amount.`);
    else if (totals.length) {
      // The same total on every row is the record's total; different ones are line totals.
      const distinct = new Set(totals);
      total = distinct.size === 1 ? totals[0]! : (totals as number[]).reduce((a, b) => a + b, 0);
    } else if (lines.length) total = linesTotal;
    else problems.push("No total and no items.");

    let paid = total ?? 0;
    if (pick("paid")) {
      const p = parseMoneyCell(pick("paid"));
      if (p === null) problems.push(`Paid “${pick("paid")}” isn't an amount.`);
      else paid = p;
    } else if (pick("owed")) {
      const o = parseMoneyCell(pick("owed"));
      if (o === null) problems.push(`Still owed “${pick("owed")}” isn't an amount.`);
      else paid = (total ?? 0) - o;
    }

    if (problems.length) {
      errors.push({ row: first, message: `${code}: ${problems.join(" ")}` });
      continue;
    }
    rows.push({
      row: first,
      code,
      date: date!,
      party,
      phone,
      lines,
      total: total!,
      paid: Math.max(0, Math.min(paid, total!)),
      method: paymentMethodOf(pick("method")),
    });
  }
  return { rows, errors, skipped };
}

export type CheckedImport =
  | { kind: "products"; result: Checked<ProductRow> }
  | { kind: "customers" | "suppliers"; result: Checked<PersonRow> }
  | { kind: "sales" | "purchases"; result: Checked<SaleRecord> };

/** Checks every data row of the sheet for this kind of import. */
export function checkImport(kind: ImportKind, sheet: Sheet, headerRow: number, map: Record<string, number>): CheckedImport {
  const input = rowsOf(sheet, headerRow, map);
  if (kind === "products") return { kind, result: productRows(input) };
  if (kind === "customers" || kind === "suppliers") return { kind, result: personRows(input) };
  return { kind, result: recordRows(kind, input) };
}

/** Required fields with no column chosen. */
export function missingFields(kind: ImportKind, map: Record<string, number>): ImportField[] {
  return IMPORT_FIELDS[kind].filter((f) => f.required && (map[f.key] ?? -1) < 0);
}
