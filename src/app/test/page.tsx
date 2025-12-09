"use client";

import { useState } from "react";
import { callLambda } from "@/lib/api";
import { Details } from "../components/Details";
import { Nav } from "../components/Nav";

export default function TestPage() {
  const [testMode, setTestMode] = useState<"lookback" | "asof">("lookback");
  const [metal, setMetal] = useState("XAU");
  const [lookbackDays, setLookbackDays] = useState<number>(30);
  const [asOfDate, setAsOfDate] = useState("");
  const [horizonDays, setHorizonDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string>("");

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setError(""); setData(null);
    const payload: Record<string, unknown> = { operation: "test", metal, horizon_days: Number(horizonDays)||7 };
    if (testMode === "asof") {
      if (!asOfDate) { setError("Choose an As-Of Date"); return; }
      payload.as_of_date = asOfDate;
    } else {
      payload.lookback_days = Number(lookbackDays)||30;
    }
    setLoading(true);
    try {
      const res = await callLambda(payload);
      setData(res);
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-4">Backtest</h1>
        {error && <div className="text-sm text-red-300 mb-2">{error}</div>}
        <form onSubmit={run} className="space-y-4 rounded-2xl p-6 border border-white/10 bg-white/5">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1">Metal</label>
              <select className="w-full rounded-md bg-white/5 border border-white/10 p-2" value={metal} onChange={e=>setMetal(e.target.value)}>
                <option>XAU</option>
                <option>XAG</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs mb-1">Mode</label>
              <div className="flex items-center gap-2 text-xs">
                <label className={`px-2 py-1 rounded border ${testMode==='lookback'? 'bg-white/10 border-white/20':'border-white/10'}`}>
                  <input type="radio" name="mode" className="hidden" checked={testMode==='lookback'} onChange={()=>setTestMode('lookback')} />Lookback
                </label>
                <label className={`px-2 py-1 rounded border ${testMode==='asof'? 'bg-white/10 border-white/20':'border-white/10'}`}>
                  <input type="radio" name="mode" className="hidden" checked={testMode==='asof'} onChange={()=>setTestMode('asof')} />As‑of date
                </label>
              </div>
            </div>
          </div>

          {testMode === 'lookback' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1">Lookback days</label>
                <input type="number" min={1} className="w-full rounded-md bg-white/5 border border-white/10 p-2" value={lookbackDays} onChange={e=>setLookbackDays(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs mb-1">Horizon days</label>
                <input type="number" min={1} className="w-full rounded-md bg-white/5 border border-white/10 p-2" value={horizonDays} onChange={e=>setHorizonDays(Number(e.target.value))} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1">As‑of date</label>
                <input type="date" className="w-full rounded-md bg-white/5 border border-white/10 p-2" value={asOfDate} onChange={e=>setAsOfDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs mb-1">Horizon days</label>
                <input type="number" min={1} className="w-full rounded-md bg-white/5 border border-white/10 p-2" value={horizonDays} onChange={e=>setHorizonDays(Number(e.target.value))} />
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full px-3 py-2 rounded-md bg-yellow-400 text-black font-semibold disabled:opacity-60">{loading? "Running...":"Run"}</button>
        </form>

        <Details data={data} />
      </div>
    </main>
  );
}


