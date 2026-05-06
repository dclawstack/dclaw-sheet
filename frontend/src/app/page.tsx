import Link from "next/link";
import { Table2 } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <Table2 className="h-16 w-16 text-[#16A34A] mb-6" />
      <h1 className="text-4xl font-bold text-[#16A34A] mb-4">DClaw Sheet</h1>
      <p className="text-lg text-gray-600 mb-8">AI-powered Excel alternative</p>
      <Link
        href="/dashboard"
        className="rounded-md bg-[#16A34A] px-6 py-3 text-white font-medium hover:bg-[#15803d] transition-colors"
      >
        Open Dashboard
      </Link>
    </main>
  );
}
