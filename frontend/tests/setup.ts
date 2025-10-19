import { vi } from "vitest";

// Global mock for Next.js client router hooks so client components can render in Vitest
vi.mock("next/navigation", () => {
  const push = vi.fn();
  const replace = vi.fn();
  const refresh = vi.fn();
  const prefetch = vi.fn();
  const back = vi.fn();
  const useRouter = () => ({ push, replace, refresh, prefetch, back });
  // Provide a redirect mock; tests can override its implementation per-suite
  const redirect = vi.fn();
  return { useRouter, redirect };
});

// Minimal mock for next/headers so SSR guards can serialize cookies()
vi.mock("next/headers", () => {
  return {
    cookies: () => ({
      toString: () => "",
    }),
  };
});