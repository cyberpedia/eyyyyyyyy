"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";

type ChallengeDetail = {
  id: number;
  title: string;
  slug: string;
  description: string;
  category: string | null;
  points_current: number;
  points_min: number;
  points_max: number;
  tags: string[];
  is_dynamic: boolean;
  released_at: string | null;
};

export default function ChallengeDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [flag, setFlag] = useState("");
  const { notify, notifySuccess, notifyError } = useToast();

  useEffect(() => {
    fetch(`http://localhost:8000/api/challenges/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setChallenge)
      .catch((e) => notifyError(e?.message || "Failed to load challenge."));
  }, [id]);

  const submitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      notify("info", "Submitting flag...");
      const r = await fetch(`http://localhost:8000/api/challenges/${id}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        notifySuccess(`${data.message || "Correct flag"} (+${data.points_awarded} pts)`);
      } else {
        notifyError(data.detail || data.message || "Incorrect flag");
      }
    } catch (err: any) {
      notifyError(err?.message || "Submit failed.");
    } finally {
      setFlag("");
    }
  };

  if (!challenge) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{challenge.title}</h1>
      <div className="prose max-w-none">
        <p>{challenge.description}</p>
      </div>
      <form onSubmit={submitFlag} className="space-y-2">
        <input
          className="border rounded px-3 py-2 w-full"
          placeholder="CTF{...}"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit">Submit Flag</button>
      </form>
    </div>
  );
}