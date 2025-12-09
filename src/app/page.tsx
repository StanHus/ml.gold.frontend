import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="px-6 py-6 border-b border-white/10 bg-[#0e1422]/80 sticky top-0 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
              <span className="text-yellow-300 font-bold">Au</span>
            </div>
            <div>
              <div className="text-xl font-semibold tracking-tight">Gold AI</div>
              <div className="text-[12px] text-slate-400">Multi‑page dashboard</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { href: "/dashboard", title: "Dashboard", desc: "Overview of analysis, quick status" },
          { href: "/analyze", title: "Analyze", desc: "Today’s gold outlook, news & drivers" },
          { href: "/test", title: "Backtest", desc: "Run historical tests and compare actuals" },
          { href: "/train", title: "Train", desc: "Upload data and launch OpenEvolve runs" },
          { href: "/reports", title: "Reports", desc: "Latest training results & artifacts" },
          { href: "/settings", title: "Settings", desc: "API base, preferences" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-2xl p-6 border border-white/10 bg-white/5 hover:bg-white/10 transition"
          >
            <div className="text-lg font-semibold mb-1">{c.title}</div>
            <div className="text-sm text-slate-300">{c.desc}</div>
            <div className="mt-4 text-xs text-yellow-300 group-hover:translate-x-1 transition">Open →</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
