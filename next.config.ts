import type { NextConfig } from "next";

const requestedBuildWorker = process.env.ELEMENTS_WEBPACK_BUILD_WORKER;
const isPreviewCaptureBuild = process.env.ELEMENTS_PREVIEW_SKIP_TYPECHECK === "1";
const useWebpackBuildWorker = requestedBuildWorker === "1"
    ? true
    : requestedBuildWorker === "0"
        ? false
        : Number(process.versions.node.split(".")[0]) < 25;

const nextConfig: NextConfig = {
    // Allows isolated production validation while another local dev server is
    // legitimately using `.next` in the same worktree.
    distDir: process.env.ELEMENTS_NEXT_DIST_DIR || ".next",
    // A package-lock also exists above this project on the development host.
    // Pinning the root prevents Turbopack and output tracing from walking the
    // entire home directory during local validation and production builds.
    turbopack: {
        root: process.cwd(),
    },
    outputFileTracingRoot: process.cwd(),
    // Node 25 can leave Next's webpack child idle while compiling the large
    // generated benchmark manifests. Node 22's worker is substantially faster,
    // while the in-process path remains the safer fallback on 25+.
    experimental: {
        webpackBuildWorker: useWebpackBuildWorker,
    },
    // Preview capture is an isolated, revision-pinned production bundle. Its
    // source validation runs separately, so repeating Next's type pass for
    // every watched renderer edit only delays captures (and has hung on some
    // local Next/TypeScript combinations). Ordinary application builds retain
    // Next's full type check.
    typescript: {
        ignoreBuildErrors: isPreviewCaptureBuild,
    },
};

export default nextConfig;
