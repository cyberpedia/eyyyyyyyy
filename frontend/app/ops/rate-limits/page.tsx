"use client";

import React, { useEffect, useState } from "react";

type RateDefaults = Record<string, string>;
type DbOverride = { scope: string; user_rate: string; ip_rate: string; updated_at: string };
type Effective = Record<string, { user_rate: string | undefined; ip_rate: string | undefined }>;
type CacheState = Record<
  string,
  { user_cached: boolean; user_value: string | null; ip_cached: boolean; ip_value: string | null }
>;

type ApiResponse = {
  defaults: RateDefaults;
  db_overrides: DbOverride[];
  effective: Effective;
  cache: CacheState;
};

export default function OpsRateLimitsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/ops/rate-limits", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <div className="text-red-700">Error: {error}. Ensure you are logged in and have staff privileges.</div>;
  }
  if (!data) return <div>Loading...</div>;

  const scopes = Object.keys(data.effective);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Rate Limits (Ops)</h1>

      <section>
        <h2 className="text-lg font-medium mb-2">Effective Rates</h2>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Scope</th>
              <th className="p-2 text-left">User rate</th>
              <th className="p-2 text-left">IP rate</th>
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={s} className="border-t">
                <td className="p-2">{s}</td>
                <td className="p-2">{data.effective[s]?.user_rate || "-"}</td>
                <td className="p-2">{data.effective[s]?.ip_rate || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">DB Overrides</h2>
        {data.db_overrides.length === 0 ? (
          <div className="text-sm text-gray-600">No overrides configured.</div>
        ) : (
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Scope</th>
                <th className="p-2 text-left">User rate</th>
                <th className="p-2 text-left">IP rate</th>
                <th className="p-2 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.db_overrides.map((r) => (
                <tr key={r.scope} className="border-t">
                  <td className="p-2">{r.scope}</td>
                  <td className="p-2">{r.user_rate || "-"}</td>
                  <td className="p-2">{r.ip_rate || "-"}</td>
                  <td className="p-2">{new Date(r.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Cache State</h2>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Scope</th>
              <th className="p-2 text-left">User cached</th>
              <th className="p-2 text-left">User value</th>
              <th className="p-2 text-left">IP cached</th>
              <th className="p-2 text-left">IP value</th>
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={s} className="border-t">
                <td className="p-2">{s}</td>
                <td className="p-2">{data.cache[s]?.user_cached ? "yes" : "no"}</td>
                <td className="p-2">{data.cache[s]?.user_value || "-"}</td>
                <td className="p-2">{data.cache[s]?.ip_cached ? "yes" : "no"}</td>
                <td className="p-2">{data.cache[s]?.ip_value || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-600 mt-2">
          Cache entries reflect DB overrides cached for ~60s. Clearing cache will force immediate re-read of DB values.
        </p>
      </section>
    </div>
  );
}