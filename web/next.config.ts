import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  serverExternalPackages: ["z10", "happy-dom"],
  // Set turbopack root to the z10 monorepo root to prevent lockfile
  // detection from selecting a higher-level directory as workspace root.
  turbopack: {
    root: path.resolve(import.meta.dirname, ".."),
    resolveAlias: {
      tailwindcss: path.resolve(import.meta.dirname, "node_modules/tailwindcss"),
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
