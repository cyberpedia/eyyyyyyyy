"use client";

import React, { useEffect, useState } from "react";

type UiTheme = "light" | "dark";
const STORAGE_KEY = "uiTheme";

function applyUiTheme(theme: UiTheme) {
  const html = document.documentElement;
  if (theme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
}

export default function UiThemeToggle() {
  const [theme, setTheme] = useState<UiTheme>("light");

  useEffect(() => {
    try {
      const saved = (window.localStorage.getItem(STORAGE_KEY) as UiTheme | null) || null;
      const initial: UiTheme = saved === "dark" ? "dark" : "light";
      setTheme(initial);
      applyUiTheme(initial);
    } catch {
      applyUiTheme("light");
    }
  }, []);

  const setAndApply = (t: UiTheme) => {
    setTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    applyUiTheme(t);
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600 dark:text-gray-300">UI theme:</span>
      <button
        className={`px-2 py-1 rounded border ${theme === "light" ? "bg-gray-100 dark:bg-gray-800" : ""}`}
        onClick={() => setAndApply("light")}
        title="Light UI theme"
      >
        Light
      </button>
      <button
        className={`px-2 py-1 rounded border ${theme === "dark" ? "bg-gray-100 dark:bg-gray-800" : ""}`}
        onClick={() => setAndApply("dark")}
        title="Dark UI theme"
      >
        Dark
      </button>
    </div>
  );
}