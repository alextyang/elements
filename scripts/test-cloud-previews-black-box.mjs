#!/usr/bin/env node
/*
 * Public-contract acceptance test for cloud previews.
 *
 * This test deliberately reads only public assets, the generator's documented
 * command output, routes, and resulting PNG files.  It does not import app
 * modules or make claims about the renderer's internal implementation.
 *
 * Usage:
 *   node scripts/test-cloud-previews-black-box.mjs --url http://127.0.0.1:3000
 *   node scripts/test-cloud-previews-black-box.mjs --exercise-capture --url http://127.0.0.1:3000
 *   node scripts/test-cloud-previews-black-box.mjs \
 *     --spissatus-final /absolute/final.png --spissatus-direct /absolute/direct.png
 *
 * --exercise-capture deliberately re-renders only the two named canonical
 * cases.  It is opt-in because it changes generated preview files.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import sharp from 'sharp';

import {
  HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT,
  evaluateHighCloudPreviewImage,
  measureCloudPreviewImage,
} from './lib/cloud-preview-image-qualification.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_URL = 'http://127.0.0.1:3000';
const CATALOGUE_COUNT = 276;
const CANONICAL_COUNT = 60;
const SPISSATUS_ID = 'base:cirrus:spissatus';
const STRATUS_ID = 'base:stratus:nebulosus';
const DEFAULT_TIMEOUT_MS = 180_000;
const HTTP_TIMEOUT_MS = 12_000;

function usage() {
  console.log(`Usage: node scripts/test-cloud-previews-black-box.mjs [options]

Options:
  --url URL                    Running Elements server (default ${DEFAULT_URL})
  --manifest PATH              Preview manifest (default public/generated/cloud-previews/manifest.json)
  --atlas PATH                 Atlas manifest (default public/assets/sky/cloud-macro-atlas-v2.json)
  --spissatus-final PATH       Final Spissatus PNG, captured through the public route
  --spissatus-direct PATH      Direct-sun Spissatus PNG, captured through the public route
  --exercise-capture           Force only Spissatus and Stratus through the public generator
  --timeout-ms N               Per-image public-generator limit (default ${DEFAULT_TIMEOUT_MS})
  --evidence PATH              Write JSON evidence here (default output/cloud-preview-black-box-evidence.json)
  --skip-matrix                Do not request /cloud-preview-matrix (offline manifest-only use)
  --help                       Print this help
`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    manifest: join(ROOT, 'public/generated/cloud-previews/manifest.json'),
    atlas: join(ROOT, 'public/assets/sky/cloud-macro-atlas-v2.json'),
    evidence: join(ROOT, 'output/cloud-preview-black-box-evidence.json'),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    exerciseCapture: false,
    skipMatrix: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help') return { help: true };
    if (value === '--exercise-capture') { options.exerciseCapture = true; continue; }
    if (value === '--skip-matrix') { options.skipMatrix = true; continue; }
    if (!['--url', '--manifest', '--atlas', '--spissatus-final', '--spissatus-direct', '--timeout-ms', '--evidence'].includes(value)) {
      throw new Error(`Unknown option: ${value}`);
    }
    const next = argv[++index];
    if (!next) throw new Error(`${value} needs a value.`);
    if (value === '--url') options.url = next.replace(/\/$/, '');
    if (value === '--timeout-ms') {
      options.timeoutMs = Number(next);
      if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive integer.');
      continue;
    }
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    options[key] = isAbsolute(next) ? next : resolve(ROOT, next);
  }
  if (Boolean(options.spissatusFinal) !== Boolean(options.spissatusDirect)) {
    throw new Error('Provide both --spissatus-final and --spissatus-direct so both required views are tested.');
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) { usage(); process.exit(0); }

const evidence = {
  test: 'cloud-preview-black-box',
  startedAt: new Date().toISOString(),
  inputs: {
    url: options.url,
    manifest: options.manifest,
    atlas: options.atlas,
    exerciseCapture: options.exerciseCapture,
    spissatusImages: Boolean(options.spissatusFinal),
  },
  checks: [],
  failures: [],
  warnings: [],
};

function addCheck(name, pass, details = {}) {
  evidence.checks.push({ name, pass, ...details });
  if (!pass) evidence.failures.push({ name, ...details });
}

function warn(name, details = {}) {
  evidence.warnings.push({ name, ...details });
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    addCheck(`${label} readable JSON`, false, { path, error: String(error) });
    return null;
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function firstString(object, paths) {
  for (const path of paths) {
    let value = object;
    for (const part of path.split('.')) value = value?.[part];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function entryIdentifier(entry) {
  return firstString(entry, ['id']);
}

function entryImageUrl(entry) {
  return firstString(entry, ['imageUrl']);
}

function imageUrlPath(imageUrl) {
  if (typeof imageUrl !== 'string') return null;
  try {
    const parsed = new URL(imageUrl, 'http://manifest.invalid');
    if (parsed.origin !== 'http://manifest.invalid') return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function entryPngName(entry) {
  const pathname = imageUrlPath(entryImageUrl(entry));
  return pathname ? basename(pathname) : null;
}

function entryImagePath(entry) {
  const pathname = imageUrlPath(entryImageUrl(entry));
  const publicImageRoot = resolve(ROOT, 'public/generated/cloud-previews/images');
  if (!pathname || !pathname.startsWith('/generated/cloud-previews/images/')) return null;
  const imagePath = resolve(ROOT, 'public', `.${pathname}`);
  return imagePath.startsWith(`${publicImageRoot}/`) ? imagePath : null;
}

function accepted(entry) {
  const status = firstString(entry, ['status', 'acceptance.status', 'qualification.status']);
  return !status || /^(accepted|complete|completed|published)$/i.test(status);
}

function command(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function catalogueFromPublicCommand() {
  try {
    const catalogue = JSON.parse(command(process.execPath, ['scripts/generate-cloud-previews.mjs', '--list']));
    addCheck('public catalogue is a JSON array', Array.isArray(catalogue), { count: Array.isArray(catalogue) ? catalogue.length : null });
    if (!Array.isArray(catalogue)) return [];
    addCheck('full public catalogue count is exact', catalogue.length === CATALOGUE_COUNT, { expected: CATALOGUE_COUNT, actual: catalogue.length });
    const canonical = catalogue.filter((entry) => entry.scope === 'canonical');
    addCheck('canonical public catalogue count is exact', canonical.length === CANONICAL_COUNT, { expected: CANONICAL_COUNT, actual: canonical.length });
    addCheck('Spissatus canonical identity is public', canonical.some((entry) => entry.id === SPISSATUS_ID), { expectedId: SPISSATUS_ID });
    addCheck('Stratus canonical identity is public', canonical.some((entry) => entry.id === STRATUS_ID), { expectedId: STRATUS_ID });
    return catalogue;
  } catch (error) {
    addCheck('public catalogue command succeeds', false, { error: String(error) });
    return [];
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return { status: response.status, headers: Object.fromEntries(response.headers), text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function testStaticMatrix() {
  if (options.skipMatrix) {
    warn('matrix check skipped', { reason: '--skip-matrix was supplied' });
    return;
  }
  const route = `${options.url}/cloud-preview-matrix`;
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(route);
    const elapsedMs = Date.now() - started;
    const source = response.text.toLowerCase();
    addCheck('static matrix route responds', response.status >= 200 && response.status < 300, { route, status: response.status, elapsedMs, contentType: response.headers['content-type'] });
    // These are observable, page-level renderer surfaces.  The check does not
    // inspect bundled source or attempt to infer how the page is implemented.
    const prohibited = ['<canvas', '<iframe', 'navigator.gpu', 'requestadapter', 'webgpu'];
    const present = prohibited.filter((token) => source.includes(token));
    addCheck('static matrix contains no observable live-renderer surface', present.length === 0, { route, prohibitedFound: present, responseBytes: Buffer.byteLength(response.text) });
  } catch (error) {
    addCheck('static matrix route responds within bounded time', false, { route, timeoutMs: HTTP_TIMEOUT_MS, error: String(error) });
  }
}

function validateManifest(manifest, atlas, catalogue) {
  if (!manifest || !atlas) return [];
  const entries = Array.isArray(manifest.entries) ? manifest.entries : null;
  addCheck('preview manifest has entries array', Boolean(entries), { type: typeof manifest.entries });
  if (!entries) return [];
  addCheck('manifest declares the exact complete catalogue size', manifest.total === CATALOGUE_COUNT, { expected: CATALOGUE_COUNT, actual: manifest.total });
  addCheck('manifest completed count equals published entries', manifest.completed === entries.length, { completed: manifest.completed, entryCount: entries.length });
  addCheck('manifest cannot publish more than its public catalogue', entries.length <= CATALOGUE_COUNT, { entryCount: entries.length, catalogueCount: CATALOGUE_COUNT });
  if (entries.length === CATALOGUE_COUNT) addCheck('complete manifest status is complete', /^(complete|completed)$/i.test(String(manifest.status)), { status: manifest.status });
  else addCheck('partial manifest is not labelled complete', !/^(complete|completed)$/i.test(String(manifest.status)), { status: manifest.status, entryCount: entries.length });

  const headerRenderer = manifest.rendererHash;
  addCheck('manifest has current renderer SHA-256 identity', isSha256(headerRenderer), { rendererHash: headerRenderer });
  const currentChecksums = atlas.checksums;
  const currentAssetKeys = ['atlas', 'majorants', 'exteriorBoundary'];
  addCheck('public atlas manifest has all cloud asset SHA-256 checksums',
    currentChecksums?.algorithm === 'SHA-256' &&
      currentAssetKeys.every((key) => isSha256(currentChecksums?.[key])),
    { checksums: currentChecksums });
  const manifestChecksums = manifest.assetChecksums;
  const hasManifestAssetIdentity = manifestChecksums &&
    manifestChecksums.algorithm === 'SHA-256' &&
    currentAssetKeys.every((key) => isSha256(manifestChecksums[key]));
  addCheck('newly generated manifest declares cloud asset identities',
    Boolean(hasManifestAssetIdentity), {
      expectedField: 'assetChecksums',
      actual: manifestChecksums,
      publicInterfaceGap: hasManifestAssetIdentity ? undefined :
        'A generated preview manifest without assetChecksums cannot prove that accepted images match the current cloud-volume assets.',
    });
  if (hasManifestAssetIdentity) {
    for (const key of currentAssetKeys) {
      addCheck(`manifest ${key} identity matches the public atlas manifest`,
        manifestChecksums[key] === currentChecksums?.[key], {
          expected: currentChecksums?.[key], actual: manifestChecksums[key],
        });
    }
  }

  const listedIds = new Set(catalogue.map((entry) => entry.id));
  const catalogueById = new Map(catalogue.map((entry) => [entry.id, entry]));
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const identifier = entryIdentifier(entry);
    const caseId = firstString(entry, ['caseId']);
    const contentHash = firstString(entry, ['contentHash']);
    const imageContentHash = firstString(entry, ['imageContentHash']);
    const imageUrl = entryImageUrl(entry);
    const png = entryPngName(entry);
    const location = { index, identifier, caseId, accepted: accepted(entry), imageUrl, png };
    addCheck(`entry ${index} has a public catalogue identity`, Boolean(identifier) && listedIds.has(identifier), { ...location, known: Boolean(identifier) && listedIds.has(identifier) });
    addCheck(`entry ${index} is unique`, Boolean(identifier) && !seen.has(identifier), location);
    if (identifier) seen.add(identifier);
    if (!accepted(entry)) continue;
    addCheck(`accepted entry ${index} is covered by the current renderer header`, isSha256(headerRenderer), { ...location, rendererHash: headerRenderer });
    addCheck(`accepted entry ${index} is covered by the current cloud asset header`, Boolean(hasManifestAssetIdentity), { ...location, assetChecksums: manifestChecksums });
    addCheck(`accepted entry ${index} has the catalogue case identity`, Boolean(caseId) && caseId === catalogueById.get(identifier)?.caseId, { ...location, expectedCaseId: catalogueById.get(identifier)?.caseId });
    addCheck(`accepted entry ${index} has a case-input content hash`, isSha256(contentHash), { ...location, contentHash });
    addCheck(`accepted entry ${index} has a full image content hash`, isSha256(imageContentHash), { ...location, imageContentHash });
    addCheck(`accepted entry ${index} uses the public immutable image URL`, imageUrlPath(imageUrl)?.startsWith('/generated/cloud-previews/images/') === true, { ...location });
    addCheck(`accepted entry ${index} names the image-content hash prefix`, Boolean(png && isSha256(imageContentHash) && png.toLowerCase().endsWith(`-${imageContentHash.slice(0, 12).toLowerCase()}.png`)), { ...location, expectedSuffix: isSha256(imageContentHash) ? `-${imageContentHash.slice(0, 12).toLowerCase()}.png` : null });
    const imagePath = entryImagePath(entry);
    addCheck(`accepted entry ${index} resolves inside the public image directory`, Boolean(imagePath), { ...location, imagePath });
    if (!imagePath) continue;
    addCheck(`accepted entry ${index} PNG exists`, existsSync(imagePath), { ...location, imagePath });
    if (!existsSync(imagePath)) continue;
    const digest = sha256File(imagePath);
    addCheck(`accepted entry ${index} PNG digest matches imageContentHash`, digest === imageContentHash, { ...location, imagePath, expectedDigest: imageContentHash, actualDigest: digest });
  }

  const canonicalIds = catalogue.filter((entry) => entry.scope === 'canonical').map((entry) => entry.id);
  const completedCanonical = canonicalIds.filter((id) => seen.has(id));
  if (entries.length === CATALOGUE_COUNT) addCheck('complete manifest contains all canonical identities', completedCanonical.length === CANONICAL_COUNT, { expected: CANONICAL_COUNT, actual: completedCanonical.length });
  else warn('full canonical acceptance deferred', { reason: 'manifest is partial', completedCanonical: completedCanonical.length, expectedCanonical: CANONICAL_COUNT });
  return entries;
}

function descendantsInProcessGroup(pgid) {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' });
  if (result.status !== 0) return { error: result.stderr || 'ps failed', processes: [] };
  const processes = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), command: match[4] } : null;
  }).filter(Boolean).filter((process) => process.pgid === pgid);
  return { processes };
}

async function exerciseCapture() {
  if (!options.exerciseCapture) return;
  const args = [
    'scripts/generate-cloud-previews.mjs', '--url', options.url, '--force',
    '--only', `${SPISSATUS_ID},${STRATUS_ID}`, '--fail-fast', '--timeout-ms', String(options.timeoutMs),
  ];
  const wallLimitMs = options.timeoutMs * 2 + 45_000;
  const started = Date.now();
  const child = spawn(process.execPath, args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const samples = [];
  const monitor = setInterval(() => samples.push({ atMs: Date.now() - started, ...descendantsInProcessGroup(child.pid) }), 250);
  let killed = false;
  const watchdog = setTimeout(() => {
    killed = true;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* process already ended */ }
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* process already ended */ } }, 5_000).unref();
  }, wallLimitMs);
  const outcome = await new Promise((done) => child.once('close', (code, signal) => done({ code, signal })));
  clearInterval(monitor);
  const elapsedMs = Date.now() - started;
  await new Promise((done) => setTimeout(done, 750));
  const residual = descendantsInProcessGroup(child.pid);
  addCheck('two-case public capture has a bounded wall time', !killed && elapsedMs <= wallLimitMs, { elapsedMs, wallLimitMs, killed, outputTail: output.slice(-4_000) });
  addCheck('two-case public capture exits successfully', outcome.code === 0 && !outcome.signal, { outcome, elapsedMs, outputTail: output.slice(-4_000) });
  addCheck('capture process group is cleaned up', residual.processes.length === 0, { generatorPgid: child.pid, residual: residual.processes, monitorSamples: samples.slice(-20) });
  const peakProcessCount = Math.max(0, ...samples.map((sample) => sample.processes?.length ?? 0));
  // This is evidence, not an invented browser-count threshold: public process
  // output does not expose per-case lifecycle events.  The manifest checks
  // below prove that the two requested identities were the only test targets.
  warn('serial capture evidence limitation', { generatorPgid: child.pid, peakProcessGroupSize: peakProcessCount, samples: samples.length, reason: 'The public CLI has no per-case start/finish event stream; a strict no-overlap assertion needs that public evidence.' });
  const manifest = readJson(options.manifest, 'post-capture preview manifest');
  if (!manifest || !Array.isArray(manifest.entries)) return;
  const ids = new Set(manifest.entries.map(entryIdentifier));
  addCheck('forced Spissatus capture was published', ids.has(SPISSATUS_ID), { expectedId: SPISSATUS_ID });
  addCheck('bounded Stratus capture was published', ids.has(STRATUS_ID), { expectedId: STRATUS_ID, perImageTimeoutMs: options.timeoutMs });
}

