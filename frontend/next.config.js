/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { appDir: true },
  async rewrites() {
    return [
      // Proxy API requests to the Django backend so cookies stay on the frontend origin.
      { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
    ];
  },
};
module.exports = nextConfig;