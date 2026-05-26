"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Table2, Plus, Trash2, Database, Activity } from "lucide-react";

import {
  createWorkbook,
  deleteWorkbook,
  listWorkbooks,
  type Workbook,
} from "@/lib/api";

export default function Home() {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showModal, setShowModal] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await listWorkbooks();
      setWorkbooks(list.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workbooks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWorkbook(newName.trim(), newDescription.trim() || undefined);
      setNewName("");
      setNewDescription("");
      setShowModal(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workbook");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this workbook?")) return;
    try {
      await deleteWorkbook(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete workbook");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-[#10B981] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Table2 className="h-6 w-6 text-white" />
          <h1 className="text-xl font-semibold text-white">DClaw Sheet</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/events"
            className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-2 text-sm text-white font-medium flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            Activity
          </Link>
          <Link
            href="/connections"
            className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-2 text-sm text-white font-medium flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Connections
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-2 text-sm text-white font-medium flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New workbook
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <h2 className="text-2xl font-bold text-gray-900 mb-4">Workbooks</h2>

        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : workbooks.length === 0 ? (
          <div className="rounded-lg bg-white p-12 shadow-sm border border-gray-200 text-center text-gray-500">
            <p className="mb-4">No workbooks yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-md bg-[#10B981] px-6 py-2 text-white font-medium hover:bg-[#0E9F6E]"
            >
              Create your first workbook
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workbooks.map((wb) => (
              <div
                key={wb.id}
                className="rounded-lg bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <Link
                  href={`/workbooks/${wb.id}`}
                  className="block p-5"
                >
                  <h3 className="font-semibold text-gray-900 mb-1">{wb.name}</h3>
                  {wb.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{wb.description}</p>
                  )}
                  <p className="mt-3 text-xs text-gray-400">
                    Updated {new Date(wb.updated_at).toLocaleString()}
                  </p>
                </Link>
                <div className="border-t border-gray-100 px-5 py-2 flex justify-end">
                  <button
                    onClick={() => handleDelete(wb.id)}
                    className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mx-4"
          >
            <h3 className="text-lg font-semibold mb-4">New workbook</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              autoFocus
              type="text"
              className="w-full rounded-md border border-gray-300 p-2 mb-3 text-sm focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Q1 Forecast"
              required
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              className="w-full rounded-md border border-gray-300 p-2 mb-4 text-sm focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none resize-none"
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="FY26 planning model"
            />
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
                disabled={creating}
                className="rounded-md bg-[#10B981] px-4 py-2 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
