import { describe, it, expect } from "vitest";
import {
  makeCode,
  fmtDate,
  fmtDateTime,
  fmtShortDate,
  fmtTime,
  statusClass,
  typeClass,
  initials,
  isActive,
  isResolved,
  isEmail,
} from "../lib/helpers";

describe("makeCode", () => {
  it("takes the first 3 alphanumerics, uppercased", () => {
    expect(makeCode("Forbes Marshall")).toBe("FOR");
  });
  it("pads short names to 3 chars", () => {
    expect(makeCode("Ab")).toBe("ABX");
  });
  it("avoids collisions against the used set", () => {
    expect(makeCode("Thermax", new Set(["THE"]))).toBe("TH1");
  });
});

describe("fmtDate", () => {
  it("formats an ISO date as '10 July 2026'", () => {
    expect(fmtDate("2026-07-10")).toBe("10 July 2026");
  });
  it("drops the leading zero on single-digit days", () => {
    expect(fmtDate("2026-01-05")).toBe("5 January 2026");
  });
  it("returns an em-dash for empty input", () => {
    expect(fmtDate(undefined)).toBe("—");
  });
});

describe("fmtDateTime", () => {
  it("uses 12-hour time with AM", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 9, 14))).toBe("10 July 2026, 9:14 AM");
  });
  it("uses 12-hour time with PM", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 16, 20))).toBe("10 July 2026, 4:20 PM");
  });
  it("renders midnight as 12:xx AM and pads minutes", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 0, 5))).toBe("10 July 2026, 12:05 AM");
  });
  it("renders noon as 12:00 PM", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 12, 0))).toBe("10 July 2026, 12:00 PM");
  });
});

describe("fmtShortDate", () => {
  it("formats a datetime as constant-width DD/MM/YYYY", () => {
    expect(fmtShortDate("2026-07-10 09:14:00")).toBe("10/07/2026");
  });
  it("zero-pads single-digit day and month", () => {
    expect(fmtShortDate("2026-01-05 09:14:00")).toBe("05/01/2026");
  });
  it("returns an em-dash for empty / unparseable input", () => {
    expect(fmtShortDate(undefined)).toBe("—");
    expect(fmtShortDate("not-a-date")).toBe("—");
  });
});

describe("fmtTime", () => {
  it("uses 12-hour time (AM/PM) and pads minutes", () => {
    expect(fmtTime("2026-07-10 09:14:00")).toBe("9:14 AM");
    expect(fmtTime("2026-07-10 16:20:00")).toBe("4:20 PM");
    expect(fmtTime("2026-07-10 00:05:00")).toBe("12:05 AM");
    expect(fmtTime("2026-07-10 12:00:00")).toBe("12:00 PM");
  });
  it("returns empty string for empty / unparseable input", () => {
    expect(fmtTime(undefined)).toBe("");
    expect(fmtTime("nope")).toBe("");
  });
});

describe("class + label helpers", () => {
  it("maps status to css class", () => {
    expect(statusClass("In Progress")).toBe("s-prog");
    expect(statusClass("Pending Client")).toBe("s-pending");
  });
  it("maps ticket type to css class (New Feature → Feature)", () => {
    expect(typeClass("New Feature")).toBe("type-Feature");
    expect(typeClass("Bug")).toBe("type-Bug");
  });
  it("derives initials", () => {
    expect(initials("Abhishek Bankar")).toBe("AB");
    expect(initials("R. Mehta")).toBe("RM");
  });
  it("classifies active vs resolved states", () => {
    expect(isActive("New")).toBe(true);
    expect(isActive("Closed")).toBe(false);
    expect(isResolved("Resolved")).toBe(true);
    expect(isResolved("In Progress")).toBe(false);
  });
});

describe("isEmail", () => {
  it("accepts a normal address", () => {
    expect(isEmail("r.mehta@thermax.com")).toBe(true);
    expect(isEmail("  name@company.co.in  ")).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(isEmail("")).toBe(false);
    expect(isEmail("notanemail")).toBe(false);
    expect(isEmail("missing@domain")).toBe(false);
    expect(isEmail("@nolocal.com")).toBe(false);
    expect(isEmail("has space@x.com")).toBe(false);
    expect(isEmail("two@@at.com")).toBe(false);
  });
});
