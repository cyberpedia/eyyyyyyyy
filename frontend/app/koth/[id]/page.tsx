"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";
import { computeWsUrl } from "../../../components/ws";

type KothStatus = {
  owner_team_id: number | null;
  owner_team_name: string | null;
  from_ts?: string;
};

type OwnershipRow = {
  owner_team_id: number;
  owner_team_name: string;
  from_ts: string;
  to_ts: string | null;
  points_awarded: number;
};

export default function KothPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { notify, notifyError } = useToast();
  const [status, setStatus] = useState<KothStatus | null>(null);
  const [history, setHistory] = useState<OwnershipRow[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    fetch(`/api/koth/${id}/status`, { credentials: "include" })
      .then((r) => r.json())
      .then(setStatus)
      .catch((e) => notifyError(e?.message || "Failed to load status."));

    fetch(`/api/koth/${id}/ownership-history`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setHistory(d.results || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(computeWsUrl(`/ws/koth/${id}/status`));
    } catch (_) {
      ws = null;
    }
    if (!ws) return;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "koth") {
          const p = data.payload || {};
          setStatus({
            owner_team_id: p.owner_team_id ?? null,
            owner_team_name: p.owner_team_id ? (history.find(h => h.owner_team_id === p.owner_team_id)?.owner_team_name || status?.owner_team_name || null) : null,
            from_ts: p.from_ts || status?.from_ts,
          });
          setHistory((prev) => [
            { owner_team_id: p.owner_team_id, owner_team_name: status?.owner_team_name || "", from_ts: p.from_ts, to_ts: p.to_ts || null, points_awarded: 0 },
            ...prev,
          ].slice(0, 100));
          notify("info", "KotH ownership update.");
        }
      } catch {
        // ignore malformed messages
      }
    };
    return () => {
      try { ws!.close(); } catch (_) {}
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">King of the Hill</h1>
        <span
          className={`px-2 py-1 text-xs rounded ${
            wsConnected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
          }`}
          title={wsConnected ? "Live updates connected" : "Live updates disconnected"}
        >
          {wsConnected ? "Live" : "Offline"}
        </span>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-2">Current owner</h2>
        {status?.owner_team_id ? (
          <div className="p-3 border rounded">
            <div className="text-xl">🏁 {status.owner_team_name}</div>
            <div className="text-xs text-gray-600">since {status.from_ts || "—"}</div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">No owner yet.</div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Ownership history</h2>
        {history.length === 0 ? (
          <div className="text-sm text-gray-600">No history yet.</div>
        ) : (
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Owner</th>
                <th className="p-2 text-left">From</th>
                <th className="p-2 text-left">To</th>
                <th className="p-2 text-left">Points</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, idx) => (
                <tr key={`${h.owner_team_id}-${idx}`} className="border-t">
                  <td className="p-2">{h.owner_team_name}</td>
                  <td className="p-2 text-xs">{h.from_ts}</td>
                  <td className="p-2 text-xs">{h.to_ts || "—"}</td>
                  <td className="p-2">{h.points_awarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}