"use client";

import React, { useState } from "react";
import { useToast } from "../../components/ToastProvider";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { notify, notifySuccess, notifyError } = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      notify("info", "Registering...");
      const r = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) notifySuccess("Registered and logged in.");
      else notifyError(d.detail || "Registration failed.");
    } catch (err: any) {
      notifyError(err?.message || "Registration failed.");
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-4">Register</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="border w-full px-3 py-2" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="border w-full px-3 py-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="border w-full px-3 py-2" placeholder="Password (min 12 chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit">Register</button>
      </form>
    </div>
  );
}