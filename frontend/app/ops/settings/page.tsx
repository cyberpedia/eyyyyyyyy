"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import UiThemeToggle from "../../../components/UiThemeToggle";
import HighlightThemeToggle from "../../../components/HighlightThemeToggle";
import { useToast } from "../../../components/ToastProvider";

export default function OpsSettingsPage() {
  const { notifySuccess } = useToast();
  const router = useRouter();

  // Staff-only guard: redirect non-staff to login
  useEffect(() => {
    fetch("/api/users/me", { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (!d.isStaff) router.push("/login");
      })
      .catch(() => {});
  }, [router]);

  const clearRateLimitsPrefs = () => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem("opsRateLimits:autoRefresh");
      window.localStorage.removeItem("opsRateLimits:autoRefreshIntervalMs");
      notifySuccess("Cleared rate-limits persisted preferences.");
    } catch {}
  };

  const clearWriteUpsPrefs = () => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem("opsWriteUps:status");
      window.localStorage.removeItem("opsWriteUps:challengeId");
      window.localStorage.removeItem("opsWriteUps:page");
      window.localStorage.removeItem("opsWriteUps:pageSize");
      notifySuccess("Cleared write-ups persisted filters/pagination.");
    } catch {}
  };

  const clearAllFilters = () => {
    clearRateLimitsPrefs();
    clearWriteUpsPrefs();
  };

  const resetThemePrefs = () => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem("uiTheme");
      window.localStorage.removeItem("hljsTheme");
      notifySuccess("Reset UI and code theme preferences.");
      window.location.reload();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ops Settings</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Themes</h2>
        <div className="flex items-center gap-6">
          <UiThemeToggle />
          <HighlightThemeToggle />
        </div>
        <div className="mt-2">
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={resetThemePrefs}
            title="Reset UI and code highlight themes to defaults"
          >
            Reset theme preferences
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          UI theme toggles overall app colors. Code theme toggles syntax highlighting style for Markdown code blocks.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Persisted filters</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Clear saved filters and preferences for Ops pages stored in your browser.
        </p>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={clearRateLimitsPrefs}
            title="Clear saved auto-refresh prefs for Ops Rate Limits"
          >
            Clear Rate-limits prefs
          </button>
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={clearWriteUpsPrefs}
            title="Clear saved filters and pagination for Ops Write-ups"
          >
            Clear Write-ups filters
          </button>
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={clearAllFilters}
            title="Clear both categories of saved prefs"
          >
            Reset all persisted filters
          </button>
        </div>
      </section>
    </div>
  );
}