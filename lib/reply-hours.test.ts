import { describe, expect, it } from "vitest";
import { closedMessage, formatDays, formatReplyHours, formatTime, replyStatus, settingsReplyHours } from "./reply-hours";

const shop = { days: [1, 2, 3, 4, 5, 6], open: "07:00:00", close: "19:30:00" };
// Ghana is GMT all year, so these UTC times are Ghana times. 2026-10-23 is a Friday.
const at = (iso: string) => new Date(`${iso}Z`);

describe("formatting", () => {
  it("writes times the way people say them", () => {
    expect(formatTime("07:00")).toBe("7am");
    expect(formatTime("19:30:00")).toBe("7:30pm");
    expect(formatTime("12:00")).toBe("12pm");
    expect(formatTime("00:15")).toBe("12:15am");
  });

  it("joins runs of days", () => {
    expect(formatDays([1, 2, 3, 4, 5, 6])).toBe("Mon–Sat");
    expect(formatDays([5, 1, 2, 3])).toBe("Mon–Wed, Fri");
    expect(formatDays([6, 7])).toBe("Sat, Sun");
    expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
  });

  it("puts days and times together", () => {
    expect(formatReplyHours(shop)).toBe("Mon–Sat, 7am–7:30pm");
  });
});

describe("replyStatus", () => {
  it("is open inside the hours", () => {
    expect(replyStatus(shop, at("2026-10-23T07:00:00"))).toEqual({ open: true });
    expect(replyStatus(shop, at("2026-10-23T19:29:00"))).toEqual({ open: true });
  });

  it("opens later today before opening time", () => {
    expect(replyStatus(shop, at("2026-10-23T06:10:00"))).toEqual({ open: false, when: "today", at: "7am" });
  });

  it("opens tomorrow after closing", () => {
    expect(replyStatus(shop, at("2026-10-23T19:30:00"))).toEqual({ open: false, when: "tomorrow", at: "7am" });
  });

  it("skips closed days", () => {
    // Saturday evening and Sunday → Monday.
    expect(replyStatus(shop, at("2026-10-24T21:00:00"))).toEqual({ open: false, when: "Monday", at: "7am" });
    expect(replyStatus(shop, at("2026-10-25T12:00:00"))).toEqual({ open: false, when: "tomorrow", at: "7am" });
  });

  it("has nothing to say without reply days", () => {
    expect(replyStatus({ ...shop, days: [] }, at("2026-10-23T12:00:00"))).toBeNull();
  });
});

describe("closedMessage", () => {
  it("names the day", () => {
    expect(closedMessage({ open: false, when: "tomorrow", at: "7am" })).toBe("We're closed now. We'll reply when we open tomorrow at 7am.");
    expect(closedMessage({ open: false, when: "Monday", at: "7am" })).toBe("We're closed now. We'll reply when we open on Monday at 7am.");
  });
});

describe("settingsReplyHours", () => {
  it("needs both times and at least one day", () => {
    expect(settingsReplyHours({ reply_open: "07:00:00", reply_close: "19:30:00", reply_days: [1] })).toEqual({
      days: [1],
      open: "07:00:00",
      close: "19:30:00",
    });
    expect(settingsReplyHours({ reply_open: null, reply_close: null, reply_days: [1] })).toBeNull();
    expect(settingsReplyHours({ reply_open: "07:00", reply_close: "19:30", reply_days: [] })).toBeNull();
  });
});
