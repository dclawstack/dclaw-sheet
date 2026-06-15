import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="space-y-6">
        <span className="inline-block rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
          AI-native spreadsheet · live data
        </span>
        <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl">
          Ask your data a question.
          <br />
          Get a spreadsheet back.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Connect Stripe or Postgres, ask <em>&ldquo;what&rsquo;s our net revenue retention by
          cohort?&rdquo;</em> in plain English, and DClaw Sheet writes the SQL, runs it on live
          data, and hands you a chart — in seconds. No exports, no formulas, no BI tool.
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/app">
          <Button size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90">
            Open the app
          </Button>
        </Link>
        <Link href="/admin/progress">
          <Button size="lg" variant="outline">
            Build progress
          </Button>
        </Link>
      </div>
    </main>
  );
}
