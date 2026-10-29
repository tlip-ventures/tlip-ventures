import { describe, expect, it } from "vitest";
import { formatDay, formatDayTime, formatLongDay, initials, personName, phoneText, plural } from "./format";

describe("dates in Ghana time", () => {
  it("formats days like the design", () => {
    expect(formatDay("2023-05-16T10:00:00Z")).toBe("16 May 2023");
    expect(formatLongDay("2026-10-29T08:00:00Z")).toBe("Thursday, 29 October 2026");
  });

  it("uses GMT, not the device's time zone", () => {
    expect(formatDayTime("2026-10-29T23:30:00Z")).toBe("29 Oct 2026, 23:30");
  });
});

describe("names", () => {
  it("makes initials", () => {
    expect(initials("Owner")).toBe("OW");
    expect(initials("Ama Mensah")).toBe("AM");
    expect(initials("Ama Serwaa Mensah")).toBe("AM");
    expect(initials("  ")).toBe("?");
    expect(initials("Preview (temporary)")).toBe("PT");
  });

  it("falls back to the role", () => {
    expect(personName(null, "owner")).toBe("Owner");
    expect(personName(" ", "staff")).toBe("Staff");
    expect(personName("Ama", "staff")).toBe("Ama");
  });

  it("pluralises", () => {
    expect(plural(1, "product")).toBe("1 product");
    expect(plural(1250, "product")).toBe("1,250 products");
  });
});

describe("phoneText", () => {
  it("formats stored numbers and leaves others alone", () => {
    expect(phoneText("233241234567")).toBe("024 123 4567");
    expect(phoneText("12345")).toBe("12345");
    expect(phoneText(null)).toBeNull();
  });
});
