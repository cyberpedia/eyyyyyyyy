import "./globals.css";
import React from "react";

export const metadata = {
  title: "CTF Platform",
  description: "CTF Platform Frontend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
            <a className="font-semibold text-lg" href="/">CTF</a>
            <nav className="space-x-4">
              <a href="/challenges" className="hover:underline">Challenges</a>
              <a href="/leaderboard" className="hover:underline">Leaderboard</a>
              <a href="/ops/rate-limits" className="hover:underline">Ops</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}