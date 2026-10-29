import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("reads plain and quoted cells", () => {
    expect(parseCsv('a,b,c\n1,"two, with comma","say ""hi"""\n')).toEqual([
      ["a", "b", "c"],
      ["1", "two, with comma", 'say "hi"'],
    ]);
  });

  it("handles CRLF, a BOM, line breaks inside quotes and blank lines", () => {
    expect(parseCsv('﻿name,description\r\nKettle,"Line one\r\nLine two"\r\n\r\n,\r\nStool,x')).toEqual([
      ["name", "description"],
      ["Kettle", "Line one\r\nLine two"],
      ["Stool", "x"],
    ]);
  });

  it("keeps empty cells", () => {
    expect(parseCsv("a,,c\n,,x")).toEqual([
      ["a", "", "c"],
      ["", "", "x"],
    ]);
  });

  it("reports an unclosed quote", () => {
    expect(() => parseCsv('a,"open\n')).toThrow(/closing/);
  });
});

describe("toCsv", () => {
  it("round-trips through parseCsv", () => {
    const rows = [
      ["slug", "description", "price"],
      ["blender", 'Glass jar, 1.5L "heavy"\nTwo speeds', "450"],
      ["stool", " padded ", ""],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
