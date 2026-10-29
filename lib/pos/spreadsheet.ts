// Reads the first sheet of an Excel (.xlsx) file, or a CSV file, into rows of
// text, for the data import. No library: an .xlsx file is a zip of XML files,
// unzipped here with the platform's DecompressionStream (browsers, Node,
// Cloudflare Workers). Old .xls files aren't supported; save them as .xlsx.

export type Sheet = string[][];

const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, "" for a quote, commas or semicolons. */
export function readCsv(text: string): Sheet {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: Sheet = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return trimSheet(rows);
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

type ZipEntry = { name: string; method: number; offset: number; compressedSize: number };

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: the last "PK\x05\x06" (a comment may follow it).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This isn't an Excel (.xlsx) file.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("This Excel file looks damaged.");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.push({ name, method, offset, compressedSize });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.offset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error("This Excel file looks damaged.");
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return decoder.decode(data);
  if (entry.method === 8) return decoder.decode(await inflateRaw(data));
  throw new Error("This Excel file uses a compression this app can't read. Save it again as .xlsx or CSV.");
}

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

/** All the text in an <si> or <is>: plain <t>, or rich-text runs. */
function richText(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** "A1" -> 0, "AB7" -> 27 */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The first worksheet of an .xlsx file. */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<Sheet> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const entries = zipEntries(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));

  // The first sheet in the workbook's order, through its relationship id.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = byName.get("xl/workbook.xml");
  const rels = byName.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const wb = await readEntry(bytes, workbook);
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
    const relXml = await readEntry(bytes, rels);
    const target = rid ? new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(relXml)?.[1] : undefined;
    const target2 = rid ? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(relXml)?.[1] : undefined;
    const t = target ?? target2;
    if (t) sheetPath = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`;
  }
  const sheetEntry = byName.get(sheetPath) ?? entries.find((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name));
  if (!sheetEntry) throw new Error("No sheet found in this Excel file.");

  const shared: string[] = [];
  const sst = byName.get("xl/sharedStrings.xml");
  if (sst) {
    const xml = await readEntry(bytes, sst);
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(richText(m[1]));
  }

  const xml = await readEntry(bytes, sheetEntry);
  const rows: Sheet = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
    const row: string[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const body = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = v !== undefined ? (shared[Number(v)] ?? "") : "";
      else if (type === "inlineStr") value = richText(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else value = v !== undefined ? decodeXml(v) : "";
      while (row.length < col) row.push("");
      row[col] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = row;
  }
  return trimSheet(rows);
}

/** Reads an uploaded file by its name: .xlsx or .csv. */
export async function readSpreadsheet(name: string, data: ArrayBuffer): Promise<Sheet> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return readCsv(decoder.decode(data));
  if (lower.endsWith(".xls")) throw new Error("Old .xls files can't be read. In Excel, choose Save As and pick .xlsx (or CSV).");
  return readXlsx(data);
}

/** Cells trimmed; empty rows at the end and trailing empty cells dropped. */
function trimSheet(rows: Sheet): Sheet {
  const out = rows.map((r) => {
    const cells = r.map((c) => (c ?? "").trim());
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    return cells;
  });
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out;
}
