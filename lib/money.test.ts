import { describe, expect, it } from "vitest";
import { formatPesewas, lineTotal, parseCedis, pesewasToDecimal, pesewasToInput, sumPesewas } from "./money";

describe("formatPesewas", () => {
  it("drops decimals for whole cedis", () => {
    expect(formatPesewas(45000)).toBe("GH₵ 450");
    expect(formatPesewas(24000)).toBe("GH₵ 240");
    expect(formatPesewas(0)).toBe("GH₵ 0");
  });

  it("shows two decimals when there are pesewas", () => {
    expect(formatPesewas(125050)).toBe("GH₵ 1,250.50");
    expect(formatPesewas(1)).toBe("GH₵ 0.01");
    expect(formatPesewas(99)).toBe("GH₵ 0.99");
    expect(formatPesewas(1005)).toBe("GH₵ 10.05");
  });

  it("groups thousands", () => {
    expect(formatPesewas(100000)).toBe("GH₵ 1,000");
    expect(formatPesewas(123456789)).toBe("GH₵ 1,234,567.89");
    expect(formatPesewas(100000000)).toBe("GH₵ 1,000,000");
  });

  it("formats negative amounts", () => {
    expect(formatPesewas(-125050)).toBe("-GH₵ 1,250.50");
  });

  it("rejects non-integer or unsafe values", () => {
    expect(() => formatPesewas(450.5)).toThrow(TypeError);
    expect(() => formatPesewas(Number.NaN)).toThrow(TypeError);
    expect(() => formatPesewas(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => formatPesewas(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
  });
});

describe("lineTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotal(12000, 2)).toBe(24000);
    expect(lineTotal(45000, 0)).toBe(0);
  });

  it("rejects fractional or negative quantities", () => {
    expect(() => lineTotal(12000, 1.5)).toThrow(TypeError);
    expect(() => lineTotal(12000, -1)).toThrow(TypeError);
    expect(() => lineTotal(120.5, 1)).toThrow(TypeError);
  });
});

describe("sumPesewas", () => {
  it("adds amounts", () => {
    expect(sumPesewas([45000, 24000])).toBe(69000);
    expect(sumPesewas([])).toBe(0);
  });

  it("rejects floats", () => {
    expect(() => sumPesewas([100, 0.1])).toThrow(TypeError);
  });
});

describe("parseCedis", () => {
  it.each([
    ["450", 45000],
    ["1,250.50", 125050],
    ["1250.5", 125050],
    ["0.01", 1],
    ["GH₵ 12.05", 1205],
    ["ghs 10", 1000],
    [" 99 ", 9900],
    ["0", 0],
  ])("reads %s", (input, expected) => {
    expect(parseCedis(input)).toBe(expected);
  });

  it.each([[""], ["abc"], ["-5"], ["1.234"], ["1e3"], ["12.3.4"], ["123456789"], ["0.1.0"]])("rejects %s", (input) => {
    expect(parseCedis(input)).toBeNull();
  });

  it("avoids float rounding errors", () => {
    expect(parseCedis("0.29")).toBe(29);
    expect(parseCedis("1.15")).toBe(115);
  });
});

describe("pesewasToInput", () => {
  it("round-trips with parseCedis", () => {
    for (const p of [0, 1, 99, 45000, 125050, 99999999]) {
      expect(parseCedis(pesewasToInput(p))).toBe(p);
    }
    expect(pesewasToInput(125050)).toBe("1250.50");
    expect(pesewasToInput(null)).toBe("");
  });
});

describe("pesewasToDecimal", () => {
  it("always shows two decimals", () => {
    expect(pesewasToDecimal(45000)).toBe("450.00");
    expect(pesewasToDecimal(125050)).toBe("1250.50");
    expect(pesewasToDecimal(5)).toBe("0.05");
    expect(pesewasToDecimal(-150)).toBe("-1.50");
  });
});
