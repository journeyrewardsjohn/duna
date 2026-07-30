/** @type {import('next').NextConfig} */
const nextConfig = {
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
