import { describe, expect, it } from "vitest";
import { safePosPath } from "./paths";

describe("safePosPath", () => {
  it("keeps /pos paths", () => {
    expect(safePosPath("/pos/products?filter=low")).toBe("/pos/products?filter=low");
    expect(safePosPath("/pos")).toBe("/pos");
  });

  it("refuses anything else", () => {
    expect(safePosPath(null)).toBe("/pos");
    expect(safePosPath("https://evil.example")).toBe("/pos");
    expect(safePosPath("/posh")).toBe("/pos");
    expect(safePosPath("/pos//evil.example")).toBe("/pos");
    expect(safePosPath("/pos\\evil")).toBe("/pos");
    expect(safePosPath("/admin")).toBe("/pos");
    expect(safePosPath("/pos/login?next=/pos")).toBe("/pos");
  });
});
