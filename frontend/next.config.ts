import type { NextConfig } from "next";

const backendBaseUrl =
  process.env.BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://pawn-agent-backend-production.up.railway.app";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
