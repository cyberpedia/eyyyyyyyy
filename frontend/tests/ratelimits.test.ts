import { rateToPerMinute, computeDryRunRows } from "../components/ratelimits";

describe("rateToPerMinute", () => {
  it("handles seconds, minutes, hours, day", () => {
    expect(rateToPerMinute("1/sec")).toBe(60);
    expect(rateToPerMinute("10/min")).toBe(10);
    expect(rateToPerMinute("120/hour")).toBeCloseTo(2, 5); // 120/hour == 2/min
    expect(rateToPerMinute("1440/day")).toBeCloseTo(1, 5); // 1440/day == 1/min
  });

  it("returns undefined for invalid formats", () => {
    expect(rateToPerMinute("foo")).toBeUndefined();
    expect(rateToPerMinute("10/unknown")).toBeUndefined();
  });
});

describe("computeDryRunRows", () => {
  const defaults = {
    "flag-submit": "10/min",
    "flag-submit-ip": "30/min",
    login: "5/min",
    "login-ip": "5/min",
  };
  const effective = {
    "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
    login: { user_rate: "5/min", ip_rate: "5/min" },
  };

  it("computes direction up/down/same and fallback flags", () => {
    const overrides = {
      "flag-submit": { user_rate: "20/min", ip_rate: "" }, // user up, ip fallback to default
      login: { user_rate: "5/min", ip_rate: "1/min" }, // same user, ip down
    };
    const rows = computeDryRunRows(effective as any, defaults as any, overrides as any);
    const fsRow = rows.find((r) => r.scope === "flag-submit")!;
    const loginRow = rows.find((r) => r.scope === "login")!;

    expect(fsRow.user_direction).toBe("up");
    expect(fsRow.ip_direction).toBe("same");
    expect(fsRow.user_fallback).toBe(false);
    expect(fsRow.ip_fallback).toBe(true);
    expect(fsRow.new_ip_rate).toBe(defaults["flag-submit-ip"]);

    expect(loginRow.user_direction).toBe("same");
    expect(loginRow.ip_direction).toBe("down");
    expect(loginRow.user_fallback).toBe(false);
    expect(loginRow.ip_fallback).toBe(false);
  });

  it("handles missing effective values by falling back to defaults", () => {
    const overrides = {
      "new-scope": { user_rate: "1/min", ip_rate: "" },
    };
    const rows = computeDryRunRows({} as any, defaults as any, overrides as any);
    const row = rows.find((r) => r.scope === "new-scope")!;
    expect(row.current_user_rate).toBe(defaults["new-scope"]); // undefined in defaults too => undefined
    expect(row.new_ip_rate).toBe(defaults["new-scope-ip"]); // may be undefined if default doesn't exist
    // We only assert the fallback flag is true for ip
    expect(row.ip_fallback).toBe(true);
  });
});