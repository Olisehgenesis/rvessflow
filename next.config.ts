import type { NextConfig } from "next";

const sepolia = (process.env.RVESS_NETWORK || process.env.NEXT_PUBLIC_RVESS_NETWORK) === "sepolia";

const nextConfig: NextConfig = {
  env: sepolia ? { NEXT_PUBLIC_RVESS_NETWORK: "sepolia" } : undefined,
  serverExternalPackages: ["pg"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
