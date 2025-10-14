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
  const [rows, setRows] = useState<Row[]>([]);
  const [asOf, setAsOf] = useState<string>("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <button
          className="px-3 py-2 border rounded hover:bg-gray-50"
          onClick={loadLeaderboard}
          disabled={loading}
          title="Reload leaderboard"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div className="text-sm text-gray-600">As of: {asOf}</div>
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