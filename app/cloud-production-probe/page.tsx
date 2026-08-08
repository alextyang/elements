import { createHash } from "node:crypto";

import {
    createCloudProductionPhysicalSampleWgsl,
} from "@/components/backgrounds/sky/cloud-production-physical-sample-wgsl";

import { CloudProductionShaderProbe } from
    "./cloud-production-shader-probe";

export const dynamic = "force-static";

export default function CloudProductionProbePage() {
    const shaderSource = createCloudProductionPhysicalSampleWgsl({
        group: 0,
    });
    const shaderSha256 = createHash("sha256")
        .update(shaderSource)
        .digest("hex");
    return <CloudProductionShaderProbe
        shaderSource={shaderSource}
        shaderSha256={shaderSha256}
    />;
}
