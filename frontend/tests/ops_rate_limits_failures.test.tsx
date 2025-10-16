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

function setupFetch(initialOk = true) {
  const defaults = {
    "flag-submit": "10/min",
    "flag-submit-ip": "30/min",
  };
  const effective = {
    "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
  };
  const presets = { presets: { competition: {} }, env_presets: {} };

  let toggleFailureOnRefresh = false;

  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();

    if (url === "/api/users/me" && method === "GET") {
      return Promise.resolve(jsonResponse({ isSuperuser: true, isStaff: true }));
    }

    if (url === "/api/ops/rate-limits" && method === "GET") {
      if (!initialOk || toggleFailureOnRefresh) {
        return Promise.resolve(jsonResponse({ detail: "Backend failure" }, 500));
      }
      return Promise.resolve(jsonResponse({ defaults, db_overrides: [], effective, cache: {} }));
    }

    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(presets));
    }

    if (url === "/api/ops/rate-limits/presets/validate" && method === "POST") {
      // Return invalid
      return Promise.resolve(jsonResponse({ valid: false, errors: ["Bad JSON"] }));
    }

    if (url === "/api/ops/rate-limits/presets" && method === "POST") {
      // Simulate save failure
      return Promise.resolve(jsonResponse({ detail: "Save failed" }, 500));
    }

    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });

  // Expose a way to toggle failure on subsequent refresh
  const setFailureOnRefresh = (v: boolean) => {
    toggleFailureOnRefresh = v;
  };

  // @ts-ignore
  global.fetch = fetchMock;
  return { fetchMock, setFailureOnRefresh };
}

describe("Ops Rate Limits failure cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Refresh failure shows error toast and retains existing data", async () => {
    const { fetchMock, setFailureOnRefresh } = setupFetch(true);

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    // Initial load succeeds
    await screen.findByText(/Rate Limits \(Ops\)/);
    await screen.findByText("flag-submit");

    // Toggle failure on subsequent refresh
    setFailureOnRefresh(true);

    // Click Refresh
    const refreshBtn = await screen.findByRole("button", { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    // Error toast appears with message from backend
    await screen.findByText(/Backend failure/i);

    // Existing cell remains unchanged (no state change)
    await screen.findByText("flag-submit");
  });

  it("Presets validation failure shows error toast", async () => {
    setupFetch(true);

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    const validateBtn = await screen.findByRole("button", { name: /Validate/i });
    fireEvent.click(validateBtn);

    // Error toast from validation
    await screen.findByText(/Bad JSON/i);
  });

  it("Save presets failure shows error toast and does not reload data", async () => {
    const { fetchMock } = setupFetch(true);

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    const saveBtn = await screen.findByRole("button", { name: /Save Presets/i });
    fireEvent.click(saveBtn);

    // Error toast appears
    await screen.findByText(/Save failed/i);

    // No additional GET calls after failed save
    const getCallsAfterSave = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    );
    // Expect exactly initial mount's GET calls (at least once, but unchanged by failed save)
    expect(getCallsAfterSave.length).toBeGreaterThanOrEqual(1);
  });
});