import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DClaw Sheet — the AI spreadsheet that connects to your data",
  description:
    "Connect a data source, ask a question in plain English, get a live spreadsheet and chart back. No SQL, no CSV exports.",
};

export const viewport: Viewport = {
  themeColor: "#10B981",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
