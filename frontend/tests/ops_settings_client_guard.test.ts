import { render, screen } from "@testing-library/react";
import OpsSettingsPage from "../app/ops/settings/page";
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

describe("Ops Settings client-side guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
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

    expect(pushMock).toHaveBeenCalledWith("/login");
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

    expect(pushMock).not.toHaveBeenCalled();
    // Page content should render (e.g., heading)
    expect(screen.getByText(/Ops Settings/i)).toBeTruthy();
  });
});