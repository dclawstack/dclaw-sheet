/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // DuckDB-WASM ships its own workers; don't let webpack try to bundle the node build.
  // We load the non-threaded MVP bundle, so no COOP/COEP cross-origin isolation needed.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};
export default nextConfig;
