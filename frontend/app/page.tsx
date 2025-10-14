"use client";

import React from "react";
import { useToast } from "../components/ToastProvider";

export default function HomePage() {
  const { notify, notifySuccess, notifyError } = useToast();

  const checkBackend = async () => {
    try {
      notify("info", "Checking backend...");
      const r = await fetch("/api/leaderboard", { credentials: "include" });
      if (r.ok) {
        notifySuccess("Backend reachable.");
      } else {
        const d = await r.json().catch(() => ({}));
        notifyError(d.detail || `Backend check failed (HTTP ${r.status}).`);
      }
    } catch (e: any) {
      notifyError(e?.message || "Backend check failed.");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome to the CTF Platform</h1>
      <p className="text-gray-700">
        This is a minimal frontend scaffold. The backend API is available under <code className="bg-gray-100 px-1">/api</code> via the dev proxy.
      </p>
      <div>
        <button
          className="px-3 py-2 border rounded hover:bg-gray-50"
          onClick={checkBackend}
          title="Ping backend API"
        >
          Check backend status
        </button>
      </div>
      <ul className="list-disc pl-6">
        <li><a className="text-blue-600 hover:underline" href="/challenges">Browse challenges</a></li>
        <li><a className="text-blue-600 hover:underline" href="/leaderboard">View leaderboard</a></li>
      </ul>
    </div>
  );
}