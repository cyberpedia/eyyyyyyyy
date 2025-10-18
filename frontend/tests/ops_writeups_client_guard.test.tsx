import { render as rtlRender } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsWriteUpsPage from "../app/ops/writeups/page";
import { vi } from "vitest";
import { useRouter } from "next/navigation";

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

describe("Ops Write-ups client-side guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const { push } = useRouter() as any;
    push.mockReset?.();
  });

  it("redirects non-staff to /login via client guard", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url === "/api/users/me") {
        return Promise.resolve(jsonResponse({ isStaff: false }));
      }
      if (url?.startsWith("/api/content/writeups")) {
        // Return empty list to satisfy loader
        return Promise.resolve(jsonResponse({ results: [], count: 0, has_next: false, has_prev: false }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<OpsWriteUpsPage />);

    await new Promise((r) => setTimeout(r, 0));

    const { push } = useRouter() as any;
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("does not redirect for staff user", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url === "/api/users/me") {
        return Promise.resolve(jsonResponse({ isStaff: true }));
      }
      if (url?.startsWith("/api/content/writeups")) {
        return Promise.resolve(jsonResponse({ results: [], count: 0, has_next: false, has_prev: false }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<OpsWriteUpsPage />);

    await new Promise((r) => setTimeout(r, 0));

    const { push } = useRouter() as any;
    expect(push).not.toHaveBeenCalled();
  });
});