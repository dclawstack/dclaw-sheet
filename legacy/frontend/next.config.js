/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config, { isServer }) => {
    // vega-embed pulls in the optional node `canvas` package via vega-canvas;
    // it's only needed in Node and only runs in the browser for us.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false }
    return config
  },
}

module.exports = nextConfig
