/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Ship the Drizzle migration SQL with the migrate function (DATABASE_URL is only
  // available at runtime, so migrations run server-side via /api/admin/migrate).
  experimental: {
    outputFileTracingIncludes: {
      "/api/admin/migrate": ["./drizzle/**/*"],
    },
  },
  // DuckDB-WASM ships its own workers; don't let webpack try to bundle the node build.
  // We load the non-threaded MVP bundle, so no COOP/COEP cross-origin isolation needed.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};
export default nextConfig;
