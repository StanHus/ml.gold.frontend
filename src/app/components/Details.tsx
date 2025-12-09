"use client";

import { useMemo, useState } from "react";

type JsonLike = Record<string, unknown> | string | null;

export function Details({ data, title }: { data: JsonLike; title?: string }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    if (!data) return "";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);
  if (!data) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        {title && <div className="text-xs text-slate-300">{title}</div>}
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-slate-300 hover:text-white"
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {open && (
        <pre className="mt-2 text-xs whitespace-pre-wrap text-slate-300 bg-black/30 rounded-lg p-3 border border-white/10 max-h-72 overflow-auto">
          {text}
        </pre>
      )}
    </div>
  );
}


