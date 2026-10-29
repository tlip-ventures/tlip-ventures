import { describe, expect, it } from "vitest";
import { cloudinaryUrl } from "./cloudinary-loader";

const CLOUD = "tlip";

describe("cloudinaryUrl", () => {
  it("builds a URL from a public ID", () => {
    expect(cloudinaryUrl({ src: "products/blender-black", width: 640 }, CLOUD)).toBe(
      "https://res.cloudinary.com/tlip/image/upload/f_auto,q_auto,c_limit,w_640/products/blender-black",
    );
  });

  it("uses an explicit quality when given", () => {
    expect(cloudinaryUrl({ src: "products/kettle", width: 320, quality: 60 }, CLOUD)).toBe(
      "https://res.cloudinary.com/tlip/image/upload/f_auto,q_60,c_limit,w_320/products/kettle",
    );
  });

  it("rewrites a full Cloudinary URL, keeping the version", () => {
    expect(
      cloudinaryUrl(
        { src: "https://res.cloudinary.com/other/image/upload/v1712345/products/stool.jpg", width: 384 },
        CLOUD,
      ),
    ).toBe("https://res.cloudinary.com/other/image/upload/f_auto,q_auto,c_limit,w_384/v1712345/products/stool.jpg");
  });

  it("replaces existing transformations in a Cloudinary URL", () => {
    expect(
      cloudinaryUrl(
        { src: "https://res.cloudinary.com/tlip/image/upload/w_2000,q_90/v1/products/iron.jpg", width: 256 },
        CLOUD,
      ),
    ).toBe("https://res.cloudinary.com/tlip/image/upload/f_auto,q_auto,c_limit,w_256/v1/products/iron.jpg");
  });

  it("does not mistake a folder name for a transformation", () => {
    expect(
      cloudinaryUrl({ src: "https://res.cloudinary.com/tlip/image/upload/tv_products/iron.jpg", width: 256 }, CLOUD),
    ).toBe("https://res.cloudinary.com/tlip/image/upload/f_auto,q_auto,c_limit,w_256/tv_products/iron.jpg");
  });

  it("passes local files through with a width parameter", () => {
    expect(cloudinaryUrl({ src: "/brand/logo.webp", width: 128 }, CLOUD)).toBe("/brand/logo.webp?w=128");
  });

  it("throws for a public ID when no cloud name is configured", () => {
    expect(() => cloudinaryUrl({ src: "products/kettle", width: 320 }, undefined)).toThrow(
      /NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/,
    );
  });
});
