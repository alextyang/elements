import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
    sep,
} from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const MODULE_NAMES = [
    "cloud-scene",
    "cloud-state-map",
    "high-cloud-physical-foundation",
    "middle-cloud-physical-foundation",
    "low-layered-cloud-physical-foundation",
    "upper-atmospheric-cloud-foundation",
    "cloud-family-admissibility",
    "cloud-special-origin-source",
    "hydrometeor-system",
    "cloud-photograph-benchmark",
    "cloud-morphology-photograph-qualification",
    "weather-qualification-matrix",
    "weather-cloud-photograph-benchmark",
];

const TRANSPILE_OPTIONS = {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
};

const isInside = (root, candidate) => {
    const pathFromRoot = relative(root, candidate);
    return pathFromRoot === "" || (!isAbsolute(pathFromRoot) &&
        pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
};

const regularFile = (path) => {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
};

const emittedModulePath = ({ sourceRoot, temporaryRoot, sourcePath }) => {
    const sourceRelativePath = relative(sourceRoot, sourcePath);
    return join(
        temporaryRoot,
        sourceRelativePath.replace(/\.ts$/, ".mjs"),
    );
};

const relativeEsmSpecifier = (fromPath, toPath) => {
    const pathFromImporter = relative(dirname(fromPath), toPath)
        .split(sep).join("/");
    return pathFromImporter.startsWith(".")
        ? pathFromImporter
        : `./${pathFromImporter}`;
};

const staticModuleSpecifiers = (source, filename) => {
    const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.ES2022,
        true,
        ts.ScriptKind.JS,
    );
    return sourceFile.statements.flatMap((statement) => {
        if ((!ts.isImportDeclaration(statement) &&
            !ts.isExportDeclaration(statement)) ||
            !statement.moduleSpecifier ||
            !ts.isStringLiteral(statement.moduleSpecifier)) {
            return [];
        }
        return [{
            specifier: statement.moduleSpecifier.text,
            start: statement.moduleSpecifier.getStart(sourceFile),
            end: statement.moduleSpecifier.getEnd(),
        }];
    });
};

const rewriteStaticModuleSpecifiers = (source, filename, replacementFor) => {
    const replacements = staticModuleSpecifiers(source, filename)
        .map((entry) => ({
            ...entry,
            replacement: replacementFor(entry.specifier),
        }))
        .filter(({ replacement, specifier }) =>
            replacement !== undefined && replacement !== specifier)
        .sort((left, right) => right.start - left.start);
    let rewritten = source;
    for (const { start, end, replacement } of replacements) {
        rewritten = rewritten.slice(0, start) + JSON.stringify(replacement) +
            rewritten.slice(end);
    }
    return rewritten;
};

const resolveRelativeTypeScriptDependency = ({
    sourceRoot,
    importerPath,
    specifier,
}) => {
    const unresolvedPath = resolve(dirname(importerPath), specifier);
    if (!isInside(sourceRoot, unresolvedPath)) {
        throw new Error(
            `Cloud preview catalogue import escapes the allowed sky source root: ` +
            `${relative(sourceRoot, importerPath)} -> ${specifier}`,
        );
    }
    const candidates = specifier.endsWith(".ts")
        ? [unresolvedPath]
        : [
            `${unresolvedPath}.ts`,
            join(unresolvedPath, "index.ts"),
        ];
    const candidate = candidates.find(regularFile);
    if (!candidate) {
        throw new Error(
            `Unresolved relative TypeScript dependency in cloud preview catalogue: ` +
            `${relative(sourceRoot, importerPath)} -> ${specifier}`,
        );
    }
    const canonicalCandidate = realpathSync(candidate);
    if (!isInside(sourceRoot, canonicalCandidate)) {
        throw new Error(
            `Cloud preview catalogue import resolves outside the allowed sky source root: ` +
            `${relative(sourceRoot, importerPath)} -> ${specifier}`,
        );
    }
    return canonicalCandidate;
};

/**
 * Transpile the CPU catalogue's complete runtime dependency graph. Type-only
 * imports have already disappeared from each module's emitted JavaScript, so
 * browser/React/GPU modules are not pulled into this bounded loader.
 */
