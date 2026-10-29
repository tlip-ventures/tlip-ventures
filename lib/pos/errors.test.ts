import { describe, expect, it } from "vitest";
import { duplicateField, friendlyDbError } from "./errors";

describe("friendlyDbError", () => {
  it("passes on the stock functions' own messages", () => {
    expect(friendlyDbError({ code: "TV001", message: "Only 2 left on the shelf." })).toBe("Only 2 left on the shelf.");
    expect(friendlyDbError({ code: "TV002", message: "Mark TV-1042 as paid in Stock and sales first." })).toBe("Mark TV-1042 as paid in Stock and sales first.");
    expect(friendlyDbError({ code: "42501", message: "You are not allowed to count or adjust stock." })).toBe(
      "You are not allowed to count or adjust stock.",
    );
  });

  it("explains duplicates", () => {
    const sku = { code: "23505", message: 'duplicate key value violates unique constraint "product_variants_sku_key"' };
    const barcode = { code: "23505", message: 'duplicate key value violates unique constraint "product_variants_barcode_key"' };
    expect(friendlyDbError(sku)).toBe("Another product already uses this code.");
    expect(duplicateField(sku)).toBe("sku");
    expect(duplicateField(barcode)).toBe("barcode");
    expect(duplicateField({ code: "22023", message: "x" })).toBeNull();
  });

  it("hides internal errors", () => {
    expect(friendlyDbError({ code: "XX000", message: "relation does not exist" })).toBe("Something went wrong. Please try again.");
    expect(friendlyDbError(null, "Could not save.")).toBe("Could not save.");
  });
});
