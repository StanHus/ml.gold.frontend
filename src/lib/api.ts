export async function callLambda(payload: Record<string, unknown>) {
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api/proxy";
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
