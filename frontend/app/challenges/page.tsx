"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/ToastProvider";

type Challenge = {
  id: number;
  title: string;
  slug: string;
  category: string | null;
  category_slug: string | null;
  points_current: number;
  points_min: number;
  points_max: number;
  tags: string[];
  is_dynamic: boolean;
  released_at: string | null;
};

type UiConfig = {
  challenge_list_layout: "list" | "grid" | "tabs" | "cards" | "masonry" | "grouped_tags" | "collapsible";
  layout_by_category?: Record<string, string>;
};

export default function ChallengesPage() {
  const [data, setData] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [ui, setUi] = useState<UiConfig>({ challenge_list_layout: "list" });
  const [activeTab, setActiveTab] = useState<string>("All");
  const { notify, notifyError } = useToast();

  const loadChallenges = () => {
    setLoading(true);
    notify("info", "Loading challenges...");
    Promise.all([
      fetch("/api/challenges?released=1", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/ui/config", { credentials: "include" }).then((r) => r.json()).catch(() => ({ challenge_list_layout: "list" })),
    ])
      .then(([chals, uiCfg]) => {
        const list = Array.isArray(chals.results) ? chals.results : chals;
        setData(list);
        setUi(uiCfg);
      })
      .catch((e) => {
        notifyError(e?.message || "Failed to load challenges.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChallenges();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    data.forEach((c) => set.add(c.category || "Uncategorized"));
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    if (activeTab === "All") return data;
    return data.filter((c) => (c.category || "Uncategorized") === activeTab);
  }, [activeTab, data]);

  const tagsGroups = useMemo(() => {
    const map = new Map<string, Challenge[]>();
    data.forEach((c) => {
      if (c.tags.length === 0) {
        const arr = map.get("Untagged") || [];
        arr.push(c);
        map.set("Untagged", arr);
      } else {
        c.tags.forEach((t) => {
          const arr = map.get(t) || [];
          arr.push(c);
          map.set(t, arr);
        });
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; items: Challenge[] }>();
    data.forEach((c) => {
      const slug = c.category_slug || "uncategorized";
      const name = c.category || "Uncategorized";
      const entry = map.get(slug) || { name, items: [] };
      entry.items.push(c);
      map.set(slug, entry);
    });
    return map;
  }, [data]);

  if (loading) return <div>Loading...</div>;

  const layout = ui.challenge_list_layout || "list";
  const hasOverrides = !!(ui.layout_by_category && Object.keys(ui.layout_by_category).length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Challenges</h1>
        <button
          className="px-3 py-2 border rounded hover:bg-gray-50"
          onClick={loadChallenges}
          disabled={loading}
          title="Reload challenges list"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {layout === "tabs" && (
        <div className="flex gap-2 border-b">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`px-3 py-2 text-sm ${activeTab === cat ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-600 hover:text-gray-800"}`}
              onClick={() => setActiveTab(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {(layout === "grid" || layout === "cards" || layout === "masonry") && !hasOverrides && (
        <div className={layout === "masonry" ? "columns-1 sm:columns-2 lg:columns-3 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}>
          {data.map((c) => (
            <a
              key={c.id}
              href={`/challenges/${c.id}`}
              className={`${layout === "masonry" ? "inline-block w-full break-inside-avoid" : ""} border rounded p-4 hover:shadow transition-shadow`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-medium">{c.title}</div>
                  <div className="text-xs text-gray-600">{c.category || "Uncategorized"}</div>
                </div>
                <div className="text-sm">{c.points_current} pts</div>
              </div>
              {c.tags.length > 0 && (
                <div className="mt-2 text-xs text-gray-600 truncate">Tags: {c.tags.join(", ")}</div>
              )}
            </a>
          ))}
        </div>
      )}

      {layout === "grouped_tags" && (
        <div className="space-y-6">
          {tagsGroups.map(([tag, items]) => (
            <section key={tag}>
              <h2 className="text-lg font-medium mb-2">{tag} ({items.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((c) => (
                  <a key={c.id} href={`/challenges/${c.id}`} className="border rounded p-4 hover:shadow transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-lg font-medium">{c.title}</div>
                        <div className="text-xs text-gray-600">{c.category || "Uncategorized"}</div>
                      </div>
                      <div className="text-sm">{c.points_current} pts</div>
                    </div>
                    {c.tags.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600 truncate">Tags: {c.tags.join(", ")}</div>
                    )}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Per-category overrides rendering (non-tabs): render sections by category if overrides exist */}
      {layout !== "tabs" && ui.layout_by_category && Object.keys(ui.layout_by_category).length > 0 && (
        <div className="space-y-6">
          {Array.from(byCategory.entries()).map(([slug, entry]) => {
            const ov = ui.layout_by_category?.[slug] || null;
            if (!ov) return null;
            const items = entry.items;
            if (ov === "list") {
              return (
                <section key={slug}>
                  <h2 className="text-lg font-medium mb-2">{entry.name} ({items.length})</h2>
                  <ul className="space-y-2">
                    {items.map((c) => (
                      <li key={c.id} className="border rounded p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <a className="text-lg font-medium hover:underline" href={`/challenges/${c.id}`}>{c.title}</a>
                            <div className="text-sm text-gray-600">{c.category || "Uncategorized"}</div>
                          </div>
                          <div className="text-sm">{c.points_current} pts</div>
                        </div>
                        {c.tags.length > 0 && (
                          <div className="mt-2 text-xs text-gray-600">Tags: {c.tags.join(", ")}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            }
            const containerClass = ov === "masonry" ? "columns-1 sm:columns-2 lg:columns-3 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";
            return (
              <section key={slug}>
                <h2 className="text-lg font-medium mb-2">{entry.name} ({items.length})</h2>
                <div className={containerClass}>
                  {items.map((c) => (
                    <a key={c.id} href={`/challenges/${c.id}`} className={`${ov === "masonry" ? "inline-block w-full break-inside-avoid" : ""} border rounded p-4 hover:shadow transition-shadow`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-lg font-medium">{c.title}</div>
                          <div className="text-xs text-gray-600">{c.category || "Uncategorized"}</div>
                        </div>
                        <div className="text-sm">{c.points_current} pts</div>
                      </div>
                      {c.tags.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600 truncate">Tags: {c.tags.join(", ")}</div>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {(layout === "list" || layout === "collapsible") && !hasOverrides && (
        <div className="space-y-4">
          {layout === "collapsible"
            ? categories.filter((c) => c !== "All").map((cat) => {
                const items = data.filter((x) => (x.category || "Uncategorized") === cat);
                return (
                  <details key={cat} className="border rounded">
                    <summary className="cursor-pointer px-4 py-2 font-medium">{cat} ({items.length})</summary>
                    <ul className="space-y-2 p-4">
                      {items.map((c) => (
                        <li key={c.id} className="border rounded p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <a className="text-lg font-medium hover:underline" href={`/challenges/${c.id}`}>{c.title}</a>
                              <div className="text-sm text-gray-600">{c.category || "Uncategorized"}</div>
                            </div>
                            <div className="text-sm">{c.points_current} pts</div>
                          </div>
                          {c.tags.length > 0 && (
                            <div className="mt-2 text-xs text-gray-600">Tags: {c.tags.join(", ")}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })
            : (
              <ul className="space-y-2">
                {data.map((c) => (
                  <li key={c.id} className="border rounded p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <a className="text-lg font-medium hover:underline" href={`/challenges/${c.id}`}>{c.title}</a>
                        <div className="text-sm text-gray-600">{c.category || "Uncategorized"}</div>
                      </div>
                      <div className="text-sm">{c.points_current} pts</div>
                    </div>
                    {c.tags.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">Tags: {c.tags.join(", ")}</div>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </div>
      )}

      {layout === "tabs" && (
        <div>
          {/* Determine inner layout override for selected tab */}
          {(() => {
            const catSlug = filtered[0]?.category_slug || null;
            const ov = (catSlug && ui.layout_by_category?.[catSlug]) || null;
            const innerLayout = ov || "grid";
            if (innerLayout === "list") {
              return (
                <ul className="space-y-2 mt-3">
                  {filtered.map((c) => (
                    <li key={c.id} className="border rounded p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <a className="text-lg font-medium hover:underline" href={`/challenges/${c.id}`}>{c.title}</a>
                          <div className="text-sm text-gray-600">{c.category || "Uncategorized"}</div>
                        </div>
                        <div className="text-sm">{c.points_current} pts</div>
                      </div>
                      {c.tags.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">Tags: {c.tags.join(", ")}</div>
                      )}
                    </li>
                  ))}
                </ul>
              );
            }
            const containerClass = innerLayout === "masonry" ? "columns-1 sm:columns-2 lg:columns-3 gap-3 mt-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3";
            return (
              <div className={containerClass}>
                {filtered.map((c) => (
                  <a key={c.id} href={`/challenges/${c.id}`} className={`${innerLayout === "masonry" ? "inline-block w-full break-inside-avoid" : ""} border rounded p-4 hover:shadow transition-shadow`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-lg font-medium">{c.title}</div>
                        <div className="text-xs text-gray-600">{c.category || "Uncategorized"}</div>
                      </div>
                      <div className="text-sm">{c.points_current} pts</div>
                    </div>
                    {c.tags.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600 truncate">Tags: {c.tags.join(", ")}</div>
                    )}
                  </a>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}