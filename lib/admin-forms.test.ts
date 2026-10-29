import { describe, expect, it } from "vitest";
import { categorySchema, firstErrors, settingsSchema, socialLabel, socialLinksJson } from "./admin-forms";

const settings = {
  storeName: " Tlip Ventures ",
  whatsappNumber: "024 123 4567",
  tagline: "Judges 6:24",
  shopAddress: "",
  openingHours: "Mon–Sat 8am–6pm",
  announcement: "  ",
  contactEmail: " tlipventures@gmail.com ",
  responsePromise: " We reply within 30 minutes ",
  replyOpen: "07:00",
  replyClose: "19:30",
  replyDays: [6, 1, 2, 3, 4, 5, 1],
  social: { facebook: "https://facebook.com/tlip", instagram: "", tiktok: "", youtube: "", x: "" },
};

describe("settingsSchema", () => {
  it("normalises the WhatsApp number and empties blank fields", () => {
    expect(settingsSchema.parse(settings)).toMatchObject({
      storeName: "Tlip Ventures",
      whatsappNumber: "233241234567",
      shopAddress: null,
      announcement: null,
      contactEmail: "tlipventures@gmail.com",
      social: { facebook: "https://facebook.com/tlip", instagram: null },
    });
  });

  it("rejects a bad number and non-https links", () => {
    const result = settingsSchema.safeParse({
      ...settings,
      whatsappNumber: "+44 7700 900000",
      contactEmail: "tlipventures.gmail.com",
      social: { ...settings.social, instagram: "javascript:alert(1)", tiktok: "http://tiktok.com/@tlip" },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(firstErrors(result.error)).sort()).toEqual(["contactEmail", "social.instagram", "social.tiktok", "whatsappNumber"]);
  });

  it("keeps the reply promise and tidies the reply days", () => {
    expect(settingsSchema.parse(settings)).toMatchObject({
      responsePromise: "We reply within 30 minutes",
      replyOpen: "07:00",
      replyClose: "19:30",
      replyDays: [1, 2, 3, 4, 5, 6],
    });
  });

  it("checks the reply times", () => {
    const errors = (over: Partial<typeof settings>) => {
      const result = settingsSchema.safeParse({ ...settings, ...over });
      return result.success ? {} : firstErrors(result.error);
    };
    expect(errors({ replyClose: "" })).toEqual({ replyClose: "Fill in both reply times, or leave both empty." });
    expect(errors({ replyOpen: "", replyClose: "", replyDays: [] })).toEqual({});
    expect(errors({ replyClose: "06:00" })).toEqual({ replyClose: "The closing time must be after the opening time." });
    expect(errors({ replyOpen: "7am" })).toMatchObject({ replyOpen: "Use a time like 07:00 or 19:30." });
    expect(errors({ replyDays: [] })).toEqual({ replyDays: "Tick at least one day you reply." });
  });

  it("leaves the contact email optional", () => {
    expect(settingsSchema.parse({ ...settings, contactEmail: "" }).contactEmail).toBeNull();
  });

  it("names social networks for display", () => {
    expect(socialLabel("tiktok")).toBe("TikTok");
    expect(socialLabel("instagram")).toBe("Instagram");
    expect(socialLabel("threads")).toBe("threads");
  });

  it("stores only filled-in social links", () => {
    expect(socialLinksJson({ facebook: "https://facebook.com/tlip", instagram: null, tiktok: null, youtube: null, x: null })).toEqual({
      facebook: "https://facebook.com/tlip",
    });
  });
});

describe("categorySchema", () => {
  it("reads a new subcategory", () => {
    expect(
      categorySchema.parse({ id: null, name: " Mugs ", slug: "mugs", parentId: "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01", sortOrder: "40" }),
    ).toEqual({ id: null, name: "Mugs", slug: "mugs", parentId: "0b6f8f1e-6a7f-4f7e-9a51-6f3e2a1c9d01", sortOrder: 40 });
  });

  it("treats an empty parent as a main category and checks the slug", () => {
    expect(categorySchema.parse({ id: null, name: "Bathroom", slug: "bathroom", parentId: "", sortOrder: "0" }).parentId).toBeNull();
    expect(categorySchema.safeParse({ id: null, name: "x", slug: "Not OK", parentId: "", sortOrder: "0" }).success).toBe(false);
  });
});
