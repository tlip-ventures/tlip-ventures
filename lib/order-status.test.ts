import { describe, expect, it } from "vitest";
import { nextStatus, ORDER_STATUSES, STATUS_LABELS } from "./order-status";

describe("order statuses", () => {
  it("has a label for every database status", () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it("follows the usual flow", () => {
    expect(nextStatus("awaiting_whatsapp")).toBe("confirmed");
    expect(nextStatus("confirmed")).toBe("paid");
    expect(nextStatus("paid")).toBe("dispatched");
    expect(nextStatus("dispatched")).toBe("delivered");
    expect(nextStatus("delivered")).toBeNull();
    expect(nextStatus("cancelled")).toBeNull();
    expect(nextStatus("not_sent")).toBeNull();
  });
});
