import { render, screen, fireEvent, within } from "@testing-library/react";
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

function setupFetch(initial: {
  defaults: Record<string, string>;
  effective: Record<string, any>;
  db_overrides: Array<{ scope: string; user_rate: string; ip_rate: string; updated_at: string }>;
  presets: any;
  superuser?: boolean;
}) {
  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();

    if (url === "/api/users/me" && method === "GET") {
      return Promise.resolve(jsonResponse({ isSuperuser: !!initial.superuser, isStaff: true }));
    }

    if (url?.startsWith("/api/ops/rate-limits") && method === "GET") {
      return Promise.resolve(
        jsonResponse({
          defaults: initial.defaults,
          db_overrides: initial.db_overrides,
          effective: initial.effective,
          cache: {},
        })
      );
    }

    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(initial.presets));
    }

    if (url === "/api/ops/rate-limits" && method === "POST") {
      // Upsert override; return updated data shape
      return Promise.resolve(
        jsonResponse({
          defaults: initial.defaults,
          db_overrides: initial.db_overrides,
          effective: initial.effective,
          cache: {},
        })
      );
    }

    if (url === "/api/ops/rate-limits/cache" && method === "POST") {
      // Clear cache; return updated data shape
      return Promise.resolve(
        jsonResponse({
          defaults: initial.defaults,
          db_overrides: initial.db_overrides,
          effective: initial.effective,
          cache: {},
        })
      );
    }

    if (url?.startsWith("/api/ops/rate-limits") && method === "GET") {
      return Promise.resolve(
        jsonResponse({
          defaults: initial.defaults,
          db_overrides: initial.db_overrides,
          effective: initial.effective,
          cache: {},
        })
      );
    }

    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });
  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

describe("Ops Rate Limits actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Apply from dry-run posts overrides and reloads", async () => {
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
    const db_overrides: any[] = [];
    const presets = {
      presets: {
        competition: {
          "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
          login: { user_rate: "5/min", ip_rate: "5/min" },
        },
      },
    };

    const fetchMock = setupFetch({ defaults, effective, db_overrides, presets, superuser: true });

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    // Preview competition preset
    const previewBtn = await screen.findByRole("button", { name: /Preview competition/i });
    fireEvent.click(previewBtn);

    // Apply these changes
    const applyBtn = await screen.findByRole("button", { name: /Apply these changes/i });
    fireEvent.click(applyBtn);

    // Expect POST to upsert overrides for each scope
    const postCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(2); // one per scope in preset

    // Reload endpoints should be called
    const calledReloadRates = fetchMock.mock.calls.some(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    );
    const calledReloadPresets = fetchMock.mock.calls.some(
      (c) => c[0] === "/api/ops/rate-limits/presets" && (c[1]?.method || "GET").toUpperCase() === "GET"
    );
    expect(calledReloadRates).toBe(true);
    expect(calledReloadPresets).toBe(true);

    // Success toast
    await screen.findByText(/Applied dry-run overrides\./i);
  });

  it("Per-scope Clear cache posts to cache endpoint and shows success", async () => {
    const defaults = {
      "flag-submit": "10/min",
      "flag-submit-ip": "30/min",
    };
    const effective = {
      "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
    };
    const db_overrides = [
      { scope: "flag-submit", user_rate: "10/min", ip_rate: "30/min", updated_at: new Date().toISOString() },
    ];
    const presets = { presets: {}, env_presets: {} };

    const fetchMock = setupFetch({ defaults, effective, db_overrides, presets, superuser: true });

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );
    await screen.findByText(/Rate Limits \(Ops\)/);

    // Find DB override row for flag-submit and click Clear cache
    const scopeCell = await screen.findByText("flag-submit");
    const row = scopeCell.closest("tr")!;
    const clearBtn = within(row).getByRole("button", { name: /Clear cache/i });
    fireEvent.click(clearBtn);

    // Confirm modal: click Confirm clear
    const confirmBtn = await screen.findByRole("button", { name: /Confirm clear/i });
    fireEvent.click(confirmBtn);

    // Expect POST to cache endpoint
    const called = fetchMock.mock.calls.some(
      (c) => c[0] === "/api/ops/rate-limits/cache" && (c[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(called).toBe(true);

    // Success toast
    await screen.findByText(/Cleared cache for flag-submit\./i);
  });

  it("Remove override posts DELETE and shows success", async () => {
    const defaults = {
      "flag-submit": "10/min",
      "flag-submit-ip": "30/min",
    };
    const effective = {
      "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
    };
    const db_overrides = [
      { scope: "flag-submit", user_rate: "10/min", ip_rate: "30/min", updated_at: new Date().toISOString() },
    ];
    const presets = { presets: {}, env_presets: {} };

    const fetchMock = setupFetch({ defaults, effective, db_overrides, presets, superuser: true });

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );
    await screen.findByText(/Rate Limits \(Ops\)/);

    // Find DB override row for flag-submit and click Remove
    const scopeCell = await screen.findByText("flag-submit");
    const row = scopeCell.closest("tr")!;
    const removeBtn = within(row).getByRole("button", { name: /Remove/i });
    fireEvent.click(removeBtn);

    // Confirm modal: click Confirm remove
    const confirmBtn = await screen.findByRole("button", { name: /Confirm remove/i });
    fireEvent.click(confirmBtn);

    // Expect DELETE call
    const calledDelete = fetchMock.mock.calls.some(
      (c) =>
        typeof c[0] === "string" &&
        c[0].startsWith("/api/ops/rate-limits?scope=") &&
        (c[1]?.method || "GET").toUpperCase() === "DELETE"
    );
    expect(calledDelete).toBe(true);

    // Success toast
    await screen.findByText(/Removed override for flag-submit\./i);
  });
});