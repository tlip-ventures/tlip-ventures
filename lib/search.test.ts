import { describe, expect, it } from "vitest";
import { toPrefixTsQuery } from "./search";

describe("toPrefixTsQuery", () => {
  it("matches each word as a prefix", () => {
    expect(toPrefixTsQuery("blend")).toBe("blend:*");
    expect(toPrefixTsQuery("Foldable stool")).toBe("foldable:* & stool:*");
  });

  it("drops punctuation and tsquery operators", () => {
    expect(toPrefixTsQuery("1.5L blender!")).toBe("1:* & 5l:* & blender:*");
    expect(toPrefixTsQuery("pots & pans | !lids")).toBe("pots:* & pans:* & lids:*");
    expect(toPrefixTsQuery("kettle:* <-> 'x'")).toBe("kettle:* & x:*");
  });

  it("keeps accented letters", () => {
    expect(toPrefixTsQuery("Café")).toBe("café:*");
  });

  it("removes duplicates and caps the number of words", () => {
    expect(toPrefixTsQuery("iron Iron IRON")).toBe("iron:*");
    expect(toPrefixTsQuery("a b c d e f g h i j")).toBe("a:* & b:* & c:* & d:* & e:* & f:* & g:* & h:*");
  });

  it("returns null when there is nothing to search for", () => {
    expect(toPrefixTsQuery("")).toBeNull();
    expect(toPrefixTsQuery("   ")).toBeNull();
    expect(toPrefixTsQuery("&|!()")).toBeNull();
  });
});
