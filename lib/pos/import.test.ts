import { describe, expect, it } from "vitest";
import {
  autoMap,
  checkImport,
  findHeaderRow,
  missingFields,
  parseDateCell,
  parseIntCell,
  parseMoneyCell,
  paymentMethodOf,
  recordCode,
} from "./import";

describe("cells", () => {
  it("reads money as pesewas without floats", () => {
    expect(parseMoneyCell("GH₵ 1,250.50")).toBe(125050);
    expect(parseMoneyCell("450")).toBe(45000);
    expect(parseMoneyCell("12.5")).toBe(1250);
    expect(parseMoneyCell("449.99999999999994")).toBe(45000);
    expect(parseMoneyCell("0.005")).toBe(1);
    expect(parseMoneyCell("GHS 99")).toBe(9900);
    expect(parseMoneyCell("-5")).toBeNull();
    expect(parseMoneyCell("abc")).toBeNull();
  });

  it("reads whole numbers", () => {
    expect([parseIntCell("12"), parseIntCell("1,200"), parseIntCell("-4"), parseIntCell("3.0")]).toEqual([12, 1200, -4, 3]);
    expect(parseIntCell("2.5")).toBeNull();
  });

  it("reads dates day first, Excel numbers and month names", () => {
    expect(parseDateCell("16/05/2023")).toBe("2023-05-16T00:00:00.000Z");
    expect(parseDateCell("16/05/2023 14:05")).toBe("2023-05-16T14:05:00.000Z");
    expect(parseDateCell("2023-05-16 2:05 pm")).toBe("2023-05-16T14:05:00.000Z");
    expect(parseDateCell("16-05-23")).toBe("2023-05-16T00:00:00.000Z");
    expect(parseDateCell("16 May 2023")).toBe("2023-05-16T00:00:00.000Z");
    expect(parseDateCell("16-Sept-2023")).toBe("2023-09-16T00:00:00.000Z");
    expect(parseDateCell("May 16, 2023")).toBe("2023-05-16T00:00:00.000Z");
    expect(parseDateCell("45062")).toBe("2023-05-16T00:00:00.000Z");
    expect(parseDateCell("45062.5")).toBe("2023-05-16T12:00:00.000Z");
    expect(parseDateCell("31/02/2023")).toBeNull();
    expect(parseDateCell("yesterday")).toBeNull();
  });

  it("payment methods and record numbers", () => {
    expect([paymentMethodOf("MTN MoMo"), paymentMethodOf("Bank transfer"), paymentMethodOf("Cash"), paymentMethodOf("")]).toEqual([
      "momo",
      "bank",
      "cash",
      "cash",
    ]);
    expect([recordCode(" sl_1209 ", "SL_"), recordCode("1209", "SL_"), recordCode("77", "PR_")]).toEqual(["SL_1209", "SL_1209", "PR_77"]);
  });
});

describe("headers", () => {
  it("maps common header names", () => {
    const map = autoMap("products", ["Item Name", "Code", "Selling Price (GHS)", "Cost Price", "Qty", "Category"]);
    expect(map).toMatchObject({ name: 0, sku: 1, price: 2, cost: 3, qty: 4, category: 5, barcode: -1, reorder: -1 });
    expect(missingFields("products", map)).toEqual([]);
    expect(missingFields("products", { ...map, price: -1 }).map((f) => f.key)).toEqual(["price"]);
  });

  it("finds the header row under a report title", () => {
    const sheet = [["Sales report"], ["From 1/1/2023 to 31/12/2023"], [], ["Reference", "Date", "Customer", "Total", "Paid"], ["SL_1", "1/2/2023", "Ama", "10", "10"]];
    expect(findHeaderRow("sales", sheet)).toBe(3);
  });
});

