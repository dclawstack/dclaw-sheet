"use client";

import { useState } from "react";
import { Table2 } from "lucide-react";

export default function Dashboard() {
  const [sheetName, setSheetName] = useState("");
  const [csvData, setCsvData] = useState("");
  const [results, setResults] = useState<{
    summaryStats: { mean: number; max: number; min: number };
    chartPreview: string;
    anomalyCount: number;
  } | null>(null);

  const handleAnalyze = () => {
    setResults({
      summaryStats: {
        mean: parseFloat((Math.random() * 100).toFixed(2)),
        max: parseFloat((Math.random() * 200 + 100).toFixed(2)),
        min: parseFloat((Math.random() * 50).toFixed(2)),
      },
      chartPreview: "Bar chart preview",
      anomalyCount: Math.floor(Math.random() * 10),
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-[#16A34A] px-6 py-4 flex items-center gap-3">
        <Table2 className="h-6 w-6 text-white" />
        <h1 className="text-xl font-semibold text-white">DClaw Sheet</h1>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Data Import</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sheet name</label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] outline-none"
              placeholder="My Analysis"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paste CSV data</label>
            <textarea
              className="w-full h-64 rounded-lg border border-gray-300 p-4 text-sm focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] outline-none resize-none"
              placeholder="name,value\nAlice,42\nBob,17..."
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
            />
          </div>
          <button
            onClick={handleAnalyze}
            className="rounded-md bg-[#16A34A] px-6 py-3 text-white font-medium hover:bg-[#15803d] transition-colors"
          >
            Analyze
          </button>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Results</h2>
          {results ? (
            <div className="space-y-6">
              <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Summary Stats</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Mean</p>
                    <p className="text-xl font-bold text-[#16A34A]">{results.summaryStats.mean}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Max</p>
                    <p className="text-xl font-bold text-[#16A34A]">{results.summaryStats.max}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Min</p>
                    <p className="text-xl font-bold text-[#16A34A]">{results.summaryStats.min}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Chart Preview</h3>
                <p className="text-gray-800 text-sm">{results.chartPreview}</p>
              </div>

              <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Anomaly Count</h3>
                <p className="text-3xl font-bold text-[#16A34A]">{results.anomalyCount}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white p-12 shadow-sm border border-gray-200 text-center text-gray-500">
              Analyze data to see results
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
