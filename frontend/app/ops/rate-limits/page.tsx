"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";

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
  const [scope, setScope] = useState("");
  const [userRate, setUserRate] = useState("");
  const [ipRate, setIpRate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [presetConfig, setPresetConfig] = useState<any | null>(null);
  const [presetEditor, setPresetEditor] = useState<string>("");
  const [me, setMe] = useState<{ isSuperuser?: boolean; isStaff?: boolean } | null>(null);
  const { notify, notifySuccess, notifyError } = useToast();

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reloadAll = async (silent = false) => {
    try {
      setRefreshing(true);
      if (!silent) notify("info", "Refreshing rate limits...");
      const rlRes = await fetch("http://localhost:8000/api/ops/rate-limits", { credentials: "include" });
      const rlData = await rlRes.json().catch(() => ({}));
      if (!rlRes.ok) {
        throw new Error(rlData.detail || `Failed to load rate limits (HTTP ${rlRes.status})`);
      }
      setData(rlData);
      setLastRefreshedAt(new Date().toLocaleString());

      const presetsRes = await fetch("http://localhost:8000/api/ops/rate-limits/presets", { credentials: "include" });
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

  // Auto-refresh effect (60s interval)
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(() => reloadAll(true), 60000);
    return () => clearInterval(iv);
  }, [autoRefresh]);

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
        return n * 60; // tokens per second -> per minute
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
  const [dryRunRows, setDryRunRows] = useState<DryRow[]>([]);
  const [dryRunOverrides, setDryRunOverrides] = useState<Record<string, { user_rate: string; ip_rate: string }> | null>(null);
  const [dryRunTitle, setDryRunTitle] = useState<string>("");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [confirmScope, setConfirmScope] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  // Additional confirmations
  const [confirmClearAllCache, setConfirmClearAllCache] = useState(false);
  const [confirmClearScope, setConfirmClearScope] = useState<string | null>(null);
  const [confirmRemoveScope, setConfirmRemoveScope] = useState<string | null>(null);

  

  useEffect(() => {
    fetch("http://localhost:8000/api/ops/rate-limits", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLastRefreshedAt(new Date().toLocaleString());
      })
      .catch((e) => {
        setError(e.message);
        notifyError(e.message || "Failed to load rate limits.");
      });

    fetch("http://localhost:8000/api/ops/rate-limits/presets", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        setPresetConfig(d);
        setPresetEditor(JSON.stringify(d, null, 2));
      })
      .catch((e) => {
        setError(e.message);
        notifyError(e.message || "Failed to load presets.");
     _code }new)</;
;

    fetch("http://localhost:8000/api/users/me", { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : {}))
      .then((d) => setMe({ isSuperuser: d.isSuperuser, isStaff: d.isStaff }))
      .catch(() => {});
  }, []);

  const getCsrfToken = () => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      const r = await fetch("http://localhost:8000/api/ops/rate-limits", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({ scope, user_rate: userRate, ip_rate: ipRate }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.detail || `HTTP ${r.status}`);
      }
      setData(d);
      setMsg("Updated rate limits.");
      notifySuccess("Updated rate limits.");
    } catch (e: any) {
      setError(e.message || "Update failed.");
      notifyError(e.message || "Update failed.");
    }
  };

  const clearCache = () => {
    setConfirmClearAllCache(true);
  };

  const doClearCacheAll = async () => {
    setMsg(null);
    setError(null);
    try {
      const r = await fetch("http://localhost:8000/api/ops/rate-limits/cache", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      setMsg("Cleared cache.");
      notifySuccess("Cleared all rate-limit cache.");
    } catch (e: any) {
      setError(e.message || "Clear cache failed.");
      notifyError(e.message || "Clear cache failed.");
    }
  };

  const clearCacheScope = (s: string) => {
    setConfirmClearScope(s);
  };

  const doClearCacheScope = async (s: string) => {
    setMsg(null);
    setError(null);
    try {
      const r = await fetch("http://localhost:8000/api/ops/rate-limits/cache", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({ scope: s }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      setMsg(`Cleared cache for ${s}.`);
      notifySuccess(`Cleared cache for ${s}.`);
    } catch (e: any) {
      setError(e.message || "Clear cache failed.");
      notifyError(e.message || "Clear cache failed.");
    }
  };

  const populateEdit = (s: string, ur: string, ir: string) => {
    setScope(s);
    setUserRate(ur || "");
    setIpRate(ir || "");
  };

  const removeOverride = (s: string) => {
    setConfirmRemoveScope(s);
  };

  const doRemoveOverride = async (s: string) => {
    setMsg(null);
    setError(null);
    try {
      const r = await fetch(`http://localhost:8000/api/ops/rate-limits?scope=${encodeURIComponent(s)}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken(),
        },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setData(d);
      setMsg(`Removed override for ${s}.`);
      notifySuccess(`Removed override for ${s}.`);
    } catch (e: any) {
      setError(e.message || "Remove override failed.");
      notifyError(e.message || "Remove override failed.");
    }
  };

  const applyPreset = async (preset: "competition" | "practice" | "heavy") => {
    setMsg(null);
    setError(null);
    if (!presetConfig?.presets || !presetConfig.presets[preset]) {
      setError("Preset config not loaded or preset missing.");
      return;
    }
    const presets = presetConfig.presets[preset];

    try {
      for (const [s, rates] of Object.entries(presets)) {
        const r = await fetch("http://localhost:8000/api/ops/rate-limits", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken(),
          },
          body: JSON.stringify({ scope: s, user_rate: (rates as any).user_rate, ip_rate: (rates as any).ip_rate }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `Failed applying ${preset} preset for scope ${s} (HTTP ${r.status})`);
        }
      }
      const rr = await fetch("http://localhost:8000/api/ops/rate-limits", { credentials: "include" });
      const dd = await rr.json().catch(() => ({}));
      if (!rr.ok) throw new Error(dd.detail || `HTTP ${rr.status}`);
      setData(dd);
      setMsg(`Applied ${preset} preset.`);
      notifySuccess(`Applied ${preset} preset.`);
    } catch (e: any) {
      setError(e.message || "Apply preset failed.");
      notifyError(e.message || "Apply preset failed.");
    }
  };

  const applyEnvPreset = async (env: "dev" | "staging" | "prod") => {
    setMsg(null);
    setError(null);
    if (!presetConfig?.env_presets || !presetConfig.env_presets[env]) {
      setError("Environment preset config not loaded or preset missing.");
      return;
    }
    const presets = presetConfig.env_presets[env];

    try {
      for (const [s, rates] of Object.entries(presets)) {
        const r = await fetch("http://localhost:8000/api/ops/rate-limits", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken(),
          },
          body: JSON.stringify({ scope: s, user_rate: (rates as any).user_rate, ip_rate: (rates as any).ip_rate }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `Failed applying ${env} preset for scope ${s} (HTTP ${r.status})`);
        }
      }
      const rr = await fetch("http://localhost:8000/api/ops/rate-limits", { credentials: "include" });
      const dd = await rr.json().catch(() => ({}));
      if (!rr.ok) throw new Error(dd.detail || `HTTP ${rr.status}`);
      setData(dd);
      setMsg(`Applied ${env} environment preset.`);
      notifySuccess(`Applied ${env} environment preset.`);
    } catch (e: any) {
      setError(e.message || "Apply environment preset failed.");
      notifyError(e.message || "Apply environment preset failed.");
    }
  };

  const dryRunCompute = (overrides: Record<string, { user_rate: string; ip_rate: string }>) => {
    if (!data) return;
    const rows: DryRow[] = [];
    const defaults = data.defaults || {};
    const effective = data.effective || {};
    for (const [scope, rates] of Object.entries(overrides)) {
      const current_user = (effective[scope]?.user_rate as string | undefined) ?? (defaults[scope] as string | undefined);
      const current_ip = (effective[scope]?.ip_rate as string | undefined) ?? (defaults[`${scope}-ip`] as string | undefined);
      const override_user_blank = (rates.user_rate ?? "") === "";
      const override_ip_blank = (rates.ip_rate ?? "") === "";
      const new_user = override_user_blank ? (defaults[scope] as string | undefined) : (rates.user_rate as string);
      const new_ip = override_ip_blank ? (defaults[`${scope}-ip`] as string | undefined) : (rates.ip_rate as string);

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
        scope,
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
    setMsg(null);
    setError(null);
    if (!presetConfig?.presets || !presetConfig.presets[preset]) {
      setError("Preset config not loaded or preset missing.");
      return;
    }
    setDryRunTitle(`Dry-run: ${preset} preset`);
    dryRunCompute(presetConfig.presets[preset]);
  };

  const dryRunEnvPreset = (env: "dev" | "staging" | "prod") => {
    setMsg(null);
    setError(null);
    if (!presetConfig?.env_presets || !presetConfig.env_presets[env]) {
      setError("Environment preset config not loaded or preset missing.");
      return;
    }
    setDryRunTitle(`Dry-run: ${env} environment preset`);
    dryRunCompute(presetConfig.env_presets[env]);
  };

  if (error) {
    return <div className="text-red-700">Error: {error}. Ensure you are logged in and have staff privileges.</div>;
  }
  if (!data) return <div>Loading...</div>;

  const scopes = Object.keys(data.effective);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rate Limits (Ops)</h1>
          <div className="text-xs text-gray-600">Last refreshed: {lastRefreshedAt || "—"}</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 60s
          </label>
          {me?.isStaff ? (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">Staff</span>
          ) : (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">Not staff</span>
          )}
          {me?.isSuperuser && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">Superuser</span>}
          <button
            onClick={() => reloadAll(false)}
            className="px-3 py-2 border rounded hover:bg-gray-50"
            disabled={refreshing}
            title="Reload rate limits and presets"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={clearCache} className="bg-gray-200 px-3 py-2 rounded hover:bg-gray-300">
            Clear all cache
          </button>
        </div>
      </div>

      

      {/* Confirm modals for cache clear and override removal */}
      {confirmClearAllCache && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-2">Clear all rate-limit cache?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will remove all cached rate-limit values and force re-read from DB/defaults.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-3 py-2 border rounded"
                disabled={applyLoading}
                onClick={() => setConfirmClearAllCache(false)}
              >
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
            <p className="text-sm text-gray-600 mb-4">
              This will remove cached values for this scope.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-3 py-2 border rounded"
                disabled={applyLoading}
                onClick={() => setConfirmClearScope(null)}
              >
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
            <p className="text-sm text-gray-600 mb-4">
              This will delete the DB override row for this scope.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-3 py-2 border rounded"
                disabled={applyLoading}
                onClick={() => setConfirmRemoveScope(null)}
              >
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
        <h2 className="text-lg font-medium mb-2">Presets</h2>
        <div className="space-x-2">
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded"
            onClick={() => applyPreset("competition")}
          >
            Competition mode
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunPreset("competition")}>
            Preview
          </button>
          <button
