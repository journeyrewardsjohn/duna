/** @type {import('next').NextConfig} */
const nextConfig = {
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
