import { render, screen, within } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsRateLimitsPage from "../app/ops/rate-limits/page";
import { vi } from "vitest";

type JsonResp = { ok: boolean; status: number; json: () => Promise<any> };

function jsonResponse(data: any, status = 200): JsonResp {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function setupFetch() {
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
  const db_overrides = [
    { scope: "flag-submit", user_rate: "10/min", ip_rate: "30/min", updated_at: new Date().toISOString() },
  ];
  const presets = { presets: {}, env_presets: {} };

  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();
    if (url === "/api/users/me" && method === "GET") {
      return Promise.resolve(jsonResponse({ isSuperuser: true, isStaff: true }));
    }
    if (url?.startsWith("/api/ops/rate-limits") && method === "GET") {
      return Promise.resolve(jsonResponse({ defaults, db_overrides, effective, cache: {} }));
    }
    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(presets));
    }
    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });

  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

describe("Ops Rate Limits tables", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows flag-submit in both Effective Rates and DB Overrides sections", async () => {
    setupFetch();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    const occurrences = await screen.findAllByText("flag-submit");
    // Expect two occurrences: one in each table
    expect(occurrences.length).toBeGreaterThanOrEqual(2);

    // Identify which section each belongs to
    const sections = occurrences.map((el) => {
      const row = el.closest("tr")!;
      const section = row.closest("section")!;
      const heading = section.querySelector("h2")!;
      return heading.textContent || "";
    });

    // Should contain both section headings
    expect(sections).toContain("Effective Rates");
    expect(sections).toContain("DB Overrides");

    // For completeness, verify each row has a Clear cache button
    for (const el of occurrences) {
      const row = el.closest("tr")!;
      const clearBtn = within(row).getByRole("button", { name: /Clear cache/i });
      expect(clearBtn).toBeTruthy();
    }
  });
});