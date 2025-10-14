"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

type WriteUp = {
  id: number;
  challenge: number;
  challenge_title?: string;
  challenge_slug?: string;
  user: number;
  username: string;
  team?: number | null;
  title: string;
  content_md: string;
  status: string;
  moderation_notes?: string;
  created_at: string;
  published_at?: string | null;
};

export default function OpsWriteUpsPage() {
  const { notify, notifySuccess, notifyError } = useToast();
  const [rows, setRows] = useState<WriteUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [notesById, setNotesById] = useState<Record<number, string>>({});

  const getCsrfToken = () => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  };

  const loadPending = () => {
    setLoading(true);
    notify("info", "Loading pending write-ups...");
    fetch("http://localhost:8000/api/content/writeups?status=pending", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRows(d.results || []))
      .catch((e) => notifyError(e?.message || "Failed to load write-ups."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPending();
  }, []);

  const moderate = async (id: number, action: "approve" | "reject") => {
    try {
      const notes = notesById[id] || "";
      const r = await fetch(`http://localhost:8000/api/content/writeups/${id}/moderate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ action, notes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      notifySuccess(`Write-up ${action === "approve" ? "approved" : "rejected"}.`);
      loadPending();
    } catch (e: any) {
      notifyError(e?.message || "Moderation failed.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ops: Write-ups Moderation</h1>
        <button
          className="px-3 py-2 border rounded hover:bg-gray-50"
          onClick={loadPending}
          disabled={loading}
          title="Reload pending write-ups"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">No pending write-ups.</div>
      ) : (
        <ul className="space-y-4">
          {rows.map((w) => (
            <li key={w.id} className="border rounded p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{w.title}</div>
                  <div className="text-xs text-gray-600">
                    Challenge:{" "}
                    <a href={`/challenges/${w.challenge}`} className="underline">
                      {w.challenge_title || `#${w.challenge}`}
                    </a>{" "}
                    • by {w.username} • submitted {new Date(w.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="bg-green-600 text-white px-3 py-2 rounded"
                    onClick={() => moderate(w.id, "approve")}
                    title="Approve write-up"
                  >
                    Approve
                  </button>
                  <button
                    className="bg-red-600 text-white px-3 py-2 rounded"
                    onClick={() => moderate(w.id, "reject")}
                    title="Reject write-up"
                  >
                    Reject
                  </button>
                </div>
              </div>
              <div className="prose max-w-none mt-3 whitespace-pre-wrap">
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{w.content_md || ""}</ReactMarkdown>
              </div>
              <div className="mt-3">
                <label className="text-sm text-gray-700">Moderation notes</label>
                <textarea
                  className="border rounded px-3 py-2 w-full h-20 mt-1"
                  placeholder="Optional notes…"
                  value={notesById[w.id] || ""}
                  onChange={(e) => setNotesById((prev) => ({ ...prev, [w.id]: e.target.value }))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}