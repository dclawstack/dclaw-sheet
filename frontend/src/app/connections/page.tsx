"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, Trash2, Plus, Globe } from "lucide-react";

import {
  type Connection,
  type ConnectionType,
  createConnection,
  deleteConnection,
  listConnections,
} from "@/lib/api";

const TYPE_LABEL: Record<ConnectionType, string> = {
  postgres: "Postgres",
  csv_url: "CSV URL",
};

export default function ConnectionsPage() {
  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectionType>("csv_url");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("SELECT * FROM table_name LIMIT 1000");
  const [hasHeader, setHasHeader] = useState(true);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listConnections());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const config: Record<string, unknown> =
        type === "csv_url"
          ? { url, has_header: hasHeader }
          : { url, query };
      await createConnection({ name: name.trim(), type, config });
      setName("");
      setUrl("");
      setQuery("SELECT * FROM table_name LIMIT 1000");
      setShowModal(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create connection");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this connection? Linked sheets keep their data.")) return;
    try {
      await deleteConnection(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete connection");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-[#10B981] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-white/80 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Database className="h-5 w-5 text-white" />
          <h1 className="text-xl font-semibold text-white">Live connections</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-2 text-sm text-white font-medium flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New connection
        </button>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-white p-12 shadow-sm border border-gray-200 text-center text-gray-500">
            <p className="mb-4">No connections yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-md bg-[#10B981] px-6 py-2 text-white font-medium hover:bg-[#0E9F6E]"
            >
              Create your first connection
            </button>
          </div>
        ) : (
          <div className="rounded-lg bg-white border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Last sync</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Rows</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 flex items-center gap-1">
                      {c.type === "postgres" ? (
                        <Database className="h-3.5 w-3.5" />
                      ) : (
                        <Globe className="h-3.5 w-3.5" />
                      )}
                      {TYPE_LABEL[c.type]}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.last_synced_at
                        ? new Date(c.last_synced_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.last_row_count ?? "—"}</td>
                    <td className="px-2">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-gray-400 hover:text-red-600 p-2"
                        title="Delete connection"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg mx-4"
          >
            <h3 className="text-lg font-semibold mb-4">New connection</h3>

            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              className="w-full rounded-md border border-gray-300 p-2 mb-3 text-sm focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prod-stripe-mrr"
              required
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="flex gap-2 mb-3">
              {(["csv_url", "postgres"] as ConnectionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-md px-3 py-1.5 text-sm border ${
                    type === t
                      ? "bg-[#10B981] text-white border-[#10B981]"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              {type === "postgres" ? "Database URL" : "CSV URL"}
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 p-2 mb-3 text-sm font-mono focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                type === "postgres"
                  ? "postgresql+asyncpg://user:pass@host:5432/db"
                  : "https://example.com/data.csv"
              }
              required
            />

            {type === "postgres" && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Query</label>
                <textarea
                  className="w-full rounded-md border border-gray-300 p-2 mb-3 text-sm font-mono focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none resize-none"
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </>
            )}

            {type === "csv_url" && (
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                First row is header
              </label>
            )}

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800 mb-3">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[#10B981] px-4 py-2 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
