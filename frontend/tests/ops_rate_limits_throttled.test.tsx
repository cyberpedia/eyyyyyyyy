import { render, screen, fireEvent, within } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsRateLimitsPage from "../app/ops/rate-limits/page";
import { vi } from "vitest";

// Mock next/navigation useRouter
const pushMock = vi.fn();
vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({ push: pushMock }),
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

function setupFetchThrottled() {
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
  const presets = {
    presets: {
      competition: {
        "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
        login: { user_rate: "5/min", ip_rate: "5/min" },
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
      return Promise.resolve(jsonResponse({ defaults, db_overrides, effective, cache: {} }));
    }
    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(presets));
    }
    if (url === "/api/ops/rate-limits" && method === "POST") {
      return Promise.resolve(jsonResponse({ detail: "Throttled" }, 429));
    }
    if (url === "/api/ops/rate-limits/cache" && method === "POST") {
      return Promise.resolve(jsonResponse({ detail: "Throttled" }, 429));
    }
    return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
  });

  // @ts-ignore
  global.fetch = fetchMock;
  return fetchMock;
}

describe("Ops Rate Limits throttled actions (HTTP 429)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Apply from dry-run shows throttled error and does not reload", async () => {
    const fetchMock = setupFetchThrottled();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    // Record initial GET count
    const initialGetCount = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    ).length;

    // Preview competition preset
    const previewBtn = await screen.findByRole("button", { name: /Preview competition/i });
    fireEvent.click(previewBtn);

    // Apply changes -> should be throttled
    const applyBtn = await screen.findByRole("button", { name: /Apply these changes/i });
    fireEvent.click(applyBtn);

    // Error toast shows throttled detail
    await screen.findByText(/Throttled/i);

    // No additional GET reloads should have occurred
    const afterGetCount = fetchMock.mock.calls.filter(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET"
    ).length;
    expect(afterGetCount).toBe(initialGetCount);
  });

  it("Update Override throttled shows error toast", async () => {
    const fetchMock = setupFetchThrottled();

    // Set CSRF cookie
    // @ts-ignore
    document.cookie = "csrftoken=test-token";

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    // Fill Update Override form
    const scopeInput = screen.getByPlaceholderText("scope");
    const userInput = screen.getByPlaceholderText("user_rate (e.g., 10/min)");
    const ipInput = screen.getByPlaceholderText("ip_rate (e.g., 30/min)");
    fireEvent.change(scopeInput, { target: { value: "flag-submit" } });
    fireEvent.change(userInput, { target: { value: "12/min" } });
    fireEvent.change(ipInput, { target: { value: "40/min" } });

    const saveBtn = screen.getByRole("button", { name: /Save/i });
    fireEvent.click(saveBtn);

    // Error toast
    await screen.findByText(/Throttled/i);

    // Ensure POST was attempted
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(postCall).toBeTruthy();
  });

  it("Clear cache throttled shows error toast", async () => {
    const fetchMock = setupFetchThrottled();

    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );

    await screen.findByText(/Rate Limits \(Ops\)/);

    // Use DB Overrides row to clear cache
    const scopeCell = await screen.findByText("flag-submit");
    const row = scopeCell.closest("tr")!;
    const clearBtn = within(row).getByRole("button", { name: /Clear cache/i });
    fireEvent.click(clearBtn);

    // Confirm
    const confirmBtn = await screen.findByRole("button", { name: /Confirm clear/i });
    fireEvent.click(confirmBtn);

    // Error toast
    await screen.findByText(/Throttled/i);

    // Ensure POST was attempted
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/ops/rate-limits/cache" && (c[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(postCall).toBeTruthy();
  });
});