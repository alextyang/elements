import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // A package-lock also exists above this project on the development host.
    // Pinning the root prevents Turbopack and output tracing from walking the
    // entire home directory during local validation and production builds.
    turbopack: {
        root: process.cwd(),
    },
    outputFileTracingRoot: process.cwd(),
    // Node 25 can leave Next's webpack child idle while compiling the large
    // generated benchmark manifests. The in-process build is deterministic
    // and avoids that worker IPC stall.
    experimental: {
        webpackBuildWorker: false,
    },
};

export default nextConfig;
