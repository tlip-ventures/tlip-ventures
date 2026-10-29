import { describe, expect, it } from "vitest";
import { cloudinarySignature } from "./cloudinary-sign";

describe("cloudinarySignature", () => {
  it("matches the example in Cloudinary's documentation", async () => {
    // https://cloudinary.com/documentation/authentication_signatures
    const signature = await cloudinarySignature(
      { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" },
      "abcd",
    );
    expect(signature).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
});
