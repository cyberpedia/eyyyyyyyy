"use client";

import React, { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("http://localhost:8000/api/challenges?released=1", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.results)) setData(d.results);
        else setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Challenges</h1>
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