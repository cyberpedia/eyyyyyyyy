import "./globals.css";
import "highlight.js/styles/github.css";
import React from "react";
import { ToastProvider } from "../components/ToastProvider";

export const metadata = {
  title: "CTF Platform",
  description: "CTF Platform Frontend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ToastProvider>
          <header className="border-b">
            <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
              <a className="font-semibold text-lg" href="/">CTF</a>
              <nav className="space-x-4">
                <a href="/challenges" className="hover:underline">Challenges</a>
                <a href="/leaderboard" className="hover:underline">Leaderboard</a>
                <a href="/ops/rate-limits" className="hover:underline">Ops Rate Limits</a>
                <a href="/ops/writeups" className="hover:underline">Ops Write-ups</a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}