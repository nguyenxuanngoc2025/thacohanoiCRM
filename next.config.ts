import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Cho phép Budget (thacoautohn-mkt.com + subdomain) nhúng /embed vào iframe.
        // Chỉ nới cho route embed — phần còn lại của site không cho framing.
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://thacoautohn-mkt.com https://*.thacoautohn-mkt.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
