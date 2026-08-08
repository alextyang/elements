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

test("renderer attachments remain isolated to their captured runtime namespace", () => {
    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-a", "frame-a-1", 1),
    );
    const attachmentA = registry.attachCloudShippingGpuDeviceV1({});
    assert.equal(attachmentA.snapshot().selectedRuntimeSignature, "runtime-a");
    assert.equal(attachmentA.snapshot().frameFingerprint, "frame-a-1");

    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-b", "frame-b-1", 2),
    );
    assert.equal(attachmentA.snapshot().runtimeSignature, "runtime-a",
        "another canvas must not overwrite this device's V2 buffers");
    assert.equal(attachmentA.snapshot().session.frameCount, 1);

    const attachmentB = registry.attachCloudShippingGpuDeviceV1({});
    assert.equal(attachmentB.snapshot().selectedRuntimeSignature, "runtime-b");
    assert.equal(attachmentB.snapshot().frameFingerprint, "frame-b-1");

    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-a", "frame-a-2", 3),
    );
    assert.equal(attachmentA.snapshot().frameFingerprint, "frame-a-2");
    assert.equal(attachmentA.snapshot().session.frameCount, 2);
    assert.equal(attachmentB.snapshot().frameFingerprint, "frame-b-1");
    assert.equal(attachmentB.snapshot().session.frameCount, 1);

    const snapshot = registry.cloudShippingGpuRegistrySnapshotV1();
    assert.equal(snapshot.attachmentCount, 2);
    assert.ok(snapshot.registeredRuntimeSignatures.includes("runtime-a"));
    assert.ok(snapshot.registeredRuntimeSignatures.includes("runtime-b"));

    attachmentA.destroy();
    attachmentB.destroy();
    assert.equal(registry.cloudShippingGpuRegistrySnapshotV1().attachmentCount, 0);
});

test("a device attached before runtime compilation captures only the first namespace", () => {
    const attachment = registry.attachCloudShippingGpuDeviceV1(
        {}, { runtimeSignature: null },
    );
    assert.equal(attachment.snapshot().selectedRuntimeSignature, null);
    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-c", "frame-c-1", 4),
    );
    assert.equal(attachment.snapshot().runtimeSignature, null,
        "an explicit null selection must remain disconnected");

    const awaiting = registry.attachCloudShippingGpuDeviceV1({});
    // A latest runtime exists, so the default captures it immediately.
    assert.equal(awaiting.snapshot().runtimeSignature, "runtime-c");
    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-d", "frame-d-1", 5),
    );
    assert.equal(awaiting.snapshot().runtimeSignature, "runtime-c");

    attachment.destroy();
    awaiting.destroy();
});

test("attachments can explicitly retarget without reallocating their session", () => {
    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-e", "frame-e-1", 6),
    );
    registry.registerCloudShippingProductionRuntimeV1(
        runtime("runtime-f", "frame-f-1", 7),
    );
    const attachment = registry.attachCloudShippingGpuDeviceV1(
        {}, { runtimeSignature: "runtime-e" },
    );
    assert.equal(attachment.snapshot().runtimeSignature, "runtime-e");
    assert.equal(attachment.snapshot().session.frameCount, 1);

    attachment.selectRuntime("runtime-f");
    assert.equal(attachment.snapshot().selectedRuntimeSignature, "runtime-f");
    assert.equal(attachment.snapshot().runtimeSignature, "runtime-f");
    assert.equal(attachment.snapshot().session.frameCount, 2);

    attachment.selectRuntime(null);
    assert.equal(attachment.snapshot().selectedRuntimeSignature, null);
    assert.equal(attachment.snapshot().runtimeSignature, null);
    assert.equal(attachment.bindGroupEntries().length, 1,
        "disconnecting preserves renderer-owned allocations for later reuse");
    attachment.destroy();
    assert.equal(attachment.bindGroupEntries().length, 0);
});

test("shipping optical-owner upload owns the V2 device attachment lifetime", () => {
    assert.match(opticsSource, /attachCloudShippingGpuDeviceV1/);
    assert.match(opticsSource, /productionV2:/);
    assert.match(opticsSource,
        /destroy:\s*\(\) => \{[\s\S]*productionV2\.destroy\(\)[\s\S]*buffer\.destroy/);
    assert.doesNotMatch(opticsSource, /requestAdapter|requestDevice/);
});

test("every cached or fresh shipping frame is published by exact namespace", () => {
    assert.match(shippingSource,
        /if \(cached\) \{[\s\S]*registerCloudShippingProductionRuntimeV1\(cached\)/);
    assert.match(shippingSource,
        /registerCloudShippingProductionRuntimeV1\(result\);[\s\S]*return result/);
    assert.match(registrySource, /selectedRuntimeSignature/);
    assert.match(registrySource,
        /attachment\.selectedRuntimeSignature !== runtime\.runtimeSignature/);
    assert.doesNotMatch(shippingSource, /navigator\.gpu|requestAdapter|requestDevice/);
});
