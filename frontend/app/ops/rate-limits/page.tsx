"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";

type RateDefaults = Record<string, string>;
type DbOverride = { scope: string; user_rate: string; ip_rate: string; updated_at: string };
type Effective = Record<string, { user_rate?: string; ip_rate?: string }>;
type CacheState = Record<string, { user_cached: boolean; user_value: string | null; ip_cached: boolean; ip_value: string | null }>;

type ApiResponse = {
  defaults: RateDefaults;
  db_overrides: DbOverride[];
  effective: Effective;
  cache: CacheState;
};

type DryRow = {
  scope: string;
  current_user_rate?: string;
  current_ip_rate?: string;
  new_user_rate?: string;
  new_ip_rate?: string;
  changed_user: boolean;
  changed_ip: boolean;
  user_direction: "up" | "down" | "same";
  ip_direction: "up" | "down" | "same";
  user_fallback: boolean;
  ip_fallback: boolean;
};

export default function OpsRateLimitsPage() {
  const { notify, notifySuccess, notifyError } = useToast();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState("");
  const [userRate, setUserRate] = useState("");
  const [ipRate, setIpRate] = useState("");

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(60000);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [lastRefreshedTs, setLastRefreshedTs] = useState<number | null>(null);
  const [nextRefreshSecondsLeft, setNextRefreshSecondsLeft] = useState<number | null>(null);

  const [confirmClearAllCache, setConfirmClearAllCache] = useState(false);
  const [confirmClearScope, setConfirmClearScope] = useState<string | null>(null);
  const [confirmRemoveScope, setConfirmRemoveScope] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  const [presetConfig, setPresetConfig] = useState<any | null>(null);
  const [presetEditor, setPresetEditor] = useState<string>("");
  const [dryRunRows, setDryRunRows] = useState<DryRow[]>([]);
  const [dryRunOverrides, setDryRunOverrides] = useState<Record<string, { user_rate: string; ip_rate: string }> | null>(null);
  const [dryRunTitle, setDryRunTitle] = useState<string>("");

  // Persisted preferences keys
  const AUTO_REFRESH_KEY = "opsRateLimits:autoRefresh";
  const AUTO_REFRESH_INTERVAL_KEY = "opsRateLimits:autoRefreshIntervalMs";

  // Load persisted prefs on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const savedToggle = window.localStorage.getItem(AUTO_REFRESH_KEY);
      if (savedToggle !== null) setAutoRefresh(savedToggle === "1");
      const savedInterval = window.localStorage.getItem(AUTO_REFRESH_INTERVAL_KEY);
      if (savedInterval !== null) {
        const ms = parseInt(savedInterval, 10);
        if ([30000, 60000, 120000].includes(ms)) {
          setAutoRefreshInterval(ms);
        }
      }
    } catch (_) {}
  }, []);

  // Persist changes
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(AUTO_REFRESH_KEY, autoRefresh ? "1" : "0");
      window.localStorage.setItem(AUTO_REFRESH_INTERVAL_KEY, String(autoRefreshInterval));
    } catch (_) {}
  }, [autoRefresh, autoRefreshInterval]);

  const getCsrfToken = () => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  };

  const reloadAll = async (silent = false) => {
    try {
      setRefreshing(true);
      if (!silent) notify("info", "Refreshing rate limits...");
      const rlRes = await fetch("/api/ops/rate-limits", { credentials: "include" });
      const rlData = await rlRes.json().catch(() => ({}));
      if (!rlRes.ok) {
        throw new Error(rlData.detail || `Failed to load rate limits (HTTP ${rlRes.status})`);
      }
      setData(rlData);
      setLastRefreshedAt(new Date().toLocaleString());
      setLastRefreshedTs(Date.now());

      const presetsRes = await fetch("/api/ops/rate-limits/presets", { credentials: "include" });
      const presetsData = await presetsRes.json().catch(() => ({}));
      if (presetsRes.ok) {
        setPresetConfig(presetsData);
        setPresetEditor(JSON.stringify(presetsData, null, 2));
      } else {
        notifyError(presetsData.detail || `Failed to load presets (HTTP ${presetsRes.status})`);
      }

      if (!silent) notifySuccess("Refreshed rate limits.");
    } catch (e: any) {
      notifyError(e?.message || "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    reloadAll(true);
  }, []);

  // Auto-refresh effect (configurable interval)
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(() => reloadAll(true), autoRefreshInterval);
    return () => clearInterval(iv);
  }, [autoRefresh, autoRefreshInterval]);

  // Countdown to next refresh (updates every second)
  useEffect(() => {
    if (!autoRefresh || lastRefreshedTs == null) {
      setNextRefreshSecondsLeft(null);
      return;
    }
    const endTs = lastRefreshedTs + autoRefreshInterval;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
      setNextRefreshSecondsLeft(rem);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [autoRefresh, autoRefreshInterval, lastRefreshedTs]);

  // Helpers to compare rates across units by normalizing to tokens per minute
  const rateToPerMinute = (rate?: string | null): number | undefined => {
    if (!rate) return undefined;
    const m = rate.match(/^(\d+)\/(sec|second|min|minute|hour|day)$/);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    switch (unit) {
      case "sec":
      case "second":
        return n * 60;
      case "min":
      case "minute":
        return n;
      case "hour":
        return n / 60;
      case "day":
        return n / (60 * 24);
      default:
        return undefined;
    }
  };

  const dryRunCompute = (overrides: Record<string, { user_rate: string; ip_rate: string }>) => {
    if (!data) return;
    const rows: DryRow[] = [];
    const defaults = data.defaults || {};
    const effective = data.effective || {};
    for (const [sc, rates] of Object.entries(overrides)) {
      const current_user = (effective[sc]?.user_rate as string | undefined) ?? (defaults[sc] as string | undefined);
      const current_ip = (effective[sc]?.ip_rate as string | undefined) ?? (defaults[`${sc}-ip`] as string | undefined);
      const override_user_blank = (rates.user_rate ?? "") === "";
      const override_ip_blank = (rates.ip_rate ?? "") === "";
      const new_user = override_user_blank ? (defaults[sc] as string | undefined) : (rates.user_rate as string);
      const new_ip = override_ip_blank ? (defaults[`${sc}-ip`] as string | undefined) : (rates.ip_rate as string);

      const cur_user_pm = rateToPerMinute(current_user);
      const new_user_pm = rateToPerMinute(new_user);
      const cur_ip_pm = rateToPerMinute(current_ip);
      const new_ip_pm = rateToPerMinute(new_ip);

      const user_changed = (new_user ?? "") !== (current_user ?? "");
      const ip_changed = (new_ip ?? "") !== (current_ip ?? "");
      const user_dir: "up" | "down" | "same" =
        !user_changed || cur_user_pm === undefined || new_user_pm === undefined
          ? "same"
          : new_user_pm > cur_user_pm
          ? "up"
          : new_user_pm < cur_user_pm
          ? "down"
          : "same";
      const ip_dir: "up" | "down" | "same" =
        !ip_changed || cur_ip_pm === undefined || new_ip_pm === undefined
          ? "same"
          : new_ip_pm > cur_ip_pm
          ? "up"
          : new_ip_pm < cur_ip_pm
          ? "down"
          : "same";

      rows.push({
        scope: sc,
        current_user_rate: current_user,
        current_ip_rate: current_ip,
        new_user_rate: new_user,
        new_ip_rate: new_ip,
        changed_user: user_changed,
        changed_ip: ip_changed,
        user_direction: user_dir,
        ip_direction: ip_dir,
        user_fallback: override_user_blank,
        ip_fallback: override_ip_blank,
      });
    }
    setDryRunRows(rows);
    setDryRunOverrides(overrides);
  };

  const dryRunPreset = (preset: "competition" | "practice" | "heavy") => {
    if (!presetConfig?.presets || !presetConfig.presets[preset]) {
      notifyError("Preset config not loaded or preset missing.");
      return;
    }
    setDryRunTitle(`Dry-run: ${preset} preset`);
    dryRunCompute(presetConfig.presets[preset]);
  };

  const dryRunEnvPreset = (env: "dev" | "staging" | "prod") => {
    if (!presetConfig?.env_presets || !presetConfig.env_presets[env]) {
      notifyError("Environment preset config not loaded or preset missing.");
      return;
    }
    setDryRunTitle(`Dry-run: ${env} environment preset`);
    dryRunCompute(presetConfig.env_presets[env]);
  };

  const applyFromDryRun = async () => {
    if (!dryRunOverrides) return;
    try {
      for (const [s, rates] of Object.entries(dryRunOverrides)) {
        const r = await fetch("/api/ops/rate-limits", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
          body: JSON.stringify({ scope: s, user_rate: (rates as any).user_rate, ip_rate: (rates as any).ip_rate }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `Failed applying override for scope ${s} (HTTP ${r.status})`);
        }
      }
      await reloadAll(true);
      setDryRunRows([]);
      setDryRunOverrides(null);
      setDryRunTitle("");
      notifySuccess("Applied dry-run overrides.");
    } catch (e: any) {
      notifyError(e?.message || "Apply from preview failed.");
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch("/api/ops/rate-limits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ scope, user_rate: userRate, ip_rate: ipRate }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      notifySuccess("Updated rate limits.");
    } catch (e: any) {
      notifyError(e?.message || "Update failed.");
    }
  };

  const doClearCacheAll = async () => {
    try {
      const r = await fetch("/api/ops/rate-limits/cache", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      notifySuccess("Cleared all rate-limit cache.");
    } catch (e: any) {
      notifyError(e?.message || "Clear cache failed.");
    }
  };

  const doClearCacheScope = async (s: string) => {
    try {
      const r = await fetch("/api/ops/rate-limits/cache", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ scope: s }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      notifySuccess(`Cleared cache for ${s}.`);
    } catch (e: any) {
      notifyError(e?.message || "Clear cache failed.");
    }
  };

  const doRemoveOverride = async (s: string) => {
    try {
      const r = await fetch(`/api/ops/rate-limits?scope=${encodeURIComponent(s)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      notifySuccess(`Removed override for ${s}.`);
    } catch (e: any) {
      notifyError(e?.message || "Remove override failed.");
    }
  };

  if (error) {
    return <div className="text-red-700">Error: {error}. Ensure you are logged in and have staff privileges.</div>;
  }
  if (!data) return <div>Loading...</div>;

  const scopes = Object.keys(data.effective || {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rate Limits (Ops)</h1>
          <div className="text-xs text-gray-600">Last refreshed: {lastRefreshedAt || "—"}</div>
          {autoRefresh && <div className="text-xs text-gray-600">Next refresh in: {nextRefreshSecondsLeft ?? "—"}s</div>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                title="Enable periodic refresh"
              />
              Auto-refresh
            </label>
            <select
              className="border rounded px-2 py-1"
              value={autoRefreshInterval}
              disabled={!autoRefresh || refreshing}
              onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value, 10))}
              title="Auto-refresh interval"
            >
              <option value={30000}>30s</option>
              <option value={60000}>60s</option>
              <option value={120000}>120s</option>
            </select>
          </div>
          <button
            onClick={() => reloadAll(false)}
            className="px-3 py-2 border rounded hover:bg-gray-50"
            disabled={refreshing}
            title="Reload rate limits and presets"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={() => setConfirmClearAllCache(true)} className="bg-gray-200 px-3 py-2 rounded hover:bg-gray-300">
            Clear all cache
          </button>
        </div>
      </div>

      {/* Confirm modals */}
      {confirmClearAllCache && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-2">Clear all rate-limit cache?</h3>
            <p className="text-sm text-gray-600 mb-4">This will remove all cached rate-limit values.</p>
            <div className="flex justify-end space-x-2">
              <button className="px-3 py-2 border rounded" disabled={applyLoading} onClick={() => setConfirmClearAllCache(false)}>
                Cancel
              </button>
              <button
                className={`px-3 py-2 rounded ${applyLoading ? "bg-blue-300" : "bg-blue-600"} text-white`}
                disabled={applyLoading}
                onClick={async () => {
                  setApplyLoading(true);
                  await doClearCacheAll();
                  setConfirmClearAllCache(false);
                  setApplyLoading(false);
                }}
              >
                Confirm clear
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmClearScope && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-2">Clear cache for “{confirmClearScope}”?</h3>
            <p className="text-sm text-gray-600 mb-4">This will remove cached values for this scope.</p>
            <div className="flex justify-end space-x-2">
              <button className="px-3 py-2 border rounded" disabled={applyLoading} onClick={() => setConfirmClearScope(null)}>
                Cancel
              </button>
              <button
                className={`px-3 py-2 rounded ${applyLoading ? "bg-blue-300" : "bg-blue-600"} text-white`}
                disabled={applyLoading}
                onClick={async () => {
                  if (!confirmClearScope) return;
                  setApplyLoading(true);
                  await doClearCacheScope(confirmClearScope);
                  setConfirmClearScope(null);
                  setApplyLoading(false);
                }}
              >
                Confirm clear
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveScope && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-2">Remove override for “{confirmRemoveScope}”?</h3>
            <p className="text-sm text-gray-600 mb-4">This will delete the DB override row for this scope.</p>
            <div className="flex justify-end space-x-2">
              <button className="px-3 py-2 border rounded" disabled={applyLoading} onClick={() => setConfirmRemoveScope(null)}>
                Cancel
              </button>
              <button
                className={`px-3 py-2 rounded ${applyLoading ? "bg-red-300" : "bg-red-600"} text-white`}
                disabled={applyLoading}
                onClick={async () => {
                  if (!confirmRemoveScope) return;
                  setApplyLoading(true);
                  await doRemoveOverride(confirmRemoveScope);
                  setConfirmRemoveScope(null);
                  setApplyLoading(false);
                }}
              >
                Confirm remove
              </button>
            </div>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-lg font-medium mb-2">Effective Rates</h2>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Scope</th>
              <th className="p-2 text-left">User rate</th>
              <th className="p-2 text-left">IP rate</th>
              <th className="p-2 text-left">Cache</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={s} className="border-t">
                <td className="p-2">{s}</td>
                <td className="p-2">{data.effective[s]?.user_rate ?? data.defaults[s] ?? "-"}</td>
                <td className="p-2">{data.effective[s]?.ip_rate ?? data.defaults[`${s}-ip`] ?? "-"}</td>
                <td className="p-2 text-xs">
                  U: {data.cache[s]?.user_cached ? "cached" : "—"} ({data.cache[s]?.user_value ?? "—"}) • I:{" "}
                  {data.cache[s]?.ip_cached ? "cached" : "—"} ({data.cache[s]?.ip_value ?? "—"})
                </td>
                <td className="p-2">
                  <button className="px-2 py-1 border rounded text-sm" onClick={() => setConfirmClearScope(s)}>
                    Clear cache
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">DB Overrides</h2>
        {data.db_overrides.length === 0 ? (
          <div className="text-sm text-gray-600">No overrides.</div>
        ) : (
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Scope</th>
                <th className="p-2 text-left">User rate</th>
                <th className="p-2 text-left">IP rate</th>
                <th className="p-2 text-left">Updated</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.db_overrides.map((o) => (
                <tr key={o.scope} className="border-t">
                  <td className="p-2">{o.scope}</td>
                  <td className="p-2">{o.user_rate || "—"}</td>
                  <td className="p-2">{o.ip_rate || "—"}</td>
                  <td className="p-2 text-xs">{new Date(o.updated_at).toLocaleString()}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 border rounded text-sm" onClick={() => setConfirmRemoveScope(o.scope)}>
                        Remove
                      </button>
                      <button className="px-2 py-1 border rounded text-sm" onClick={() => setConfirmClearScope(o.scope)}>
                        Clear cache
                      </button>
                      <button className="px-2 py-1 border rounded text-sm" onClick={() => {
                        setScope(o.scope);
                        setUserRate(o.user_rate || "");
                        setIpRate(o.ip_rate || "");
                      }}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Update Override</h2>
        <form onSubmit={onSubmit} className="space-y-2">
          <div className="flex items-center gap-2">
            <input className="border rounded px-3 py-2" placeholder="scope" value={scope} onChange={(e) => setScope(e.target.value)} />
            <input className="border rounded px-3 py-2" placeholder="user_rate (e.g., 10/min)" value={userRate} onChange={(e) => setUserRate(e.target.value)} />
            <input className="border rounded px-3 py-2" placeholder="ip_rate (e.g., 30/min)" value={ipRate} onChange={(e) => setIpRate(e.target.value)} />
            <button className="bg-blue-600 text-white px-3 py-2 rounded" type="submit">Save</button>
          </div>
          <div className="text-xs text-gray-600">Blank user_rate or ip_rate clears that override and falls back to default.</div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Presets</h2>
        <div className="space-x-2">
          <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={() => dryRunPreset("competition")}>Preview competition</button>
          <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={() => dryRunPreset("practice")}>Preview practice</button>
          <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={() => dryRunPreset("heavy")}>Preview heavy</button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunEnvPreset("dev")}>Preview dev env</button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunEnvPreset("staging")}>Preview staging env</button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunEnvPreset("prod")}>Preview prod env</button>
        </div>

        {dryRunRows.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-medium">{dryRunTitle}</h3>
              <div className="flex items-center gap-2">
                <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={applyFromDryRun}>Apply these changes</button>
                <button className="px-3 py-2 border rounded" onClick={() => { setDryRunRows([]); setDryRunOverrides(null); setDryRunTitle(""); }}>Clear</button>
              </div>
            </div>
            <table className="min-w-full border mt-2">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Scope</th>
                  <th className="p-2 text-left">User (current → new)</th>
                  <th className="p-2 text-left">IP (current → new)</th>
                  <th className="p-2 text-left">Fallback</th>
                </tr>
              </thead>
              <tbody>
                {dryRunRows.map((r) => (
                  <tr key={r.scope} className="border-t">
                    <td className="p-2">{r.scope}</td>
                    <td className={`p-2 ${r.user_direction === "up" ? "text-green-700" : r.user_direction === "down" ? "text-red-700" : "text-gray-700"}`}>
                      {(r.current_user_rate ?? "—")} → {(r.new_user_rate ?? "—")}
                    </td>
                    <td className={`p-2 ${r.ip_direction === "up" ? "text-green-700" : r.ip_direction === "down" ? "text-red-700" : "text-gray-700"}`}>
                      {(r.current_ip_rate ?? "—")} → {(r.new_ip_rate ?? "—")}
                    </td>
                    <td className="p-2 text-xs">
                      {r.user_fallback ? "user:default " : ""}{r.ip_fallback ? "ip:default" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