export const transpileCloudPreviewModuleClosure = ({
    sourceRoot: sourceRootInput,
    temporaryRoot,
    rootModuleNames = MODULE_NAMES,
}) => {
    const sourceRoot = realpathSync(resolve(sourceRootInput));
    const pending = rootModuleNames.map((name) => {
        const sourcePath = resolve(sourceRoot, `${name}.ts`);
        if (!isInside(sourceRoot, sourcePath) || !regularFile(sourcePath)) {
            throw new Error(`Invalid cloud preview catalogue root module: ${name}`);
        }
        const canonicalSourcePath = realpathSync(sourcePath);
        if (!isInside(sourceRoot, canonicalSourcePath)) {
            throw new Error(
                `Cloud preview catalogue root resolves outside the allowed ` +
                `sky source root: ${name}`,
            );
        }
        return canonicalSourcePath;
    });
    const transpiled = new Set();

    while (pending.length > 0) {
        const sourcePath = pending.shift();
        if (transpiled.has(sourcePath)) {
            continue;
        }
        const outputPath = emittedModulePath({
            sourceRoot,
            temporaryRoot,
            sourcePath,
        });
        const emittedSource = ts.transpileModule(
            readFileSync(sourcePath, "utf8"),
            TRANSPILE_OPTIONS,
        ).outputText;
        const rewrittenSource = rewriteStaticModuleSpecifiers(
            emittedSource,
            outputPath,
            (specifier) => {
                if (specifier === "suncalc") {
                    return relativeEsmSpecifier(
                        outputPath,
                        join(temporaryRoot, "suncalc.mjs"),
                    );
                }
                if (!specifier.startsWith(".")) {
                    throw new Error(
                        `Unsupported external import in cloud preview catalogue: ` +
                        `${relative(sourceRoot, sourcePath)} -> ${specifier}`,
                    );
                }
                const dependencyPath = resolveRelativeTypeScriptDependency({
                    sourceRoot,
                    importerPath: sourcePath,
                    specifier,
                });
                pending.push(dependencyPath);
                return relativeEsmSpecifier(
                    outputPath,
                    emittedModulePath({
                        sourceRoot,
                        temporaryRoot,
                        sourcePath: dependencyPath,
                    }),
                );
            },
        );
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, rewrittenSource);
        transpiled.add(sourcePath);
    }

    writeFileSync(
        join(temporaryRoot, "suncalc.mjs"),
        "export default { getPosition: () => ({ altitude: 0, azimuth: 0 }) };\n",
    );
    return [...transpiled]
        .map((sourcePath) => relative(sourceRoot, sourcePath).split(sep).join("/"))
        .sort();
};

/**
 * Load the renderer's authoritative lazy matrices without maintaining a
 * second hand-written case list. The CPU-only runtime graph is transpiled into
 * a disposable ESM directory; importing it performs no browser, image, or GPU
 * work.
 */
export const loadCloudPreviewScenarios = async ({
    repositoryRoot,
    productionPerspective = "oblique-natural",
}) => {
    const sourceRoot = resolve(repositoryRoot, "components/backgrounds/sky");
    const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-previews-"));
    try {
        transpileCloudPreviewModuleClosure({ sourceRoot, temporaryRoot });

        const catalogSourcePath = resolve(
            repositoryRoot,
            "app/cloud-preview-matrix/cloud-preview-catalog.ts",
        );
        const catalogOutputPath = join(temporaryRoot, "cloud-preview-catalog.mjs");
        const catalogOutput = ts.transpileModule(
            readFileSync(catalogSourcePath, "utf8"),
            TRANSPILE_OPTIONS,
        ).outputText;
        const rewrittenCatalogOutput = rewriteStaticModuleSpecifiers(
            catalogOutput,
            catalogOutputPath,
            (specifier) => {
                const skyAlias = "@/components/backgrounds/sky/";
                if (!specifier.startsWith(skyAlias)) {
                    throw new Error(
                        `Unsupported import in cloud preview catalogue entrypoint: ` +
                        specifier,
                    );
                }
                const moduleName = specifier.slice(skyAlias.length);
                const sourcePath = resolve(sourceRoot, `${moduleName}.ts`);
                if (!isInside(realpathSync(sourceRoot), sourcePath) ||
                    !regularFile(sourcePath)) {
                    throw new Error(
                        `Unresolved sky import in cloud preview catalogue entrypoint: ` +
                        specifier,
                    );
                }
                const canonicalSourcePath = realpathSync(sourcePath);
                if (!isInside(realpathSync(sourceRoot), canonicalSourcePath)) {
                    throw new Error(
                        `Sky import in cloud preview catalogue entrypoint ` +
                        `resolves outside the allowed source root: ${specifier}`,
                    );
                }
                return relativeEsmSpecifier(
                    catalogOutputPath,
                    emittedModulePath({
                        sourceRoot: realpathSync(sourceRoot),
                        temporaryRoot,
                        sourcePath: canonicalSourcePath,
                    }),
                );
            },
        );
        writeFileSync(catalogOutputPath, rewrittenCatalogOutput);

        const catalog = await import(pathToFileURL(catalogOutputPath).href);
        const scenarios = catalog.previewDefinitions(productionPerspective);
        const duplicateIds = scenarios.filter((scenario, index) =>
            scenarios.findIndex(({ id }) => id === scenario.id) !== index);
        if (duplicateIds.length > 0) {
            throw new Error(`Duplicate cloud preview ids: ${duplicateIds
                .map(({ id }) => id).join(", ")}`);
        }
        return scenarios;
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
};
