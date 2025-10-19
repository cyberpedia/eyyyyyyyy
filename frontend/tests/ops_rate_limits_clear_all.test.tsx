import { render, screen, fireEvent } from "@testing-library/react";
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
  };
  const effective = {
    "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
  };
  const presets = { presets: {}, env_presets: {} };

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
    if (url === "/api/ops/rate-limits/cache" && method === "POST") {
      return Promise.resolve(jsonResponse({ defaults, db_overrides: [], effective, cache: {} }));
    }
    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });
  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

describe("Ops Rate Limits clear all cache action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clears all cache via header button and shows success toast", async () => {
    const fetchMock = setupFetch();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    const clearAllBtn = screen.getByRole("button", { name: /Clear all cache/i });
    fireEvent.click(clearAllBtn);

    // Confirm modal
    const confirmBtn = await screen.findByRole("button", { name: /Confirm clear/i });
    fireEvent.click(confirmBtn);

    // Expect POST /api/ops/rate-limits/cache
    const called = fetchMock.mock.calls.some(
      (c) => c[0] === "/api/ops/rate-limits/cache" && (c[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(called).toBe(true);

    // Success toast
    await screen.findByText(/Cleared all rate-limit cache\./i);
  });
});