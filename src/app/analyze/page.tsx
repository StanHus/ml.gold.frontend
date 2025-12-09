"use client";

import { useEffect, useState } from "react";
import { callLambda } from "@/lib/api";
import { Details } from "../components/Details";
import { Nav } from "../components/Nav";

interface MLPrediction {
  predicted_price: number;
  price_change_percent: number;
  trend: string;
  confidence: number;
  current_price?: number;
}
interface NewsSentiment { key_factors?: string[] }
interface AnalysisData {
  ml_prediction?: MLPrediction;
  news_sentiment?: NewsSentiment;
  market_summary?: string;
  recommendations?: string[];
}

export default function AnalyzePage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalysisData | null>(null);

  useEffect(() => { run(); }, []);

  async function run() {
    setLoading(true);
    try {
      const res = await callLambda({ operation: "analyze", metal: "XAU", forecast_days: 7 });
      setData(res?.analysis || res);
    } finally { setLoading(false); }
  }

  const analysis = data as AnalysisData | null;
  const ml = analysis?.ml_prediction;
  const sentiment = analysis?.news_sentiment;
  const summary = analysis?.market_summary;
  const recs = analysis?.recommendations;

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <Nav />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Today’s Analysis (XAU)</h1>
          <button onClick={run} disabled={loading} className="text-xs px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60">{loading? "Refreshing...":"Refresh"}</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat title="Predicted" value={ml? `$${ml.predicted_price}`: "—"} />
          <Stat title="Change %" value={ml? `${ml.price_change_percent}%`: "—"} />
          <Stat title="Trend" value={ml?.trend || "—"} />
          <Stat title="Confidence" value={ml? `${Math.round((ml.confidence||0)*100)}%`: "—"} />
        </div>

        {summary && <div className="text-sm text-slate-200 mb-3">{summary}</div>}
        {sentiment && (
          <div className="flex flex-wrap gap-2 mb-3">
            {sentiment.key_factors?.slice(0,5).map((f, i)=> (
              <span key={i} className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10">{f}</span>
            ))}
          </div>
        )}
        {recs && (
          <ul className="list-disc pl-5 text-sm text-slate-200 mb-3">
            {recs.map((r, i)=> <li key={i}>{r}</li>)}
          </ul>
        )}

        <Details data={data as Record<string, unknown> | null} />
      </div>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl p-4 bg-black/30 border border-white/10">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}


