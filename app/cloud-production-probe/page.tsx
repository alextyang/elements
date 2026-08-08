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
    return <CloudProductionShaderProbe shaderSource={shaderSource} />;
}
