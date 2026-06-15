/**
 * Central env access. Server-only values must never leak to the client bundle,
 * so this module is only imported from server code (Route Handlers, server components).
 */

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  // Database — Neon pooled connection string. Required in prod; falls back to a
  // local marker so the app can boot for UI work before the DB is wired.
  DATABASE_URL: opt("DATABASE_URL"),

  // AI
  OPENROUTER_API_KEY: opt("OPENROUTER_API_KEY"),
  OPENROUTER_MONTHLY_CAP_USD: opt("OPENROUTER_MONTHLY_CAP_USD"),
  OPENROUTER_BASE_URL: opt("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
  OPENROUTER_SITE_URL: opt("OPENROUTER_SITE_URL") ?? "https://dclaw-sheet.vercel.app",
  OPENROUTER_APP_NAME: opt("OPENROUTER_APP_NAME") ?? "DClaw Sheet",

  // Auth
  AUTH_PROVIDER: (opt("AUTH_PROVIDER") ?? "dev") as "dev" | "clerk",
  DEV_USER_EMAIL: opt("DEV_USER_EMAIL") ?? "dev@dclawstack.local",
  DEV_WORKSPACE: opt("DEV_WORKSPACE") ?? "Demo Workspace",

  // Connectors
  STRIPE_TEST_RESTRICTED_KEY: opt("STRIPE_TEST_RESTRICTED_KEY"),

  // Misc
  APP_ENV: opt("APP_ENV") ?? "dev",
};

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Paste a Neon pooled connection string into SETUP-KEYS.md / .env.local."
    );
  }
  return env.DATABASE_URL;
}

export const aiEnabled = () => Boolean(env.OPENROUTER_API_KEY);
export const dbEnabled = () => Boolean(env.DATABASE_URL);
