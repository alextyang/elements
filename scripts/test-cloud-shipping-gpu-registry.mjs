import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const registrySource = readFileSync(new URL(
    "cloud-shipping-gpu-registry.ts", sourceRoot,
), "utf8");
const opticsSource = readFileSync(new URL(
    "cloud-optics-runtime.ts", sourceRoot,
), "utf8");
const shippingSource = readFileSync(new URL(
    "cloud-shipping-production-runtime.ts", sourceRoot,
), "utf8");

const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-shipping-gpu-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const registryOutput = ts.transpileModule(registrySource, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText
    .replace('"./cloud-production-gpu-session"',
        '"./cloud-production-gpu-session.mjs"');
writeFileSync(join(temporaryRoot, "cloud-shipping-gpu-registry.mjs"),
    registryOutput);
writeFileSync(join(temporaryRoot, "cloud-production-gpu-session.mjs"), `
export class CloudProductionGpuSessionV1 {
    constructor(device, options) {
        this.device = device;
        this.options = options;
        this.destroyed = false;
        this.frameCount = 0;
        this.uploadedFrameFingerprint = null;
    }
    update(value) {
        this.frameCount += 1;
        this.uploadedFrameFingerprint = value.systems[0]?.owner.sourceId ?? "empty";
        return {
            frame: { fingerprint: "session:" + value.frameIndex },
            uploadPlan: { complete: true },
            uploadIssues: [],
            uploaded: true,
            resourcesCreated: this.frameCount === 1,
            uploadedFrameFingerprint: this.uploadedFrameFingerprint,
        };
    }
    bindGroupEntries() {
        return this.destroyed ? [] : [{ binding: 31, resource: { buffer: {} } }];
    }
    snapshot() {
        return {
            schemaVersion: 1,
            destroyed: this.destroyed,
            frameCount: this.frameCount,
            previousFrameFingerprint: this.frameCount ? "previous" : null,
            uploadedFrameFingerprint: this.uploadedFrameFingerprint,
            resourceCount: this.destroyed ? 0 : 15,
        };
    }
    destroy() { this.destroyed = true; }
}
`);

const registry = await import(new URL(
    `file://${join(temporaryRoot, "cloud-shipping-gpu-registry.mjs")}`,
));

const runtime = (signature, fingerprint, frameIndex) => ({
    schemaVersion: 1,
    runtimeSignature: signature,
    frameIndex,
    simulationTimeSeconds: frameIndex * 30,
    bridge: {
        systemsV2: [{ owner: { sourceId: signature } }],
        frame: { fingerprint },
    },
});

test("the shipping registry uploads the latest frame when a renderer device attaches", () => {
    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-a", "frame-a", 1),
    );
    const attachment = registry.attachCloudShippingGpuDeviceV1({});
    const initial = attachment.snapshot();
    assert.equal(initial.runtimeSignature, "runtime-a");
    assert.equal(initial.frameFingerprint, "frame-a");
    assert.equal(initial.uploaded, true);
    assert.equal(initial.session.frameCount, 1);
    assert.equal(attachment.bindGroupEntries().length, 1);

    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-a", "frame-a", 1),
    );
    assert.equal(attachment.snapshot().session.frameCount, 1,
        "identical production frames must not upload again");

    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-b", "frame-b", 2),
    );
    const updated = attachment.snapshot();
    assert.equal(updated.runtimeSignature, "runtime-b");
    assert.equal(updated.frameFingerprint, "frame-b");
    assert.equal(updated.session.frameCount, 2);

    attachment.destroy();
    assert.equal(attachment.snapshot().session.destroyed, true);
    assert.equal(attachment.bindGroupEntries().length, 0);
    assert.equal(registry.cloudShippingGpuRegistrySnapshotV1().attachmentCount, 0);
});

test("shipping optical-owner upload owns the V2 device attachment lifetime", () => {
    assert.match(opticsSource, /attachCloudShippingGpuDeviceV1/);
    assert.match(opticsSource, /productionV2:/);
    assert.match(opticsSource,
        /destroy:\s*\(\) => \{[\s\S]*productionV2\.destroy\(\)[\s\S]*buffer\.destroy/);
    assert.doesNotMatch(opticsSource, /requestAdapter|requestDevice/);
});

test("every cached or fresh shipping frame is published to attached devices", () => {
    assert.match(shippingSource,
        /if \(cached\) \{[\s\S]*registerCloudShippingProductionRuntimeV1\(cached\)/);
    assert.match(shippingSource,
        /registerCloudShippingProductionRuntimeV1\(result\);[\s\S]*return result/);
    assert.doesNotMatch(shippingSource, /navigator\.gpu|requestAdapter|requestDevice/);
});
