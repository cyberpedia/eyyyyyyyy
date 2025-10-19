import { render as rtlRender } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsRateLimitsPage from "../app/ops/rate-limits/page";
import { vi } from "vitest";
import { useRouter } from "next/navigation";
import { act } from "react";

const render = (ui: any) =>
  rtlRender(ui, { wrapper: ({ children }: any) => <ToastProvider>{children}</ToastProvider> });

type JsonResp = { ok: boolean; status: number; json: () => Promise<any> };

function jsonResponse(data: any, status = 200): JsonResp {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

describe("Ops Rate Limits client-side guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // reset mocked router push
    const { push } = useRouter() as any;
    push.mockReset?.();
  });

  it("redirects non-staff to /login via client guard", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = (init?.method || "GET").toUpperCase();
      if (url === "/api/users/me" && method === "GET") {
        return Promise.resolve(jsonResponse({ isStaff: false }));
      }
      if (url === "/api/ops/rate-limits" && method === "GET") {
        return Promise.resolve(jsonResponse({ defaults: {}, db_overrides: [], effective: {}, cache: {} }));
      }
      if (url === "/api/ops/rate-limits/presets" && method === "GET") {
        return Promise.resolve(jsonResponse({ presets: {}, env_presets: {} }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      render(<OpsRateLimitsPage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const { push } = useRouter() as any;
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("does not redirect for staff user", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = (init?.method || "GET").toUpperCase();
      if (url === "/api/users/me" && method === "GET") {
        return Promise.resolve(jsonResponse({ isStaff: true }));
      }
      if (url === "/api/ops/rate-limits" && method === "GET") {
        return Promise.resolve(jsonResponse({ defaults: {}, db_overrides: [], effective: {}, cache: {} }));
      }
      if (url === "/api/ops/rate-limits/presets" && method === "GET") {
        return Promise.resolve(jsonResponse({ presets: {}, env_presets: {} }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      render(<OpsRateLimitsPage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const { push } = useRouter() as any;
    expect(push).not.toHaveBeenCalled();
  });
});