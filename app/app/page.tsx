"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import type { Workbook } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkbooksPage() {
  const router = useRouter();
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setWorkbooks(await api.listWorkbooks());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    try {
      await api.createWorkbook(name.trim());
      setName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this workbook?")) return;
    await api.deleteWorkbook(id);
    await load();
  }

  async function loadDemo() {
    setSeeding(true);
    setError(null);
    try {
      const { workbookId } = await api.seedDemo();
      router.push(`/app/${workbookId}`);
    } catch (e: any) {
      setError(e.message);
      setSeeding(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workbooks</h1>
          <p className="text-muted-foreground">Your data canvases.</p>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
      </div>

      <div className="mb-8 flex gap-3">
        <Input
          placeholder="New workbook name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <Button onClick={create} className="bg-brand text-brand-foreground hover:bg-brand/90">
          Create
        </Button>
        <Button variant="outline" onClick={loadDemo} disabled={seeding}>
          {seeding ? "Loading…" : "Load Stripe demo"}
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : workbooks.length === 0 ? (
        <p className="text-muted-foreground">No workbooks yet — create one above.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workbooks.map((wb) => (
            <Card key={wb.id} className="transition hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">
                  <Link href={`/app/${wb.id}`} className="hover:text-brand">
                    {wb.name}
                  </Link>
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => remove(wb.id)}>
                  Delete
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Created {new Date(wb.createdAt).toLocaleDateString()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
