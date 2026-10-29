import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, crc32 } from "./xlsx";

/** Reads the stored (uncompressed) zip back into name → text. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    expect(view.getUint16(at + 8, true)).toBe(0); // stored
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, new TextDecoder().decode(data));
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(files.size);
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("columnName", () => {
  it("names columns like Excel", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
  });
});

describe("buildXlsx", () => {
  const files = unzip(
    buildXlsx("Sales", ["Date", "Reference", "Total", "Items"], [
      ["16 May 2023", "SL_1209", { pesewas: 125050 }, 3],
      ["9 May 2023", "Tom & Jerry <Ltd>", { pesewas: -2000 }, null],
    ]),
  );

  it("has the parts Excel needs", () => {
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Sales"');
  });

  it("writes a bold header, text, money as cedis and numbers", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="2"><is><t xml:space="preserve">Date</t></is></c>');
    expect(sheet).toContain('<c r="C2" s="1"><v>1250.50</v></c>');
    expect(sheet).toContain('<c r="D2"><v>3</v></c>');
    expect(sheet).toContain('<c r="C3" s="1"><v>-20.00</v></c>');
    expect(sheet).toContain("Tom &amp; Jerry &lt;Ltd&gt;");
    expect(sheet).not.toContain('r="D3"');
  });
});
