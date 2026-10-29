import { describe, expect, it } from "vitest";
import { buildCategoryTree, categoryAndChildIds, categoryPath, type Category } from "./categories";

const cat = (id: string, parent_id: string | null, sort_order: number, name = id): Category => ({
  id,
  name,
  slug: id,
  parent_id,
  image_url: null,
  sort_order,
});

const categories = [
  cat("laundry", null, 50),
  cat("kitchen", null, 10),
  cat("kettles", "kitchen", 50),
  cat("blenders", "kitchen", 10),
  cat("irons", "laundry", 20),
  cat("juicers", "kitchen", 20),
];

describe("buildCategoryTree", () => {
  it("nests subcategories under their parents in sort order", () => {
    const tree = buildCategoryTree(categories);
    expect(tree.map((c) => c.id)).toEqual(["kitchen", "laundry"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["blenders", "juicers", "kettles"]);
    expect(tree[1].children.map((c) => c.id)).toEqual(["irons"]);
  });

  it("breaks sort_order ties by name", () => {
    const tree = buildCategoryTree([cat("b", null, 1, "Bathroom"), cat("a", null, 1, "Appliances")]);
    expect(tree.map((c) => c.name)).toEqual(["Appliances", "Bathroom"]);
  });
});

describe("categoryAndChildIds", () => {
  it("includes the category and its direct subcategories", () => {
    expect(categoryAndChildIds(categories, categories[1])).toEqual(["kitchen", "kettles", "blenders", "juicers"]);
    expect(categoryAndChildIds(categories, categories[2])).toEqual(["kettles"]);
  });
});

describe("categoryPath", () => {
  it("lists ancestors from the top down", () => {
    expect(categoryPath(categories, categories[3]).map((c) => c.id)).toEqual(["kitchen", "blenders"]);
    expect(categoryPath(categories, categories[0]).map((c) => c.id)).toEqual(["laundry"]);
  });

  it("stops on a parent loop", () => {
    const loop = [cat("x", "y", 1), cat("y", "x", 1)];
    expect(categoryPath(loop, loop[0]).length).toBeLessThanOrEqual(10);
  });
});
