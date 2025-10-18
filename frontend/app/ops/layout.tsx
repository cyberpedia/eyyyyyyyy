import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side guard for all /ops pages.
 * Checks current user via proxied /api/users/me and redirects to /login if not staff.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  // Forward incoming cookies to the proxied API; disable caching for per-request auth checks.
  const cookieHeader = cookies().toString();
  let isStaff = false;

  try {
    const res = await fetch("/api/users/me", {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) {
      // Not authenticated or no permission; redirect client-side route.
      redirect("/login");
    }
    const data = await res.json();
    isStaff = !!data?.isStaff;
  } catch {
    // Backend unreachable or other error; fail closed.
    redirect("/login");
  }

  if (!isStaff) {
    redirect("/login");
  }

  return <>{children}</>;
}