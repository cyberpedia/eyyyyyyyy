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
  const [scope, setScope] = useState("");
  const [userRate, setUserRate] = useState("");
  const [ipRate, setIpRate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [presetConfig, setPresetConfig] = useState<any | null>(null);
  const [presetEditor, setPresetEditor] = useState<string>("");
  const [me, setMe] = useState<{ isSuperuser?: boolean; isStaff?: boolean } | null>(null);

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
      .catch((e) => setError(e.message));

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
    } catch (e: any) {
      setError(e.message || "Update failed.");
    }
  };

  const clearCache = async () => {
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
    } catch (e: any) {
      setError(e.message || "Clear cache failed.");
    }
  };

  const clearCacheScope = async (s: string) => {
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
    } catch (e: any) {
      setError(e.message || "Clear cache failed.");
    }
  };

  const populateEdit = (s: string, ur: string, ir: string) => {
    setScope(s);
    setUserRate(ur || "");
    setIpRate(ir || "");
  };

  const removeOverride = async (s: string) => {
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
    } catch (e: any) {
      setError(e.message || "Remove override failed.");
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
    } catch (e: any) {
      setError(e.message || "Apply preset failed.");
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
    } catch (e: any) {
      setError(e.message || "Apply environment preset failed.");
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
        <h1 className="text-2xl font-semibold">Rate Limits (Ops)</h1>
        <div className="flex items-center gap-2">
          {me?.isStaff ? (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">Staff</span>
          ) : (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">Not staff</span>
          )}
          {me?.isSuperuser && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">Superuser</span>}
          <button onClick={clearCache} className="bg-gray-200 px-3 py-2 rounded hover:bg-gray-300">
            Clear all cache
          </button>
        </div>
      </div>

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
            className="bg-green-600 text-white px-3 py-2 rounded"
            onClick={() => applyPreset("practice")}
          >
            Practice mode
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunPreset("practice")}>
            Preview
          </button>
          <button
            className="bg-purple-600 text-white px-3 py-2 rounded"
            onClick={() => applyPreset("heavy")}
          >
            Heavy load mode
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunPreset("heavy")}>
            Preview
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Presets quickly apply recommended limits for login and flag submissions. Adjust as needed for your event.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Environment Presets</h2>
        <div className="space-x-2">
          <button
            className="bg-gray-800 text-white px-3 py-2 rounded"
            onClick={() => applyEnvPreset("dev")}
          >
            Dev
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunEnvPreset("dev")}>
            Preview
          </button>
          <button
            className="bg-gray-600 text-white px-3 py-2 rounded"
            onClick={() => applyEnvPreset("staging")}
          >
            Staging
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunEnvPreset("staging")}>
            Preview
          </button>
          <button
            className="bg-gray-400 text-black px-3 py-2 rounded"
            onClick={() => applyEnvPreset("prod")}
          >
            Prod
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => dryRunEnvPreset("prod")}>
            Preview
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Environment presets are suggestions. Apply in each environment separately.
        </p>
      </section>

      {me?.isSuperuser ? (
        <section>
          <h2 className="text-lg font-medium mb-2">Presets Editor</h2>
          <p className="text-xs text-gray-600 mb-2">
            Edit the presets JSON and save. Structure: {"{ presets: { ... }, env_presets: { ... } }"}.
          </p>
          <textarea
            className="border w-full h-64 p-3 font-mono text-sm"
            value={presetEditor}
            onChange={(e) => setPresetEditor(e.target.value)}
          />
          <div className="mt-2 space-x-2">
            <button
              className="px-3 py-2 border rounded"
              onClick={async () => {
                setMsg(null);
                setError(null);
                try {
                  const parsed = JSON.parse(presetEditor);
                  const r = await fetch("http://localhost:8000/api/ops/rate-limits/presets/validate", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify(parsed),
                  });
                  const d = await r.json().catch(() => ({}));
                  if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
                  if (d.valid) {
                    setMsg("Valid presets JSON.");
                  } else {
                    setError(`Invalid presets: ${(d.errors || []).join("; ")}`);
                  }
                } catch (e: any) {
                  setError(e.message || "Invalid JSON.");
                }
              }}
            >
              Validate
            </button>
            <button
              className="px-3 py-2 border rounded"
              onClick={() => {
                const scopes = Object.keys(data?.effective || {});
                const skeleton = {
                  presets: {
                    custom: Object.fromEntries(
                      scopes.map((s) => [s, { user_rate: "", ip_rate: "" }])
                    ),
                  },
                  env_presets: {
                    dev: Object.fromEntries(scopes.map((s) => [s, { user_rate: "", ip_rate: "" }])),
                    staging: Object.fromEntries(scopes.map((s) => [s, { user_rate: "", ip_rate: "" }])),
                    prod: Object.fromEntries(scopes.map((s) => [s, { user_rate: "", ip_rate: "" }])),
                  },
                };
                setPresetEditor(JSON.stringify(skeleton, null, 2));
                setMsg("Generated example skeleton.");
              }}
            >
              Generate example
            </button>
            <button
              className="px-3 py-2 rounded bg-indigo-600 text-white"
              onClick={async () => {
                setMsg(null);
                setError(null);
                try {
                  const parsed = JSON.parse(presetEditor);
                  const r = await fetch("http://localhost:8000/api/ops/rate-limits/presets", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                      "Content-Type": "application/json",
                      "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify(parsed),
                  });
                  const d = await r.json().catch(() => ({}));
                  if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
                  setPresetConfig(d);
                  setPresetEditor(JSON.stringify(d, null, 2));
                  setMsg("Saved presets.");
                } catch (e: any) {
                  setError(e.message || "Save presets failed.");
                }
              }}
            >
              Save presets
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-medium mb-2">Update Override</h2>
        <form onSubmit={onSubmit} className="space-y-3 max-w-xl">
          <div>
            <label className="block text-sm mb-1">Scope</label>
            <input
              className="border w-full px-3 py-2"
              placeholder="e.g., flag-submit"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">User rate</label>
              <input
                className="border w-full px-3 py-2"
                placeholder="e.g., 10/min (leave blank to clear)"
                value={userRate}
                onChange={(e) => setUserRate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">IP rate</label>
              <input
                className="border w-full px-3 py-2"
                placeholder="e.g., 30/min (leave blank to clear)"
                value={ipRate}
                onChange={(e) => setIpRate(e.target.value)}
              />
            </div>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit">
            Save
          </button>
          {msg && <div className="text-sm mt-2 text-green-700">{msg}</div>}
        </form>
        <p className="text-xs text-gray-600 mt-2">
          Format: number/period (e.g., 10/min, 100/hour). Leave blank to remove override and use defaults.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Effective Rates</h2>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Scope</th>
              <th className="p-2 text-left">User rate</th>
              <th className="p-2 text-left">IP rate</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={s} className="border-t">
                <td className="p-2">{s}</td>
                <td className="p-2">{data.effective[s]?.user_rate || "-"}</td>
                <td className="p-2">{data.effective[s]?.ip_rate || "-"}</td>
                <td className="p-2">
                  <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => clearCacheScope(s)}>
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
          <div className="text-sm text-gray-600">No overrides configured.</div>
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
              {data.db_overrides.map((r) => (
                <tr key={r.scope} className="border-t">
                  <td className="p-2">{r.scope}</td>
                  <td className="p-2">{r.user_rate || "-"}</td>
                  <td className="p-2">{r.ip_rate || "-"}</td>
                  <td className="p-2">{new Date(r.updated_at).toLocaleString()}</td>
                  <td className="p-2 space-x-2">
                    <button
                      className="px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={() => populateEdit(r.scope, r.user_rate, r.ip_rate)}
                    >
                      Edit
                    </button>
                    <button
                      className="px-2 py-1 border rounded hover:bg-red-50 text-red-700"
                      onClick={() => removeOverride(r.scope)}
                    >
                      Remove
                    </button>
                    <button
                      className="px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={() => clearCacheScope(r.scope)}
                    >
                      Clear cache
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {dryRunRows.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-medium">{dryRunTitle}</h2>
            <div className="space-x-2">
              <button
                className="px-3 py-2 border rounded"
                onClick={() => {
                  setDryRunRows([]);
                  setDryRunOverrides(null);
                  setDryRunTitle("");
                }}
              >
                Clear
              </button>
              <button
                className="px-3 py-2 rounded bg-blue-600 text-white"
                onClick={async () => {
                  if (!dryRunOverrides) return;
                  setMsg(null);
                  setError(null);
                  try {
                    for (const [s, rates] of Object.entries(dryRunOverrides)) {
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
                        throw new Error(d.detail || `Apply from preview failed for scope ${s} (HTTP ${r.status})`);
                      }
                    }
                    const rr = await fetch("http://localhost:8000/api/ops/rate-limits", { credentials: "include" });
                    const dd = await rr.json().catch(() => ({}));
                    if (!rr.ok) throw new Error(dd.detail || `HTTP ${rr.status}`);
                    setData(dd);
                    setMsg("Applied overrides from preview.");
                    setDryRunRows([]);
                    setDryRunOverrides(null);
                    setDryRunTitle("");
                  } catch (e: any) {
                    setError(e.message || "Apply from preview failed.");
                  }
                }}
              >
                Apply these changes
              </button>
            </div>
          </div>
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Scope</th>
                <th className="p-2 text-left">Current user</th>
                <th className="p-2 text-left">New user</th>
                <th className="p-2 text-left">Current IP</th>
                <th className="p-2 text-left">New IP</th>
              </tr>
            </thead>
            <tbody>
              {dryRunRows.map((row) => (
                <tr key={row.scope} className="border-t">
                  <td className="p-2">{row.scope}</td>
                  <td className={`p-2 ${row.changed_user ? "text-gray-700" : "text-gray-500"}`}>
                    {row.current_user_rate ?? "-"}
                  </td>
                  <td
                    className={`p-2 ${
                      row.user_direction === "up"
                        ? "text-green-700 font-medium"
                        : row.user_direction === "down"
                        ? "text-red-700 font-medium"
                        : "text-gray-500"
                    }`}
                    title={row.user_fallback ? "Override blank; falling back to default" : undefined}
                  >
                    {row.new_user_rate ?? "-"}
                  </td>
                  <td className={`p-2 ${row.changed_ip ? "text-gray-700" : "text-gray-500"}`}>
                    {row.current_ip_rate ?? "-"}
                  </td>
                  <td
                    className={`p-2 ${
                      row.ip_direction === "up"
                        ? "text-green-700 font-medium"
                        : row.ip_direction === "down"
                        ? "text-red-700 font-medium"
                        : "text-gray-500"
                    }`}
                    title={row.ip_fallback ? "Override blank; falling back to default" : undefined}
                  >
                    {row.new_ip_rate ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-600 mt-2">
            Preview shows what effective rates would be if the preset were applied. No changes are made.
          </p>
          <div className="text-xs text-gray-600">
            <span className="mr-4">
              <span className="text-green-700 font-medium">Green</span> = increase (more requests allowed)
            </span>
            <span>
              <span className="text-red-700 font-medium">Red</span> = decrease (fewer requests allowed)
            </span>
          </div>
        </section>
      )}

    </div>
  );
