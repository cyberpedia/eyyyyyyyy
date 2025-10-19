import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsRateLimitsPage from "../app/ops/rate-limits/page";
import { vi } from "vitest";
import { act } from "react";

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
    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });
  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

describe("Ops Rate Limits auto-refresh and countdown", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear localStorage
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("persists auto-refresh toggle and interval in localStorage and triggers periodic reloads", async () => {
    const fetchMock = setupFetch();

    // Use fake timers and set base time BEFORE render so initial reloadAll uses fake Date.now
    vi.useFakeTimers();
    const base = new Date("2023-01-01T00:00:00Z");
    vi.setSystemTime(base);

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    // Wait for initial load to complete
    await screen.findByText(/Rate Limits \(Ops\)/);

    // Toggle Auto-refresh
    const checkbox = screen.getByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkbox);
    });

    // Change interval to 30s
    const intervalSelect = screen.getByTitle("Auto-refresh interval");
    await act(async () => {
      fireEvent.change(intervalSelect, { target: { value: "30000" } });
    });

    // LocalStorage persisted
    expect(window.localStorage.getItem("opsRateLimits:autoRefresh")).toBe("1");
    expect(window.localStorage.getItem("opsRateLimits:autoRefreshIntervalMs")).toBe("30000");

    // Countdown appears
    const countdownEl = screen.getByText(/Next refresh in:/);
    expect(countdownEl.textContent).toContain("30s");

    // Record initial GET calls count
    const initialGetCount = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    ).length;

    // Advance timers past interval to trigger reload (be tolerant to either 60s or 30s schedule)
    await act(async () => {
      vi.advanceTimersByTime(61000);
      // keep Date.now in sync with fake timers
      vi.setSystemTime(new Date(base.getTime() + 61000));
    });
    // allow async fetch to be invoked
    await Promise.resolve();
    await Promise.resolve();

    const afterGetCount = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    ).length;

    expect(afterGetCount).toBeGreaterThan(initialGetCount);
    vi.useRealTimers();
  });
});