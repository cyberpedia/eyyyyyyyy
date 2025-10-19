import React from "react";
import { render, screen } from "@testing-library/react";
import OpsLayout from "../app/ops/layout";
import { vi } from "vitest";
import { redirect } from "next/navigation";

// Note: Global mocks for next/headers and next/navigation are provided via tests/setup.ts

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
    (redirect as any).mockReset?.();
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

    (redirect as any).mockImplementation?.(() => {});

    const element = await OpsLayout({ children: <div data-testid="child">Protected Content</div> });
    render(element as any);
    expect(screen.getByTestId("child").textContent).toContain("Protected Content");
    expect((redirect as any).mock.calls.length).toBe(0);
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

    (redirect as any).mockImplementation?.(() => {
      throw new Error("REDIRECT");
    });

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect((redirect as any).mock.calls[0][0]).toBe("/login");
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

    (redirect as any).mockImplementation?.(() => {
      throw new Error("REDIRECT");
    });

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect((redirect as any).mock.calls[0][0]).toBe("/login");
  });

  it("redirects when fetch throws", async () => {
    // @ts-ignore
    global.fetch = vi.fn(() => {
      throw new Error("Network error");
    });

    (redirect as any).mockImplementation?.(() => {
      throw new Error("REDIRECT");
    });

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect((redirect as any).mock.calls[0][0]).toBe("/login");
  });
});