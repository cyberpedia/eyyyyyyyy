"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/ToastProvider";

type Challenge = {
  id: number;
  title: string;
  slug: string;
  category: string | null;
  points_current: number;
  points_min: number;
  points_max: number;
  tags: string[];
  is_dynamic: boolean;
  released_at: string | null;
};

type UiConfig = {
  challenge_list_layout: "list" | "grid" | "tabs" | "cards";
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

  if (loading) return <div>Loading...</div>;

  const layout = ui.challenge_list_layout || "list";

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

      {(layout === "grid" || layout === "cards") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(layout === "tabs" ? filtered : data).map((c) => (
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
      )}

      {layout === "list" && (
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
      )}

      {layout === "tabs" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {filtered.map((c) => (
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
        </div>
      )}
    </div>
  );
}