import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
