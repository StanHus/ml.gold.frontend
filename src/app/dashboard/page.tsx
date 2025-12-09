"use client";

import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { callLambda } from "@/lib/api";

export default function DashboardPage() {
  const [apiStatus, setApiStatus] = useState<string>("");
  const [quick, setQuick] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const ok = await callLambda({ operation: "quick_price", metal: "XAU" });
        setQuick(ok);
        setApiStatus(ok?.success ? "Online" : "Online (price error)");
      } catch {
        setApiStatus("Offline");
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <Nav />
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="rounded-2xl p-6 border border-white/10 bg-white/5 md:col-span-2">
          <div className="text-lg font-semibold mb-1">Status</div>
          <div className="text-sm text-slate-300">API: {apiStatus || "—"}</div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card title="Metal" value={String(quick?.metal || "XAU")} />
            <Card title="Price" value={quick?.price ? `$${quick.price}` : "—"} />
            <Card title="Time" value={quick?.timestamp ? new Date(String(quick.timestamp)).toLocaleTimeString() : "—"} />
            <Card title="Health" value={quick?.success ? "OK" : "Check"} />
          </div>
        </section>

        <section className="rounded-2xl p-6 border border-white/10 bg-white/5">
          <div className="text-lg font-semibold mb-2">Quick Actions</div>
          <ul className="text-sm space-y-2">
            <li><a className="text-yellow-300 hover:underline" href="/analyze">Run Today’s Analysis →</a></li>
            <li><a className="text-yellow-300 hover:underline" href="/test">Run Backtest →</a></li>
            <li><a className="text-yellow-300 hover:underline" href="/train">Start Training →</a></li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl p-4 bg-black/30 border border-white/10">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}


