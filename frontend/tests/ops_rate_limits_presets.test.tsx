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

function setupFetch(superuser: boolean) {
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
        "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
        login: { user_rate: "5/min", ip_rate: "5/min" },
      },
    },
    env_presets: {
      prod: {
        "flag-submit": { user_rate: "10/min", ip_rate: "30/min" },
        login: { user_rate: "5/min", ip_rate: "5/min" },
      },
    },
  };

  const fetchMock = vi.fn((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();
    if (url === "/api/ops/rate-limits" && method === "GET") {
      return Promise.resolve(jsonResponse({ defaults, db_overrides: [], effective, cache: {} }));
    }
    if (url === "/api/ops/rate-limits/presets" && method === "GET") {
      return Promise.resolve(jsonResponse(presets));
    }
    if (url === "/api/users/me" && method === "GET") {
      return Promise.resolve(jsonResponse({ isSuperuser: superuser, isStaff: true }));
    }
    if (url === "/api/ops/rate-limits/presets/validate" && method === "POST") {
      return Promise.resolve(jsonResponse({ valid: true, errors: [] }));
    }
    if (url === "/api/ops/rate-limits/presets" && method === "POST") {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    // Reload requests after save
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

describe("Ops Rate Limits presets flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Validate presets success shows success toast", async () => {
    const fetchMock = setupFetch(true);
    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );
    // Wait for page to load
    await screen.findByText(/Rate Limits \(Ops\)/);
    const validateBtn = await screen.findByRole("button", { name: /Validate/i });
    fireEvent.click(validateBtn);
    // Should call validate endpoint
    const called = fetchMock.mock.calls.some((c) => c[0] === "/api/ops/rate-limits/presets/validate");
    expect(called).toBe(true);
    // Toast appears
    await screen.findByText(/Presets JSON is valid\./i);
  });

  it("Save Presets disabled for non-superuser", async () => {
    setupFetch(false);
    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );
    await screen.findByText(/Rate Limits \(Ops\)/);
    const saveBtn = await screen.findByRole("button", { name: /Save Presets/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Shows presets editor notice for non-superuser", async () => {
    setupFetch(false);
    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );
    await screen.findByText(/Rate Limits \(Ops\)/);
    await screen.findByText(/only superusers can save changes to the presets configuration/i);
  });

  it("Save Presets success triggers reload and success toast", async () => {
    const fetchMock = setupFetch(true);
    render(
      <ToastProvider>
        <OpsRateLimitsPage />
      </ToastProvider>
    );
    await screen.findByText(/Rate Limits \(Ops\)/);
    const saveBtn = await screen.findByRole("button", { name: /Save Presets/i });
    fireEvent.click(saveBtn);
    // Save endpoint called
    const calledSave = fetchMock.mock.calls.some((c) => c[0] === "/api/ops/rate-limits/presets" && (c[1]?.method || "GET").toUpperCase() === "POST");
    expect(calledSave).toBe(true);
    // Reload endpoints called
    const calledReloadRates = fetchMock.mock.calls.some((c) => c[0] === "/api/ops/rate-limits" && (c[1]?.method || "GET").toUpperCase() === "GET");
    const calledReloadPresets = fetchMock.mock.calls.some((c) => c[0] === "/api/ops/rate-limits/presets" && (c[1]?.method || "GET").toUpperCase() === "GET");
    expect(calledReloadRates).toBe(true);
    expect(calledReloadPresets).toBe(true);
    // Success toast appears
    await screen.findByText(/Saved presets\./i);
  });
});