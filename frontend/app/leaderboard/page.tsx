"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../components/ToastProvider";

type Row = {
  rank: number;
  team_id: number;
  team_name: string;
  score: number;
};

export default function LeaderboardPage() {
  const { notify, notifyError } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [asOf, setAsOf] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const loadLeaderboard = () => {
    setLoading(true);
    notify("info", "Loading leaderboard...");
    fetch("http://localhost:8000/api/leaderboard", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.results || []);
        setAsOf(d.as_of || "");
      })
      .catch((e) => {
        notifyError(e?.message || "Failed to load leaderboard.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  // WebSocket live updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket("ws://localhost:8000/ws/leaderboard");
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
        if (data?.results) {
          setRows(data.results);
          setAsOf(data.as_of || "");
          notify("info", "Leaderboard updated in real time.");
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      try {
        ws.close();
      } catch (_) {}
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leaderboard</h1>
          <div className="text-xs text-gray-600">As of: {asOf}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs rounded ${
              wsConnected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
            }`}
            title={wsConnected ? "Live updates connected" : "Live updates disconnected"}
          >
            {wsConnected ? "Live" : "Offline"}
          </span>
          <button
            className="px-3 py-2 border rounded hover:bg-gray-50"
            onClick={loadLeaderboard}
            disabled={loading}
            title="Reload leaderboard"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>
      <table className="min-w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">Rank</th>
            <th className="p-2 text-left">Team</th>
            <th className="p-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team_id} className="border-t">
              <td className="p-2">{r.rank}</td>
              <td className="p-2">{r.team_name}</td>
              <td className="p-2 text-right">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}