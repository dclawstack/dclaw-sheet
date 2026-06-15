import Link from "next/link";
import { dbEnabled } from "@/lib/env";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  done: "bg-brand/15 text-brand",
  in_progress: "bg-amber-100 text-amber-700",
  pending: "bg-muted text-muted-foreground",
  blocked: "bg-destructive/15 text-destructive",
};

export default async function ProgressPage() {
  if (!dbEnabled()) {
    return (
      <Shell>
        <p className="text-muted-foreground">
          Database not configured. Add <code>DATABASE_URL</code> (see <code>SETUP-KEYS.md</code>),
          then run <code>npm run db:migrate &amp;&amp; npm run db:seed</code>.
        </p>
      </Shell>
    );
  }

  const { getDb } = await import("@/db/client");
  const { roadmapItems, aiRuns, buildEvents, events } = await import("@/db/schema");
  const db = getDb();

  const [roadmap, runs, builds, evts] = await Promise.all([
    db.select().from(roadmapItems).orderBy(roadmapItems.code).catch(() => []),
    db.select().from(aiRuns).orderBy(desc(aiRuns.createdAt)).limit(1000).catch(() => []),
    db.select().from(buildEvents).orderBy(desc(buildEvents.createdAt)).limit(15).catch(() => []),
    db.select().from(events).limit(5000).catch(() => []),
  ]);

  const totalCost = runs.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  const totalTokens = runs.reduce((a, r) => a + r.promptTokens + r.completionTokens, 0);
  const byTier = (["trivial", "standard", "hard"] as const).map((t) => ({
    tier: t,
    count: runs.filter((r) => r.tier === t).length,
  }));
  const hardRuns = runs.filter((r) => r.tier === "hard" && r.consensus && (r.consensus as any).agreement != null);
  const avgAgreement =
    hardRuns.length > 0
      ? hardRuns.reduce((a, r) => a + ((r.consensus as any).agreement ?? 0), 0) / hardRuns.length
      : null;
  const done = roadmap.filter((r) => r.status === "done").length;

  return (
    <Shell>
      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Milestones done" value={`${done}/${roadmap.length || 6}`} />
        <Stat label="AI runs" value={String(runs.length)} />
        <Stat label="AI spend" value={`$${totalCost.toFixed(4)}`} />
        <Stat label="Hard-tier agreement" value={avgAgreement == null ? "—" : `${Math.round(avgAgreement * 100)}%`} />
      </section>

      <h2 className="mb-3 text-lg font-semibold">Roadmap</h2>
      <div className="mb-8 overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="border-b px-3 py-2 text-left">Milestone</th>
              <th className="border-b px-3 py-2 text-left">Gate</th>
              <th className="border-b px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {roadmap.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-muted-foreground">
                  No roadmap rows yet — run <code>npm run db:seed</code>.
                </td>
              </tr>
            )}
            {roadmap.map((r) => (
              <tr key={r.code}>
                <td className="border-b px-3 py-2 font-medium">{r.title}</td>
                <td className="border-b px-3 py-2 text-muted-foreground">{r.gate}</td>
                <td className="border-b px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Token-efficiency ledger</h2>
          <div className="rounded-md border p-4 text-sm">
            <p className="mb-2 text-muted-foreground">{totalTokens.toLocaleString()} tokens across {runs.length} runs</p>
            <ul className="space-y-1">
              {byTier.map((t) => (
                <li key={t.tier} className="flex justify-between">
                  <span className="capitalize">{t.tier}</span>
                  <span className="tabular-nums">{t.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent build events</h2>
          <div className="rounded-md border p-4 text-sm">
            {builds.length === 0 ? (
              <p className="text-muted-foreground">none</p>
            ) : (
              <ul className="space-y-1">
                {builds.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <span>{b.kind}{b.ref ? ` · ${b.ref}` : ""}</span>
                    <span className="text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">{evts.length.toLocaleString()} telemetry events recorded.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Build progress</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
      </div>
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