describe("checkImport", () => {
  it("products: errors per row, duplicates caught", () => {
    const sheet = [
      ["Name", "SKU", "Price", "Cost", "Stock"],
      ["Blender 1.5L", "BL-15", "450", "280", "5"],
      ["Mat", "", "abc", "", "-4"],
      ["Kettle", "bl-15", "120", "", ""],
      ["", "", "", "", ""],
      ["Stool", "", "120", "", "2.5"],
    ];
    const { result } = checkImport("products", sheet, 0, autoMap("products", sheet[0])) as Extract<ReturnType<typeof checkImport>, { kind: "products" }>;
    expect(result.rows).toEqual([
      { row: 2, name: "Blender 1.5L", slug: "blender-1-5l", sku: "BL-15", barcode: null, category: null, price: 45000, cost: 28000, qty: 5, reorder: null },
    ]);
    expect(result.errors).toEqual([
      { row: 3, message: "Price “abc” isn't an amount." },
      { row: 4, message: "Same code as row 2." },
      { row: 6, message: "Stock “2.5” isn't a whole number." },
    ]);
  });

  it("customers: phones checked, walk-ins and repeats left out", () => {
    const sheet = [
      ["Customer", "Phone"],
      ["Ama Mensah", "024 123 4567"],
      ["Walk-in customer", ""],
      ["Ama M.", "+233241234567"],
      ["Kofi", "12345"],
      ["Esi", ""],
    ];
    const { result } = checkImport("customers", sheet, 0, autoMap("customers", sheet[0])) as Extract<ReturnType<typeof checkImport>, { kind: "customers" | "suppliers" }>;
    expect(result.rows).toEqual([
      { row: 2, name: "Ama Mensah", phone: "233241234567" },
      { row: 6, name: "Esi", phone: null },
    ]);
    expect(result.skipped.map((s) => s.row)).toEqual([3, 4]);
    expect(result.errors).toEqual([{ row: 5, message: "“12345” isn't a Ghana phone number. Fix it or clear the cell." }]);
  });

  it("sales: one row per sale, with what is still owed", () => {
    const sheet = [
      ["Ref", "Date", "Customer", "Total", "Balance", "Payment method", "Status"],
      ["SL_1209", "16/05/2023", "Ama", "385", "0", "MoMo", "Completed"],
      ["1210", "17/05/2023", "", "500", "200", "Cash", ""],
      ["SL_1211", "17/05/2023", "", "90", "", "", "Cancelled"],
      ["SL_1212", "someday", "", "90", "", "", ""],
    ];
    const { result } = checkImport("sales", sheet, 0, autoMap("sales", sheet[0])) as Extract<ReturnType<typeof checkImport>, { kind: "sales" | "purchases" }>;
    expect(result.rows).toEqual([
      { row: 2, code: "SL_1209", date: "2023-05-16T00:00:00.000Z", party: "Ama", phone: null, lines: [], total: 38500, paid: 38500, method: "momo" },
      { row: 3, code: "SL_1210", date: "2023-05-17T00:00:00.000Z", party: null, phone: null, lines: [], total: 50000, paid: 30000, method: "cash" },
    ]);
    expect(result.skipped).toEqual([{ row: 4, message: "SL_1211 is cancelled: left out." }]);
    expect(result.errors[0].message).toMatch(/^SL_1212: Date “someday”/);
  });

  it("sales: one row per item, grouped by number", () => {
    const sheet = [
      ["Invoice No", "Date", "Item", "Qty", "Unit Price", "Total"],
      ["SL_7", "1/6/2023", "Blender", "1", "450", "690"],
      ["SL_7", "1/6/2023", "Stool", "2", "120", "690"],
      ["SL_8", "1/6/2023", "Mat", "3", "", "90"],
    ];
    const { result } = checkImport("sales", sheet, 0, autoMap("sales", sheet[0])) as Extract<ReturnType<typeof checkImport>, { kind: "sales" | "purchases" }>;
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      code: "SL_7",
      total: 69000,
      paid: 69000,
      lines: [
        { name: "Blender", qty: 1, unitPrice: 45000, unitCost: null },
        { name: "Stool", qty: 2, unitPrice: 12000, unitCost: null },
      ],
    });
    expect(result.rows[1]).toMatchObject({ code: "SL_8", total: 9000, lines: [{ name: "Mat", qty: 3, unitPrice: 0 }] });
  });

  it("purchases need a supplier", () => {
    const sheet = [
      ["PO Number", "Date", "Supplier", "Amount", "Amount Paid"],
      ["PR_1", "2023-03-01", "Hot Kumasi", "1,200", "700"],
      ["PR_2", "2023-03-02", "", "50", ""],
    ];
    const { result } = checkImport("purchases", sheet, 0, autoMap("purchases", sheet[0])) as Extract<ReturnType<typeof checkImport>, { kind: "sales" | "purchases" }>;
    expect(result.rows).toEqual([
      { row: 2, code: "PR_1", date: "2023-03-01T00:00:00.000Z", party: "Hot Kumasi", phone: null, lines: [], total: 120000, paid: 70000, method: "cash" },
    ]);
    expect(result.errors).toEqual([{ row: 3, message: "PR_2: No supplier." }]);
  });
});
