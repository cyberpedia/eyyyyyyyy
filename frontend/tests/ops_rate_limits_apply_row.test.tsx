import { render, screen, fireEvent, within } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsRateLimitsPage from "../app/ops/rate-limits/page";
import { vi } from "vitest";

// Safe mock for next/navigation useRouter
vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    }),
  };
});

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
  const presets = {
    presets: {
      competition: {
        "flag-submit": { user_rate: "20/min", ip_rate: "35/min" },
        login: { user_rate: "5/min", ip_rate: "" }, // ip fallback
      },
    },
    env_presets: {},
  };

  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();

    if (url === "/api/users/me" && method === "GET") {
      return Promise.resolve(jsonResponse({ isSuperuser: true, isStaff: true }));
    }
    if (url === "/api/ops/rate-limits" && method === "GET") {
      return Promise.resolve(jsonResponse({ defaults, db_overrides: [], effective, cache: {} }));
    }
    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(presets));
    }
    if (url === "/api/ops/rate-limits" && method === "POST") {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });

  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

function setupFetchSingleScope() {
  const defaults = {
    "flag-submit": "10/min",
    "flag-submit-ip": "30/min",
  };
  const effective = {
    "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
  };
  const presets = {
    presets: {
      competition: {
        "flag-submit": { user_rate: "22/min", ip_rate: "33/min" },
      },
    },
    env_presets: {},
  };

  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();

    if (url === "/api/users/me" && method === "GET") {
      return Promise.resolve(jsonResponse({ isSuperuser: true, isStaff: true }));
    }
    if (url === "/api/ops/rate-limits" && method === "GET") {
      return Promise.resolve(jsonResponse({ defaults, db_overrides: [], effective, cache: {} }));
    }
    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(presets));
    }
    if (url === "/api/ops/rate-limits" && method === "POST") {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });

  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

describe("Ops Rate Limits apply-only-this-row action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("applies only one scope from preview with confirmation", async () => {
    const fetchMock = setupFetch();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    // Preview competition preset
    const previewBtn = await screen.findByRole("button", { name: /Preview competition/i });
    fireEvent.click(previewBtn);

    // Find preview table and row for flag-submit, then click Apply only this row
    const previewTable = screen.getByTestId("dry-run-table");
    const scopeCell = within(previewTable).getByText("flag-submit");
    const row = scopeCell.closest("tr")!;
    const applyRowBtn = within(row).getByRole("button", { name: /Apply only this row/i });
    fireEvent.click(applyRowBtn);

    // Confirm modal
    const confirmBtn = await screen.findByRole("button", { name: /Confirm apply/i });
    fireEvent.click(confirmBtn);

    // Ensure a single POST call was made with scope=flag-submit
    const postCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
    const call = postCalls[0];
    const body = JSON.parse(call[1].body);
    expect(body.scope).toBe("flag-submit");
    expect(body.user_rate).toBe("20/min");
    expect(body.ip_rate).toBe("35/min");

    // Success toast appears
    await screen.findByText(/Applied override for flag-submit\./i);

    // Only one Apply-only button should remain (the other row)
    const remainingApplyButtons = screen.getAllByRole("button", { name: /Apply only this row/i });
    expect(remainingApplyButtons.length).toBe(1);
    // The remaining row should be the other scope (login) within the preview table
    const previewTableAfter = screen.getByTestId("dry-run-table");
    const remainingRow = within(previewTableAfter).getByText("login");
    expect(remainingRow).toBeTruthy();
  });

  it("applies single-scope preset and clears preview section", async () => {
    const fetchMock = setupFetchSingleScope();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    const previewBtn = await screen.findByRole("button", { name: /Preview competition/i });
    fireEvent.click(previewBtn);

    // Apply only this row (only one row exists) within the preview table
    const previewTable = screen.getByTestId("dry-run-table");
    const scopeCell = within(previewTable).getByText("flag-submit");
    const row = scopeCell.closest("tr")!;
    const applyRowBtn = within(row).getByRole("button", { name: /Apply only this row/i });
    fireEvent.click(applyRowBtn);

    const confirmBtn = await screen.findByRole("button", { name: /Confirm apply/i });
    fireEvent.click(confirmBtn);

    // Success toast appears
    await screen.findByText(/Applied override for flag-submit\./i);

    // Preview table should be cleared (no Apply these changes button)
    expect(screen.queryByRole("button", { name: /Apply these changes/i })).toBeNull();
  });
});