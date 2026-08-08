import { NextResponse } from "next/server";

import {
    CURRENT_CLOUD_GATE_A_MIGRATION,
} from "@/components/backgrounds/sky/cloud-gate-a-qualification";
import {
    CLOUD_SUPPORT_MANIFEST,
    CLOUD_SUPPORT_MANIFEST_ISSUES,
} from "@/components/backgrounds/sky/cloud-support-manifest";

export const dynamic = "force-static";

export function GET() {
    const liveIntegratedComponents = CURRENT_CLOUD_GATE_A_MIGRATION.filter(
        ({ state }) => state === "live-integrated" || state === "qualified",
    ).length;
    return NextResponse.json({
        ...CLOUD_SUPPORT_MANIFEST,
        validationIssues: CLOUD_SUPPORT_MANIFEST_ISSUES,
        rendererGateA: {
            ready: liveIntegratedComponents ===
                CURRENT_CLOUD_GATE_A_MIGRATION.length,
            liveIntegratedComponents,
            requiredComponents: CURRENT_CLOUD_GATE_A_MIGRATION.length,
            migration: CURRENT_CLOUD_GATE_A_MIGRATION,
            note: "Static migration state only. Runtime frame, upload, and parity evidence is returned by /api/cloud-generation.",
        },
    }, {
        headers: {
            "Cache-Control": "public, max-age=0, must-revalidate",
        },
    });
}
