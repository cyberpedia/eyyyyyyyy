"use client";

import React, { useEffect, useState } from "react";

type Theme = "github" | "github-dark";

const STORAGE_KEY = "hljsTheme";

function applyTheme(theme: Theme) {
  const href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme}.min.css`;
  let link = document.getElementById("hljs-theme") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "hljs-theme";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  } else {
    if (link.href !== href) {
      link.href = href;
    }
  }
}

export default function HighlightThemeToggle() {
  const [theme, setTheme] = useState<Theme>("github");

  useEffect(() => {
    try {
      const saved = (window.localStorage.getItem(STORAGE_KEY) as Theme | null) || null;
      const initial: Theme = saved === "github-dark" ? "github-dark" : "github";
      setTheme(initial);
      applyTheme(initial);
    } catch {
      applyTheme("github");
    }
  }, []);

  const setAndApply = (t: Theme) => {
    setTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    applyTheme(t);
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">Code theme:</span>
      <button
        className={`px-2 py-1 rounded border ${theme === "github" ? "bg-gray-100" : ""}`}
        onClick={() => setAndApply("github")}
        title="Light code highlighting"
      >
        Light
      </button>
      <button
        className={`px-2 py-1 rounded border ${theme === "github-dark" ? "bg-gray-100" : ""}`}
        onClick={() => setAndApply("github-dark")}
        title="Dark code highlighting"
      >
        Dark
      </button>
    </div>
  );
}