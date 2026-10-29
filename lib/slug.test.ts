import { describe, expect, it } from "vitest";
import { slugSchema } from "./listing";
import { slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Blender 1.5L", "blender-1-5l"],
    ["Stand & Hand Mixers", "stand-and-hand-mixers"],
    ["  Café   Crème  ", "cafe-creme"],
    ["Kettle (Black) -- 2L!", "kettle-black-2l"],
    ["!!!", ""],
  ])("%s → %s", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("produces slugs the database accepts", () => {
    for (const name of ["Water Dispenser Hot & Cold", "3-Tier Kitchen Rack", "x".repeat(300)]) {
      expect(slugSchema.safeParse(slugify(name)).success).toBe(true);
    }
  });
});
