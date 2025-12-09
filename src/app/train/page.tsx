"use client";

import { useMemo, useState } from "react";
import { callLambda } from "@/lib/api";
import { Details } from "../components/Details";
import { Nav } from "../components/Nav";

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export default function TrainPage() {
  const [file, setFile] = useState<File | null>(null);
  const [numRuns, setNumRuns] = useState<number>(500);
  const [params, setParams] = useState<string>('{"generations":50}');
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<Record<string, unknown> | null>(null);

  const estSeconds = useMemo(() => {
    const runs = Number(numRuns) || 0;
    try {
      const p = params ? JSON.parse(params) : {};
      const gen = Number(p?.generations || 50);
      const factor = Math.min(3, Math.max(0.5, gen / 50));
      return runs * 2.5 * factor;
    } catch {
      return runs * 2.5;
    }
  }, [numRuns, params]);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setResp(null);
    if (!file) return;
    setLoading(true);
    try {
      const getUrl = await callLambda({ operation: "get_upload_url", filename: file.name, content_type: file.type || "application/octet-stream" });
      if (!getUrl?.success) { setResp(getUrl); return; }
      await fetch(getUrl.presigned_url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      const res = await callLambda({ operation: "train", model_name: "gold-predictor-XAU", input_s3_uris: [getUrl.s3_uri], num_runs: Number(numRuns)||500, params: (params? JSON.parse(params): {}), backend: "openevolve" });
      setResp(res);
    } catch (err) {
      const error = err as Error;
      setResp({ error: error?.message || String(err) });
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-4">Train</h1>
        <form onSubmit={run} className="space-y-4 rounded-2xl p-6 border border-white/10 bg-white/5">
          <div>
            <label className="block text-xs mb-1">File (Excel/CSV/JSON)</label>
            <input type="file" accept=".xlsx,.xls,.csv,.json" className="w-full text-sm" onChange={e=>setFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs mb-1">Runs</label>
              <span className="text-[11px] text-slate-400">Est. {formatDuration(estSeconds)}</span>
            </div>
            <input type="number" min={1} step={1} className="w-full rounded-md bg-white/5 border border-white/10 p-2" value={numRuns} onChange={e=>setNumRuns(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs mb-1">Params (JSON)</label>
            <input className="w-full rounded-md bg-white/5 border border-white/10 p-2 font-mono" value={params} onChange={e=>setParams(e.target.value)} />
          </div>
          <button type="submit" disabled={loading || !file} className="w-full px-3 py-2 rounded-md bg-yellow-400 text-black font-semibold disabled:opacity-60">{loading? "Training...":"Start"}</button>
        </form>
        <Details data={resp} />
      </div>
    </main>
  );
}