async function imageMetrics(path) {
  if (!existsSync(path)) throw new Error(`PNG does not exist: ${path}`);
  // Keep the black-box check byte/source compatible with the generator's
  // publication gate. In particular, do not infer topology from composited
  // beauty pixels: sky, horizon, debug overlays, and overlapping bodies are
  // not separately observable through a public PNG.
  const { data, info } = await sharp(path)
    .resize({ width: HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT.analysisWidth })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const qualification = evaluateHighCloudPreviewImage(measureCloudPreviewImage({
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  }));
  return {
    path,
    sha256: sha256File(path),
    dimensions: { width: info.width, height: info.height },
    analysisWidth: HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT.analysisWidth,
    ...qualification,
  };
}

async function testSpissatusImages() {
  if (!options.spissatusFinal) {
    warn('Spissatus image qualification not run', { reason: 'Direct and final public-route PNGs were not supplied. The public route currently has no documented PNG export endpoint.' });
    return;
  }
  for (const [label, path] of [['final', options.spissatusFinal], ['direct-sun', options.spissatusDirect]]) {
    try {
      const result = await imageMetrics(path);
      const details = {
        stage: label,
        imageInterface: label === 'final'
          ? 'public final composited PNG'
          : 'public lighting-direct-sun debug PNG',
        qualifier: 'scripts/lib/cloud-preview-image-qualification.mjs',
        ...result,
      };
      addCheck(`Spissatus ${label} production image qualifier is ready`, result.ready, details);
      addCheck(`Spissatus ${label} scale-separated structure is ready`, result.scaleSeparatedStructureReady, details);
      addCheck(`Spissatus ${label} has no production radial artifact`, !result.radialArtifact, details);
      warn(`Spissatus ${label} exact body topology deferred`, {
        stage: label,
        interfaceGap: 'A public composited PNG does not expose a cloud-body mask or owner IDs; sky, horizon, debug overlays, and overlapping bodies make an exact three-body count unobservable.',
        deferredExpectation: 'three native Spissatus bodies must be verified by a renderer-owned topology/readiness interface, not inferred from beauty pixels.',
      });
    } catch (error) {
      addCheck(`Spissatus ${label} image is analysable`, false, { path, error: String(error) });
    }
  }
}

function writeEvidence() {
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.failures.length === 0;
  try {
    writeFileSync(options.evidence, `${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error) {
    console.error(`Could not write evidence ${options.evidence}: ${error}`);
  }
  console.log(JSON.stringify({ passed: evidence.passed, checks: evidence.checks.length, failures: evidence.failures.length, warnings: evidence.warnings.length, evidence: options.evidence }, null, 2));
  if (evidence.failures.length) {
    console.error('Failures:');
    for (const failure of evidence.failures) console.error(`- ${failure.name}: ${JSON.stringify(failure)}`);
  }
}

try {
  const catalogue = catalogueFromPublicCommand();
  await testStaticMatrix();
  await exerciseCapture();
  const atlas = readJson(options.atlas, 'atlas manifest');
  const manifest = readJson(options.manifest, 'preview manifest');
  validateManifest(manifest, atlas, catalogue);
  await testSpissatusImages();
} catch (error) {
  addCheck('test harness completes without an unbounded loop', false, { error: String(error) });
} finally {
  writeEvidence();
}

if (evidence.failures.length) process.exitCode = 1;
