import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/components/auth-provider"
import { AuthGate } from "@/components/auth-gate"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "DClaw Sheet",
  description: "AI-powered spreadsheets for FP&A and Ops teams",
  manifest: "/manifest.webmanifest",
  applicationName: "DClaw Sheet",
  appleWebApp: {
    capable: true,
    title: "DClaw Sheet",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#10B981",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  )
}
