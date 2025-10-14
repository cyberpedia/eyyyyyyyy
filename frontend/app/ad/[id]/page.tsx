"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";
import { computeWsUrl } from "../../../components/ws";

type ServiceRow = {
  team_id: number;
  team_name: string;
  status: string;
  endpoint_url: string;
  last_check_at: string | null;
};

type AttackLogRow = {
  id: number;
  attacker_team_id: number;
  victim_team_id: number;
  tick: number;
  points_awarded: number;
  created_at: string;
};

export default function AttackDefensePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { notify, notifySuccess, notifyError } = useToast();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [logs, setLogs] = useState<AttackLogRow[]>([]);
  const [token, setToken] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    fetch(`/api/ad/${id}/services/status`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setServices(d.results || []))
      .catch((e) => notifyError(e?.message || "Failed to load services."));

    fetch(`/api/ad/${id}/attack-log`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLogs(d.results || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(computeWsUrl(`/ws/ad/${id}/status`));
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
        if (data?.type === "status") {
          setServices(data.payload || []);
        } else if (data?.type === "attack") {
          setLogs((prev) => [data.payload, ...prev].slice(0, 100));
          notify("info", "New attack event.");
        }
      } catch {
        // ignore malformed messages
      }
    };
    return () => {
      try { ws!.close(); } catch (_) {}
    };
  }, [id]);

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      notify("info", "Submitting token...");
      const r = await fetch(`/api/ad/${id}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        notifyError(d.detail || "Invalid token.");
        return;
      }
      notifySuccess(`Attack success (+${d.points_awarded} pts)`);
      setToken("");
      // Refresh logs
      const lr = await fetch(`/api/ad/${id}/attack-log`, { credentials: "include" });
      const ld = await lr.json().catch(() => ({}));
      setLogs(ld.results || []);
    } catch (e: any) {
      notifyError(e?.message || "Submit failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Attack-Defense</h1>
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
        <h2 className="text-lg font-medium mb-2">Submit captured token</h2>
        <form onSubmit={submitToken} className="space-y-2">
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Paste captured token…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit">Submit Token</button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Service status</h2>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Team</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Endpoint</th>
              <th className="p-2 text-left">Last check</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.team_id} className="border-t">
                <td className="p-2">{s.team_name}</td>
                <td className="p-2">{s.status}</td>
                <td className="p-2">{s.endpoint_url || "—"}</td>
                <td className="p-2 text-xs">{s.last_check_at || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Recent attacks</h2>
        {logs.length === 0 ? (
          <div className="text-sm text-gray-600">No attack events yet.</div>
        ) : (
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Tick</th>
                <th className="p-2 text-left">Attacker</th>
                <th className="p-2 text-left">Victim</th>
                <th className="p-2 text-left">Points</th>
                <th className="p-2 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.tick}</td>
                  <td className="p-2">{l.attacker_team_id}</td>
                  <td className="p-2">{l.victim_team_id}</td>
                  <td className="p-2">{l.points_awarded}</td>
                  <td className="p-2 text-xs">{l.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}