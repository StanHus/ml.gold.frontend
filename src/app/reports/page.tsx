import { Nav } from "../components/Nav";

export default function ReportsPage() {
  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <Nav />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-3">Reports</h1>
        <p className="text-sm text-slate-300">Coming soon: latest training jobs, artifacts, and performance charts from S3.</p>
      </div>
    </main>
  );
}


