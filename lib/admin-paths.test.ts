import { describe, expect, it } from "vitest";
import { safeAdminPath } from "./admin-paths";

describe("safeAdminPath", () => {
  it("keeps admin paths", () => {
    expect(safeAdminPath("/admin")).toBe("/admin");
    expect(safeAdminPath("/admin/orders?status=confirmed")).toBe("/admin/orders?status=confirmed");
  });

  it("falls back to /admin for anything else", () => {
    for (const next of [null, undefined, "", "/", "/administrator", "https://evil.example/admin", "//evil.example/admin", "/admin//evil.example", "/admin\\evil", "javascript:alert(1)"]) {
      expect(safeAdminPath(next)).toBe("/admin");
    }
  });
});
