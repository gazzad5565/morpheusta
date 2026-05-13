import type { NextConfig } from "next";

/**
 * Monorepo gotcha: morpheus-admin lives in a subdirectory of a
 * larger repo (alongside morpheus-mobile, qa, db). Setting
 * turbopack.root anchors local dev's filesystem tracing here so
 * Turbopack doesn't try to crawl the entire monorepo.
 *
 * NOTE on outputFileTracingRoot: do NOT set this to
 * import.meta.dirname. It produces a Next.js 16 warning
 * ("outputFileTracingRoot and turbopack.root must match"), and
 * the previous attempt to align them by hard-coding both to the
 * admin subdir broke Vercel's post-build deployment step — the
 * deploy silently failed after "Build Completed". Leaving
 * outputFileTracingRoot unset means Vercel picks /vercel/path0
 * at build time, which is what the platform's post-build
 * validator expects. The warning is cosmetic and worth living
 * with vs the alternative of broken deploys.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
