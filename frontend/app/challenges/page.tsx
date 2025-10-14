"use client";

import React, { useEffect, useState } from "react";
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

export default function ChallengesPage() {
  const [data, setData] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const { notify, notifyError } = useToast();

  const loadChallenges = () => {
    setLoading(true);
    notify("info", "Loading challenges...");
    fetch("/api/challenges?released=1", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.results)) setData(d.results);
        else setData(d);
      })
      .catch((e) => {
        notifyError(e?.message || "Failed to load challenges.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChallenges();
  }, []);

  if (loading) return <div>Loading...</div>;

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
    </div>
  );
}