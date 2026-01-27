import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow API calls to the backend
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: `${process.env.API_URL || 'http://localhost:3001'}/api/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
