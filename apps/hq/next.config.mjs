/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@duna/api",
    "@duna/core",
    "@duna/db",
    "@duna/league-engine",
    "@duna/pricing",
    "@duna/rating",
    "@duna/scheduling",
    "@duna/ui",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
