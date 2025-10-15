"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../../components/ToastProvider";

type UiConfig = {
  challenge_list_layout: "list" | "grid" | "tabs" | "cards" | "masonry" | "grouped_tags" | "collapsible";
  layout_by_category?: Record<string, string>;
};

type Category = { id: number; name: string; slug: string };

const LAYOUT_OPTIONS = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
  { value: "tabs", label: "Tabs (by category)" },
  { value: "cards", label: "Cards" },
  { value: "masonry", label: "Masonry" },
  { value: "grouped_tags", label: "Grouped by Tags" },
  { value: "collapsible", label: "Collapsible Categories" },
];

export default function OpsUiConfigPage() {
  const { notify, notifySuccess, notifyError } = useToast();
  const router = useRouter();

  const [ui, setUi] = useState<UiConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Client-side staff-only guard
  useEffect(() => {
    fetch("/api/users/me", { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (!d?.isStaff) router.push("/login");
      })
      .catch(() => {});
  }, [router]);

  const getCsrfToken = () => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  };

  const reload = async () => {
    try {
      setLoading(true);
      notify("info", "Loading UI config...");
      const [uiRes, catRes] = await Promise.all([
        fetch("/api/ui/config", { credentials: "include" }),
        fetch("/api/categories", { credentials: "include" }),
      ]);
      const uiData = await uiRes.json().catch(() => ({}));
      const catData = await catRes.json().catch(() => ({}));
      if (!uiRes.ok) throw new Error(uiData.detail || `Failed to load UI config (HTTP ${uiRes.status})`);
      if (!catRes.ok) throw new Error(catData.detail || `Failed to load categories (HTTP ${catRes.status})`);
      setUi(uiData);
      setCategories(catData.results || []);
      notifySuccess("Loaded UI config.");
    } catch (e: any) {
      notifyError(e?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const setGlobalLayout = (value: string) => {
    if (!ui) return;
    setUi({ ...ui, challenge_list_layout: value as UiConfig["challenge_list_layout"] });
  };

  const setCategoryLayout = (slug: string, value: string) => {
    if (!ui) return;
    const map = { ...(ui.layout_by_category || {}) };
    if (!value) {
      delete map[slug];
    } else {
      map[slug] = value;
    }
    setUi({ ...ui, layout_by_category: map });
  };

  const onSave = async () => {
    if (!ui) return;
    try {
      setSaving(true);
      const r = await fetch("/api/ui/config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ challenge_list_layout: ui.challenge_list_layout, layout_by_category: ui.layout_by_category || {} }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      notifySuccess("Saved UI config.");
      await reload();
    } catch (e: any) {
      notifyError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !ui) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ops: UI Config</h1>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 border rounded hover:bg-gray-50" onClick={reload} disabled={loading}>
            Refresh
          </button>
          <button className={`px-3 py-2 rounded ${saving ? "bg-blue-300" : "bg-blue-600"} text-white`} disabled={saving} onClick={onSave}>
            Save
          </button>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-2">Global Challenge List Layout</h2>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-3 py-2"
            value={ui.challenge_list_layout}
            onChange={(e) => setGlobalLayout(e.target.value)}
            title="Global layout for /challenges page"
          >
            {LAYOUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-600">Controls the base layout. Tabs layout shows categories across the top.</div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Per-Category Overrides</h2>
        <div className="text-xs text-gray-600 mb-2">
          Optional: choose a specific layout for a category. Leave blank to inherit the global layout.
        </div>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-left">Slug</th>
              <th className="p-2 text-left">Override Layout</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const ov = ui.layout_by_category?.[cat.slug] || "";
              return (
                <tr key={cat.slug} className="border-t">
                  <td className="p-2">{cat.name}</td>
                  <td className="p-2 text-xs">{cat.slug}</td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={ov}
                      onChange={(e) => setCategoryLayout(cat.slug, e.target.value)}
                    >
                      <option value="">(inherit)</option>
                      {LAYOUT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}