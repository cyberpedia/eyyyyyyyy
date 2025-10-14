"use client";

import React from "react";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome to the CTF Platform</h1>
      <p className="text-gray-700">
        This is a minimal frontend scaffold. The backend is exposed at <code className="bg-gray-100 px-1">http://localhost:8000/api</code>.
      </p>
      <ul className="list-disc pl-6">
        <li><a className="text-blue-600 hover:underline" href="/challenges">Browse challenges</a></li>
        <li><a className="text-blue-600 hover:underline" href="/leaderboard">View leaderboard</a></li>
      </ul>
    </div>
  );
}