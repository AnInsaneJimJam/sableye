import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Read the repo-root .env (as the sandbox server does at runtime), so NEXT_PUBLIC_* values such as
// NEXT_PUBLIC_REOWN_PROJECT_ID are inlined at build time. Only NEXT_PUBLIC_* ever reaches the browser.
// On Vercel, set them in the project's environment variables instead.
const rootEnv = path.join(__dirname, "../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

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
