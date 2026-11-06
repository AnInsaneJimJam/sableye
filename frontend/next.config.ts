import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Include the sibling SDK packages when Vercel traces server dependencies.
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Hide the on-screen dev badge. It never shipped to production anyway,
  // but it sits over the landing page's lower-left corner while developing.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
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
