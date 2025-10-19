"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../../components/ToastProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

// Build a safe sanitize schema that allows highlight.js class names on code blocks.
const baseAttrs = (defaultSchema as Schema)?.attributes || {};
const sanitizeSchema: Schema = {
  ...((defaultSchema as Schema) || {}),
  attributes: {
    ...baseAttrs,
    code: [...(baseAttrs.code || []), ["className"]],
    span: [...(baseAttrs.span || []), ["className"]],
    pre: [...(baseAttrs.pre || []), ["className"]],
  },
};

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

type AuditRow = {
  timestamp: string;
  actor_username: string;
  action: string;
  notes: string;
  prev_status: string;
  new_status: string;
  hash: string;
  prev_hash: string;
};

export default function OpsWriteUpsPage() {
  const { notify, notifySuccess, notifyError } = useToast();
  const [rows, setRows] = useState<WriteUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [notesById, setNotesById] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [challengeId, setChallengeId] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [count, setCount] = useState<number>(0);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [hasPrev, setHasPrev] = useState<boolean>(false);

  // Persist filters/pagination in localStorage
  const STATUS_KEY = "opsWriteUps:status";
  const CH_ID_KEY = "opsWriteUps:challengeId";
  const PAGE_KEY = "opsWriteUps:page";
  const PAGE_SIZE_KEY = "opsWriteUps:pageSize";

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const s = window.localStorage.getItem(STATUS_KEY);
      if (s && (s === "pending" || s === "approved" || s === "rejected")) setStatus(s as any);
      const cid = window.localStorage.getItem(CH_ID_KEY);
      if (cid !== null) setChallengeId(cid);
      const ps = window.localStorage.getItem(PAGE_SIZE_KEY);
      if (ps) {
        const n = parseInt(ps, 10);
        if ([10, 20, 50].includes(n)) setPageSize(n);
      }
      const pg = window.localStorage.getItem(PAGE_KEY);
      if (pg) {
        const n = parseInt(pg, 10);
        if (!isNaN(n) && n >= 1) setPage(n);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STATUS_KEY, status);
      window.localStorage.setItem(CH_ID_KEY, challengeId);
      window.localStorage.setItem(PAGE_SIZE_KEY, String(pageSize));
      window.localStorage.setItem(PAGE_KEY, String(page));
    } catch {}
  }, [status, challengeId, pageSize, page]);

  const [auditOpenFor, setAuditOpenFor] = useState<number | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const getCsrfToken = () => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  };

  const loadWriteUps = () => {
    setLoading(true);
    notify("info", `Loading ${status} write-ups...`);
    const qs = new URLSearchParams({
      status,
      page: String(page),
      page_size: String(pageSize),
    });
    if (challengeId.trim()) qs.set("challenge_id", challengeId.trim());
    fetch(`/api/content/writeups?${qs.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.results || []);
        setCount(d.count || 0);
        setHasNext(!!d.has_next);
        setHasPrev(!!d.has_prev);
      })
      .catch((e) => notifyError(e?.message || "Failed to load write-ups."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWriteUps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, challengeId, page, pageSize]);

  // Staff-only guard: redirect non-staff to login
  const router = useRouter();
  useEffect(() => {
    fetch("/api/users/me", { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (!d.isStaff) router.push("/login");
      })
      .catch(() => {});
  }, [router]);

  const moderate = async (id: number, action: "approve" | "reject") => {
    try {
      const notes = notesById[id] || "";
      const r = await fetch(`/api/content/writeups/${id}/moderate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ action, notes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      notifySuccess(`Write-up ${action === "approve" ? "approved" : "rejected"}.`);
      loadWriteUps();
    } catch (e: any) {
      notifyError(e?.message || "Moderation failed.");
    }
  };

  const openAudit = async (id: number) => {
    setAuditLoading(true);
    setAuditOpenFor(id);
    try {
      const r = await fetch(`/api/content/writeups/${id}/audit`, {
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setAuditRows(d.results || []);
    } catch (e: any) {
      notifyError(e?.message || "Failed to load audit trail.");
    } finally {
      setAuditLoading(false);
    }
  };

  const exportAuditCsv = () => {
    if (auditOpenFor === null || auditRows.length === 0) return;
    const headers = ["timestamp", "actor_username", "action", "notes", "prev_status", "new_status", "hash", "prev_hash"];
    const rowsCsv = auditRows.map((r) =>
      [
        new Date(r.timestamp).toISOString(),
        r.actor_username || "",
        r.action || "",
        (r.notes || "").replace(/"/g, '""'),
        r.prev_status || "",
        r.new_status || "",
        r.hash || "",
        r.prev_hash || "",
      ]
        .map((v) => `"${v}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `writeup-${auditOpenFor}-audit.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 0);
    notifySuccess("Exported audit CSV.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ops: Write-ups Moderation</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={loadWriteUps}
            disabled={loading}
            title="Reload write-ups"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={() => {
              if (!rows || rows.length === 0) return;
              const headers = ["id", "challenge_id", "challenge_title", "username", "title", "status", "moderation_notes", "created_at", "published_at"];
              const lines = rows.map((w) => {
                const vals = [
                  String(w.id),
                  String(w.challenge),
                  String(w.challenge_title || ""),
                  String(w.username || ""),
                  (w.title || "").replace(/"/g, '""'),
                  String(w.status || ""),
                  (w.moderation_notes || "").replace(/"/g, '""'),
                  new Date(w.created_at).toISOString(),
                  w.published_at ? new Date(w.published_at).toISOString() : "",
                ];
                return vals.map((v) => `"${v}"`).join(",");
              });
              const csv = [headers.join(","), ...lines].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `writeups-${status}${challengeId ? `-challenge-${challengeId}` : ""}-page-${page}.csv`;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                URL.revokeObjectURL(url);
                document.body.removeChild(a);
              }, 0);
              notifySuccess("Exported current list CSV.");
            }}
            title="Export current list to CSV"
          >
            Export list CSV
          </button>
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex flex-col">
          <label className="text-sm text-gray-700">Status</label>
          <select
            className="border rounded px-3 py-2"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as any);
            }}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-700">Challenge ID</label>
          <input
            className="border rounded px-3 py-2"
            placeholder="optional"
            value={challengeId}
            onChange={(e) => {
              setPage(1);
              setChallengeId(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-700">Page size</label>
          <select
            className="border rounded px-3 py-2"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(parseInt(e.target.value, 10));
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-600">Total: {count}</span>
          <button
            className="px-3 py-2 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!hasPrev}
            title="Previous page"
          >
            Prev
          </button>
          <span className="text-sm text-gray-700">Page {page}</span>
          <button
            className="px-3 py-2 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
            title="Next page"
          >
            Next
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">No {status} write-ups.</div>
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
                    className="px-3 py-2 border rounded"
                    onClick={() => openAudit(w.id)}
                    title="View audit trail"
                  >
                    View audit
                  </button>
                  {status === "pending" && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
              <div className="prose max-w-none mt-3 whitespace-pre-wrap">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
                >
                  {w.content_md || ""}
                </ReactMarkdown>
              </div>
              {status !== "pending" && w.moderation_notes ? (
                <div className="mt-3 text-sm">
                  <span className="font-medium">Moderation notes:</span> {w.moderation_notes}
                </div>
              ) : null}
              {status === "pending" && (
                <div className="mt-3">
                  <label className="text-sm text-gray-700">Moderation notes</label>
                  <textarea
                    className="border rounded px-3 py-2 w-full h-20 mt-1"
                    placeholder="Optional notes…"
                    value={notesById[w.id] || ""}
                    onChange={(e) => setNotesById((prev) => ({ ...prev, [w.id]: e.target.value }))}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {auditOpenFor !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium">Audit trail for write-up #{auditOpenFor}</h3>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 border rounded"
                  onClick={exportAuditCsv}
                  title="Export audit to CSV"
                >
                  Export CSV
                </button>
                <button
                  className="px-3 py-2 border rounded"
                  onClick={() => {
                    setAuditOpenFor(null);
                    setAuditRows([]);
                  }}
                  title="Close"
                >
                  Close
                </button>
              </div>
            </div>
            {auditLoading ? (
              <div>Loading…</div>
            ) : auditRows.length === 0 ? (
              <div className="text-sm text-gray-600">No audit entries.</div>
            ) : (
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Actor</th>
                    <th className="p-2 text-left">Action</th>
                    <th className="p-2 text-left">Notes</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((ar, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{new Date(ar.timestamp).toLocaleString()}</td>
                      <td className="p-2">{ar.actor_username || "-"}</td>
                      <td className="p-2">{ar.action}</td>
                      <td className="p-2">{ar.notes || "-"}</td>
                      <td className="p-2">{ar.prev_status} → {ar.new_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}