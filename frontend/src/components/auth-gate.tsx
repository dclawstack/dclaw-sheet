"use client";

import { useState } from "react";
import { LogIn, Table2 } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth-provider";

// Routes that don't need auth — keep this list narrow.
const PUBLIC_PREFIXES = ["/", "/about", "/pricing"];

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p));
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, needsLogin, error, signIn } = useAuth();

  if (isPublicRoute(pathname)) {
    // Public pages always render — auth status is still loaded in the
    // background so the landing page can show "Open app" → /app when
    // the user already has a session.
    return <>{children}</>;
  }
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signinError, setSigninError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        Loading…
      </div>
    );
  }

  if (needsLogin && !me) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-md">
          <div className="flex items-center gap-2 text-[#10B981] mb-6">
            <Table2 className="h-6 w-6" />
            <h1 className="text-xl font-semibold">DClaw Sheet</h1>
          </div>
          <h2 className="text-lg font-semibold mb-2">Sign in</h2>
          <p className="text-sm text-gray-600 mb-4">
            Paste a Logto-issued JWT to access your workspace.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!token.trim()) return;
              setSubmitting(true);
              setSigninError(null);
              try {
                await signIn(token.trim());
              } catch (err) {
                setSigninError(err instanceof Error ? err.message : "Sign-in failed");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOi…"
              rows={4}
              className="w-full rounded-md border border-gray-300 p-2 mb-3 text-xs font-mono focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none resize-none"
              required
            />
            {(signinError || error) && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800 mb-3">
                {signinError ?? error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !token.trim()}
              className="w-full rounded-md bg-[#10B981] px-4 py-2 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-xs text-gray-500">
            For local dev, the backend defaults to <code className="bg-gray-100 px-1 rounded">AUTH_PROVIDER=dev</code> and
            auto-grants a default workspace — you should never see this screen.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
