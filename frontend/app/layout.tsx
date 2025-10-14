import "./globals.css";
import React from "react";
import { ToastProvider } from "../components/ToastProvider";
import HighlightThemeToggle from "../components/HighlightThemeToggle";
import UiThemeToggle from "../components/UiThemeToggle";

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
              <nav className="space-x-4 flex items-center">
                <a href="/challenges" className="hover:underline">Challenges</a>
                <a href="/leaderboard" className="hover:underline">Leaderboard</a>
                <a href="/ad/1" className="hover:underline">Attack-Defense</a>
                <a href="/koth/1" className="hover:underline">KotH</a>
                <a href="/ops/rate-limits" className="hover:underline">Ops Rate Limits</a>
                <a href="/ops/writeups" className="hover:underline">Ops Write-ups</a>
                <a href="/ops/settings" className="hover:underline">Ops Settings</a>
              </nav>
              <div className="ml-6 flex items-center gap-4">
                <UiThemeToggle />
                <HighlightThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}