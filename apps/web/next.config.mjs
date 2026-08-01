/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@duna/api",
    "@duna/core",
    "@duna/pricing",
    "@duna/ui",
    "@duna/rating",
    "@duna/league-engine",
    "@duna/scheduling",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
