import { describe, expect, it } from "vitest";
import { buildOrderMessage, whatsappUrl } from "./whatsapp";

const order = {
  storeName: "Tlip Ventures",
  orderCode: "TV-1042",
  lines: [
    { qty: 1, productName: "Blender 1.5L", optionValues: "Black", lineTotal: 45000 },
    { qty: 2, productName: "Foldable storage stool", optionValues: null, lineTotal: 24000 },
  ],
  itemsTotal: 69000,
  customerName: "Ama Mensah",
  phone: "233241234567",
  location: "Dansoman, near Sharp Curve",
  orderUrl: "https://tlip.example/o/abc123",
};

describe("buildOrderMessage", () => {
  it("matches the format in CLAUDE.md", () => {
    expect(buildOrderMessage(order)).toBe(
      [
        "Hi Tlip Ventures, I'd like to place this order.",
        "Order: TV-1042",
        "1 x Blender 1.5L (Black) - GH₵ 450",
        "2 x Foldable storage stool - GH₵ 240",
        "Items total: GH₵ 690",
        "Name: Ama Mensah | Phone: 024 123 4567",
        "Location: Dansoman, near Sharp Curve",
        "Order link: https://tlip.example/o/abc123",
      ].join("\n"),
    );
  });

  it("shows two option values and pesewas", () => {
    const message = buildOrderMessage({
      ...order,
      lines: [{ qty: 1, productName: "Water Dispenser", optionValues: "White / Large", lineTotal: 125050 }],
      itemsTotal: 125050,
    });
    expect(message).toContain("1 x Water Dispenser (White / Large) - GH₵ 1,250.50");
    expect(message).toContain("Items total: GH₵ 1,250.50");
  });
});

describe("buildOrderMessage location", () => {
  it("puts the location on one line after the name and phone", () => {
    const message = buildOrderMessage({ ...order, location: " Dansoman,\n near  Sharp Curve " });
    const lines = message.split("\n");
    expect(lines[lines.indexOf("Name: Ama Mensah | Phone: 024 123 4567") + 1]).toBe("Location: Dansoman, near Sharp Curve");
  });

  it("comes before the note", () => {
    const lines = buildOrderMessage({ ...order, notes: "Call first" }).split("\n");
    expect(lines.slice(-3)).toEqual([
      "Location: Dansoman, near Sharp Curve",
      "Note: Call first",
      "Order link: https://tlip.example/o/abc123",
    ]);
  });
});

describe("buildOrderMessage notes", () => {
  it("adds the note on one line before the order link", () => {
    const message = buildOrderMessage({ ...order, notes: "  Please call\nbefore   delivery " });
    expect(message.split("\n").slice(-2)).toEqual([
      "Note: Please call before delivery",
      "Order link: https://tlip.example/o/abc123",
    ]);
  });

  it("leaves the line out when there is no note", () => {
    for (const notes of [null, undefined, "", "   "]) {
      expect(buildOrderMessage({ ...order, notes })).not.toContain("Note:");
    }
  });
});

describe("whatsappUrl", () => {
  it("encodes the message", () => {
    expect(whatsappUrl("233241234567", "Hi & bye\nOrder: TV-1 #2")).toBe(
      "https://wa.me/233241234567?text=Hi%20%26%20bye%0AOrder%3A%20TV-1%20%232",
    );
  });

  it("encodes the cedi sign", () => {
    expect(whatsappUrl("233241234567", "GH₵ 450")).toBe("https://wa.me/233241234567?text=GH%E2%82%B5%20450");
  });

  it("links to the chat without a message", () => {
    expect(whatsappUrl("233241234567")).toBe("https://wa.me/233241234567");
  });

  it("rejects numbers in the wrong format", () => {
    expect(() => whatsappUrl("+233241234567")).toThrow();
    expect(() => whatsappUrl("0241234567")).toThrow();
  });
});
