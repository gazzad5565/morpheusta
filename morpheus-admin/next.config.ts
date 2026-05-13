import type { NextConfig } from "next";

/**
 * Monorepo gotcha: morpheus-admin lives in a subdirectory of a
 * larger repo (alongside morpheus-mobile, qa, db). On Vercel
 * builds, `outputFileTracingRoot` defaults to the repo root
 * (/vercel/path0). Turbopack also expects a root — if those two
 * diverge, Next.js 16 fires a warning AND can include too many
 * files in the tracing output, bloating the deploy.
 *
 * Setting both to the same `import.meta.dirname` (= this directory,
 * i.e. /path/to/repo/morpheus-admin) keeps them aligned. Each value
 * resolves at build time on Vercel to /vercel/path0/morpheus-admin,
 * matching what the Vercel project's "Root Directory" setting
 * expects.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
