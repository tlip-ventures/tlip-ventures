import { describe, expect, it } from "vitest";
import { cloudinaryShareImage } from "./cloudinary-share";

describe("cloudinaryShareImage", () => {
  it("resizes an uploaded photo for link previews", () => {
    expect(cloudinaryShareImage("https://res.cloudinary.com/tlip/image/upload/v17/tlip/products/blender.jpg")).toBe(
      "https://res.cloudinary.com/tlip/image/upload/c_pad,b_white,w_1200,h_630,f_jpg,q_auto/v17/tlip/products/blender.jpg",
    );
  });

  it("replaces existing transformations but keeps folders", () => {
    expect(cloudinaryShareImage("https://res.cloudinary.com/tlip/image/upload/w_300,q_80/v1/a.png")).toBe(
      "https://res.cloudinary.com/tlip/image/upload/c_pad,b_white,w_1200,h_630,f_jpg,q_auto/v1/a.png",
    );
    expect(cloudinaryShareImage("https://res.cloudinary.com/tlip/image/upload/tv_products/a.png")).toContain("/tv_products/a.png");
  });

  it("returns null for other images", () => {
    expect(cloudinaryShareImage("/brand/logo.webp")).toBeNull();
    expect(cloudinaryShareImage("https://example.com/a.jpg")).toBeNull();
  });
});
