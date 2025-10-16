import React from "react";
import { render, screen } from "@testing-library/react";
import OpsLayout from "../app/ops/layout";
import { vi } from "vitest";

// Mock next/headers cookies
vi.mock("next/headers", () => {
  return {
    cookies: () => ({
      toString: () => "session=abc; csrftoken=test",
    }),
  };
});

// Mock next/navigation redirect safely without referencing a TDZ variable
let redirectMock: ReturnType<typeof vi.fn>;
vi.mock("next/navigation", () => {
  redirectMock = vi.fn(() => {
    throw new Error("REDIRECT");
  });
  return {
    redirect: redirectMock,
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

describe("/ops layout SSR guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redirectMock.mockReset();
  });

  it("renders children for staff user", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url === "/api/users/me") {
        return Promise.resolve(jsonResponse({ isStaff: true }));
      }
      return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
    });

    const element = await OpsLayout({ children: <div data-testid="child">Protected Content</div> });
    render(element as any);
    expect(screen.getByTestId("child").textContent).toContain("Protected Content");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects non-staff user to /login", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url === "/api/users/me") {
        return Promise.resolve(jsonResponse({ isStaff: false }));
      }
      return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
    });

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects when backend returns non-ok response", async () => {
    // @ts-ignore
    global.fetch = vi.fn((input: any) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url === "/api/users/me") {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ detail: "Unauthorized" }),
        });
      }
      return Promise.resolve(jsonResponse({ detail: "Not found" }, 404));
    });

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects when fetch throws", async () => {
    // @ts-ignore
    global.fetch = vi.fn(() => {
      throw new Error("Network error");
    });

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});