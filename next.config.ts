import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't walk up to a stray lockfile
  // in the home directory (it lives in its own git repo).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
