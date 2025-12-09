"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Home" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/analyze", label: "Analyze" },
    { href: "/test", label: "Backtest" },
    { href: "/train", label: "Train" },
    { href: "/reports", label: "Reports" },
    { href: "/settings", label: "Settings" },
  ];
  return (
    <div className="px-6 py-4 border-b border-white/10 bg-[#0e1422]/80 sticky top-0 backdrop-blur z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
            <span className="text-yellow-300 font-bold">Au</span>
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight">Gold AI</div>
            <div className="text-[11px] text-slate-400">Predict • Backtest • Train</div>
          </div>
        </div>
        <nav className="hidden md:flex gap-4 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-2 py-1 rounded transition ${
                pathname === l.href ? "bg-white/10 text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}


