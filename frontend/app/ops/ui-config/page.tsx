"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../../components/ToastProvider";

type UiConfig = {
  challenge_list_layout: "list" | "grid" | "tabs" | "cards" | "masonry" | "grouped_tags" | "collapsible";
  layout_by_category?: Record<string, string>;
  layout_by_tag?: Record<string, string>;
  layout_by_event?: Record<string, string>;
};

type Category = { id: number; name: string; slug: string };
type Tag = { id: number; name: string };
type EventRow = { id: number; name: string; slug: string };

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
  const [tags, setTags] = useState<Tag[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
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
      const [uiRes, catRes, tagRes, evRes] = await Promise.all([
        fetch("/api/ui/config", { credentials: "include" }),
        fetch("/api/categories", { credentials: "include" }),
        fetch("/api/tags", { credentials: "include" }),
        fetch("/api/events", { credentials: "include" }),
      ]);
      const uiData = await uiRes.json().catch(() => ({}));
      const catData = await catRes.json().catch(() => ({}));
      const tagData = await tagRes.json().catch(() => ({}));
      const evData = await evRes.json().catch(() => ({}));
      if (!uiRes.ok) throw new Error(uiData.detail || `Failed to load UI config (HTTP ${uiRes.status})`);
      if (!catRes.ok) throw new Error(catData.detail || `Failed to load categories (HTTP ${catRes.status})`);
      if (!tagRes.ok) throw new Error(tagData.detail || `Failed to load tags (HTTP ${tagRes.status})`);
      if (!evRes.ok) throw new Error(evData.detail || `Failed to load events (HTTP ${evRes.status})`);
      setUi(uiData);
      setCategories(catData.results || []);
      setTags(tagData.results || []);
      setEvents(evData.results || []);
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

  const setTagLayout = (name: string, value: string) => {
    if (!ui) return;
    const map = { ...(ui.layout_by_tag || {}) };
    if (!value) {
      delete map[name];
    } else {
      map[name] = value;
    }
    setUi({ ...ui, layout_by_tag: map });
  };

  const setEventLayout = (slug: string, value: string) => {
    if (!ui) return;
    const map = { ...(ui.layout_by_event || {}) };
    if (!value) {
      delete map[slug];
    } else {
      map[slug] = value;
    }
    setUi({ ...ui, layout_by_event: map });
  };

  const onSave = async () => {
    if (!ui) return;
    try {
      setSaving(true);
      const r = await fetch("/api/ui/config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          challenge_list_layout: ui.challenge_list_layout,
          layout_by_category: ui.layout_by_category || {},
          layout_by_tag: ui.layout_by_tag || {},
          layout_by_event: ui.layout_by_event || {},
        }),
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

      <section>
        <h2 className="text-lg font-medium mb-2">Per-Tag Overrides (used by Grouped by Tags layout)</h2>
        <div className="text-xs text-gray-600 mb-2">
          Optional: choose a specific layout for a tag group when using the Grouped by Tags layout. Leave blank to inherit the default (grid).
        </div>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Tag</th>
              <th className="p-2 text-left">Override Layout</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => {
              const ov = ui.layout_by_tag?.[tag.name] || "";
              return (
                <tr key={tag.id} className="border-t">
                  <td className="p-2">{tag.name}</td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={ov}
                      onChange={(e) => setTagLayout(tag.name, e.target.value)}
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

      <section>
        <h2 className="text-lg font-medium mb-2">Per-Event Overrides</h2>
        <div className="text-xs text-gray-600 mb-2">
          Optional: choose a specific layout for each event. On the Challenges page, selecting an event will apply its override.
        </div>
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left">Event</th>
              <th className="p-2 text-left">Slug</th>
              <th className="p-2 text-left">Override Layout</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const ov = ui.layout_by_event?.[ev.slug] || "";
              return (
                <tr key={ev.slug} className="border-t">
                  <td className="p-2">{ev.name}</td>
                  <td className="p-2 text-xs">{ev.slug}</td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={ov}
                      onChange={(e) => setEventLayout(ev.slug, e.target.value)}
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