"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "../../../components/ToastProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

// Build a safe sanitize schema that allows highlight.js class names on code blocks.
const baseAttrs = (defaultSchema as Schema)?.attributes || {};
const sanitizeSchema: Schema = {
  ...((defaultSchema as Schema) || {}),
  attributes: {
    ...baseAttrs,
    code: [...(baseAttrs.code || []), ["className"]],
    span: [...(baseAttrs.span || []), ["className"]],
    pre: [...(baseAttrs.pre || []), ["className"]],
  },
};

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

type WriteUp = {
  id: number;
  title: string;
  content_md: string;
  username: string;
  team?: number | null;
  published_at?: string | null;
};

export default function ChallengeDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [flag, setFlag] = useState("");
  const { notify, notifySuccess, notifyError } = useToast();

  const [writeups, setWriteups] = useState<WriteUp[]>([]);
  const [wuTitle, setWuTitle] = useState("");
  const [wuContent, setWuContent] = useState("");

  const getCsrfToken = () => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  };

  useEffect(() => {
    fetch(`/api/challenges/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setChallenge)
      .catch((e) => notifyError(e?.message || "Failed to load challenge."));

    fetch(`/api/content/challenges/${id}/writeups?status=approved`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setWriteups(d.results || []))
      .catch(() => {});
  }, [id]);

  const submitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      notify("info", "Submitting flag...");
      const r = await fetch(`/api/challenges/${id}/submit`, {
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

  const submitWriteUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      notify("info", "Submitting write-up...");
      const r = await fetch(`/api/content/challenges/${id}/writeups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ title: wuTitle, content_md: wuContent }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        notifySuccess("Write-up submitted for moderation.");
        setWuTitle("");
        setWuContent("");
      } else {
        notifyError(data.detail || "Write-up submit failed.");
      }
    } catch (e: any) {
      notifyError(e?.message || "Write-up submit failed.");
    }
  };

  if (!challenge) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{challenge.title}</h1>
      <div className="prose max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
        >
          {challenge.description || ""}
        </ReactMarkdown>
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

      <section>
        <h2 className="text-lg font-medium mb-2">Write-ups</h2>
        {writeups.length === 0 ? (
          <div className="text-sm text-gray-600">No approved write-ups yet.</div>
        ) : (
          <ul className="space-y-2">
            {writeups.map((w) => (
              <li key={w.id} className="border rounded p-3">
                <div className="font-semibold">{w.title}</div>
                <div className="text-xs text-gray-600">
                  by {w.username} {w.published_at ? `on ${w.published_at}` : ""}
                </div>
                <div className="prose max-w-none mt-2 whitespace-pre-wrap">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
                  >
                    {w.content_md || ""}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-md font-medium mb-2">Submit your write-up</h3>
        <form onSubmit={submitWriteUp} className="space-y-2">
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Title"
            value={wuTitle}
            onChange={(e) => setWuTitle(e.target.value)}
          />
          <textarea
            className="border rounded px-3 py-2 w-full h-32"
            placeholder="Markdown write-up..."
            value={wuContent}
            onChange={(e) => setWuContent(e.target.value)}
          />
          <button className="bg-gray-800 text-white px-4 py-2 rounded" type="submit">Submit Write-up</button>
        </form>
      </section>
    </div>
  );
}