import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Allow larger file uploads
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow images from any HTTPS source
      },
      {
        protocol: 'http',
        hostname: '**', // Allow images from any HTTP source (for local dev)
      },
    ],
  },
  // Disable static optimization for API routes with dynamic features
  typescript: {
    // Ignore TypeScript errors during build (optional - remove for strict builds)
    // ignoreBuildErrors: true,
  },
};

export default nextConfig;
