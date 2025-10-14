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

  if (error) {
    return <div className="text-red-700">Error: {error}. Ensure you are logged in and have staff privileges.</div>;
  }
  if (!data) return <div>Loading...</div>;

  const scopes = Object.keys(data.effective);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rate Limits (Ops)</h1>
        <button onClick={clearCache} className="bg-gray-200 px-3 py-2 rounded hover:bg-gray-300">
          Clear all cache
        </button>
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
          <button
            className="bg-green-600 text-white px-3 py-2 rounded"
            onClick={() => applyPreset("practice")}
          >
            Practice mode
          </button>
          <button
            className="bg-purple-600 text-white px-3 py-2 rounded"
            onClick={() => applyPreset("heavy")}
          >
            Heavy load mode
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
          <button
            className="bg-gray-600 text-white px-3 py-2 rounded"
            onClick={() => applyEnvPreset("staging")}
          >
            Staging
          </button>
          <button
            className="bg-gray-400 text-black px-3 py-2 rounded"
            onClick={() => applyEnvPreset("prod")}
          >
            Prod
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
    </div>
  );
