import type { Metadata } from "next";
import { Suspense } from "react";

import { SkyPhotographBenchmark } from "./sky-photograph-benchmark";

export const metadata: Metadata = {
    title: "Sky Photograph Benchmark",
    robots: { index: false, follow: false },
};

export default function Page() {
    return <Suspense><SkyPhotographBenchmark /></Suspense>;
}
