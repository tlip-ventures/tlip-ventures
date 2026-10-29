import { describe, expect, it } from "vitest";
import { cloudinaryPublicId } from "./cloudinary-url";

describe("cloudinaryPublicId", () => {
  it("strips transformations, version and extension", () => {
    expect(cloudinaryPublicId("https://res.cloudinary.com/t/image/upload/w_400,q_auto/v17/tlip/products/a.jpg")).toBe("tlip/products/a");
    expect(cloudinaryPublicId("https://res.cloudinary.com/t/image/upload/v1/blender.png")).toBe("blender");
    expect(cloudinaryPublicId("https://res.cloudinary.com/t/image/upload/tv_products/a.webp")).toBe("tv_products/a");
  });

  it("returns null for other URLs", () => {
    expect(cloudinaryPublicId("https://example.com/a.jpg")).toBeNull();
  });
});
