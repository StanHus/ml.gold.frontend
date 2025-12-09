"use client";

import { useMemo } from "react";
import { Nav } from "../components/Nav";

export default function SettingsPage() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE || "/api/proxy", []);
  const awsEndpoint = useMemo(() => process.env.AWS_API_ENDPOINT || "", []);
  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-4">Settings</h1>
        <section className="rounded-2xl p-6 border border-white/10 bg-white/5">
          <div className="text-sm">API Base</div>
          <div className="font-mono text-xs text-slate-300 break-all">{apiBase}</div>
          <div className="mt-4 text-sm">AWS API Endpoint</div>
          <div className="font-mono text-xs text-slate-300 break-all">{awsEndpoint || "(not set)"}</div>
        </section>
      </div>
    </main>
  );
}


