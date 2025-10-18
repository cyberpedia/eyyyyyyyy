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

describe("Ops Rate Limits auto-refresh countdown", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("counts down from 30s to 29s and 28s when enabled", async () => {
    setupFetch();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    // Wait for initial load to complete
    await screen.findByText(/Rate Limits \(Ops\)/);

    // Switch to fake timers for countdown ticks, and sync system time with fake timers
    vi.useFakeTimers();
    let now = new Date("2023-01-01T00:00:00Z");
    vi.setSystemTime(now);

    // Advance 1 second
    await act(async () => {
      vi.advanceTimersByTime(1000);
      now = new Date(now.getTime() + 1000);
      vi.setSystemTime(now);
    });
    const intervalSelect = screen.getByTitle("Auto-refresh interval");
    await act(async () => {
      fireEvent.change(intervalSelect, { target: { value: "30000" } });
    });

    // Assert countdown visible via raw textContent (robust against nested nodes)
    expect(document.body.textContent || "").toMatch(/Next refresh in:/);
    expect(document.body.textContent || "").toMatch(/30s/);

    // Switch to fake timers for countdown ticks, and sync system time with fake timers
    vi.useFakeTimers();
    let now = new Date("2023-01-01T00:00:00Z");
    vi.setSystemTime(now);

    // Advance 1 second
    await act(async () => {
      vi.advanceTimersByTime(1000);
      now = new Date(now.getTime() + 1000);
      vi.setSystemTime(now);
    });

    // Countdown should update to 29s
    expect(document.body.textContent || "").toMatch(/Next refresh in:/);
    expect(document.body.textContent || "").toMatch(/29s/);

    // Advance another second
    await act(async () => {
      vi.advanceTimersByTime(1000);
      now = new Date(now.getTime() + 1000);
      vi.setSystemTime(now);
    });

    // Countdown should update to 28s
    expect(document.body.textContent || "").toMatch(/Next refresh in:/);
    expect(document.body.textContent || "").toMatch(/28s/);
    vi.useRealTimers();
  });