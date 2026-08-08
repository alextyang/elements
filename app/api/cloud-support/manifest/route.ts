import { NextResponse } from "next/server";

import {
    CLOUD_SUPPORT_MANIFEST,
    CLOUD_SUPPORT_MANIFEST_ISSUES,
} from "@/components/backgrounds/sky/cloud-support-manifest";

export const dynamic = "force-static";

export function GET() {
    return NextResponse.json({
        ...CLOUD_SUPPORT_MANIFEST,
        validationIssues: CLOUD_SUPPORT_MANIFEST_ISSUES,
    }, {
        headers: {
            "Cache-Control": "public, max-age=0, must-revalidate",
        },
    });
}
