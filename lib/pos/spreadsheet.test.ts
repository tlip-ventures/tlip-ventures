import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { columnIndex, decodeXml, readCsv, readSpreadsheet, readXlsx } from "./spreadsheet";
import { buildXlsx, crc32 } from "./xlsx";

/** A zip with deflated entries, like Excel writes. */
function deflatedZip(files: [string, string][]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = enc.encode(text);
    const data = new Uint8Array(deflateRawSync(raw));
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(raw), true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(raw), true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of all) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

describe("readCsv", () => {
  it("reads quotes, commas and line ends", () => {
    expect(readCsv('Name,Price\r\n"Blender, 1.5L",450\n"Say ""hi""",12.50\n')).toEqual([
      ["Name", "Price"],
      ["Blender, 1.5L", "450"],
      ['Say "hi"', "12.50"],
    ]);
  });

  it("reads semicolon files and drops trailing blank rows", () => {
    expect(readCsv("﻿Name;Qty\nKettle;3\n\n\n")).toEqual([
      ["Name", "Qty"],
      ["Kettle", "3"],
    ]);
  });
});

describe("readXlsx", () => {
  it("reads back a workbook written by the app (stored entries)", async () => {
    const file = buildXlsx("Stock", ["Product", "Price", "Qty"], [["Kettle & cup", { pesewas: 125050 }, 3], ["Mat", null, -4]]);
    expect(await readXlsx(file)).toEqual([
      ["Product", "Price", "Qty"],
      ["Kettle & cup", "1250.50", "3"],
      ["Mat", "", "-4"],
    ]);
  });

  it("reads Excel's shared strings, rich text, gaps and deflated entries", async () => {
    const zip = deflatedZip([
      ["xl/workbook.xml", '<workbook><sheets><sheet name="Sales" sheetId="1" r:id="rId3"/></sheets></workbook>'],
      ["xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId3" Target="worksheets/sheet2.xml"/></Relationships>'],
      ["xl/sharedStrings.xml", "<sst><si><t>Ref</t></si><si><r><t>Cus</t></r><r><t>tomer</t></r></si><si><t>Ama &amp; Kofi</t></si></sst>"],
      [
        "xl/worksheets/sheet2.xml",
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="3"><c r="A3"><v>1209</v></c><c r="C3" t="s"><v>2</v></c><c r="D3" t="b"><v>1</v></c></row></sheetData></worksheet>',
      ],
    ]);
    expect(await readXlsx(zip)).toEqual([["Ref", "", "Customer"], [], ["1209", "", "Ama & Kofi", "TRUE"]]);
  });

  it("refuses files that aren't .xlsx", async () => {
    await expect(readXlsx(new TextEncoder().encode("not a zip at all, just some text here"))).rejects.toThrow(/isn't an Excel/);
    await expect(readSpreadsheet("old.xls", new ArrayBuffer(8))).rejects.toThrow(/Save As/);
  });
});

describe("helpers", () => {
  it("column letters and XML entities", () => {
    expect([columnIndex("A1"), columnIndex("Z9"), columnIndex("AB7")]).toEqual([0, 25, 27]);
    expect(decodeXml("&lt;b&gt; &#8373; &#x20B5; &quot;x&quot;")).toBe('<b> ₵ ₵ "x"');
  });
});
