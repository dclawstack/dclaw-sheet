/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://dclaw-sheet-backend:8020'

const nextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/health/:path*', destination: `${BACKEND_URL}/health/:path*` },
    ]
  },
  webpack: (config, { isServer }) => {
    // vega-embed pulls in the optional node `canvas` package via vega-canvas;
    // it's only needed in Node and only runs in the browser for us.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false }
    return config
  },
}

module.exports = nextConfig
