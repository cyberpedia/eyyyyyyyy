"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";

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
  const { notifyError } = useToast();
  const [status, setStatus] = useState<KothStatus | null>(null);
  const [history, setHistory] = useState<OwnershipRow[]>([]);

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">King of the Hill</h1>

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