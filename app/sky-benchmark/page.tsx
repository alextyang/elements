import type { Metadata } from "next";
import { Suspense } from "react";

import { SkyBenchmark } from "./sky-benchmark";

export const metadata: Metadata = {
    title: "Lunar Rendering Evidence",
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
};

export default function SkyBenchmarkPage() {
    return (
        <Suspense>
            <SkyBenchmark />
        </Suspense>
    );
}
