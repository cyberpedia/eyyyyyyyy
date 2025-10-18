import { render as rtlRender, screen } from "@testing-library/react";
import { ToastProvider } from "../components/ToastProvider";
import OpsSettingsPage from "../app/ops/settings/page";
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

describe("Ops Settings client-side guard", () => {
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
      return Promise.resolve(jsonResponse({}));
    });

    render(<OpsSettingsPage />);

    // Allow effects to run
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
      return Promise.resolve(jsonResponse({}));
    });

    render(<OpsSettingsPage />);

    await new Promise((r) => setTimeout(r, 0));

    const { push } = useRouter() as any;
    expect(push).not.toHaveBeenCalled();
    // Page content should render (e.g., heading)
    expect(screen.getByText(/Ops Settings/i)).toBeTruthy();
  });
});