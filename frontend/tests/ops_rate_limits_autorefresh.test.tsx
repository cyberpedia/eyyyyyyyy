import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsRateLimitsPage from "../app/ops/rate-limits/page";
import { vi } from "vitest";
import { act } from "react-dom/test-utils";

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
    vi.useFakeTimers();
    const fetchMock = setupFetch();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    // Toggle Auto-refresh
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    // Change interval to 30s
    const intervalSelect = screen.getByTitle("Auto-refresh interval");
    fireEvent.change(intervalSelect, { target: { value: "30000" } });

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

    // Advance timers past interval to trigger reload
    await act(async () => {
      vi.advanceTimersByTime(31000);
    });

    const afterGetCount = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    ).length;

    expect(afterGetCount).toBeGreaterThan(initialGetCount);
  });
});