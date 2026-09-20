import assert from "node:assert/strict";
import ts from "typescript";

// Numerical adapter for the straight-line scalar/vector GLSL used by the
// species fields. It does not validate GLSL identifiers, typing, precision,
// GPU texture behavior or visual appearance; production GPU compilation and
// rendered review are separate acceptance gates.
const componentwise = (operation, ...values) => {
    const vector = values.find(Array.isArray);
    return vector ? vector.map((_, index) => operation(...values.map((value) =>
        Array.isArray(value) ? value[index] : value))) : operation(...values);
};
const vector = (size, values) => {
    const flat = values.flat();
    return flat.length === 1 ? Array(size).fill(flat[0]) : flat.slice(0, size);
};
const saturate = (value) => Math.min(1, Math.max(0, value));
const operations = {
    "+": (a, b) => a + b, "-": (a, b) => a - b,
    "*": (a, b) => a * b, "/": (a, b) => a / b,
};
const arithmetic = new Map([
    [ts.SyntaxKind.PlusToken, "+"], [ts.SyntaxKind.MinusToken, "-"],
    [ts.SyntaxKind.AsteriskToken, "*"], [ts.SyntaxKind.SlashToken, "/"],
]);
const runtime = {
    binary: (operator, left, right) => componentwise(operations[operator], left, right),
    swizzle: (value, channels) => {
        const selected = [...channels].map((channel) => value[
            "xyzw".includes(channel) ? "xyzw".indexOf(channel) : "rgba".indexOf(channel)]);
        return selected.length === 1 ? selected[0] : selected;
    },
    vec2: (...values) => vector(2, values),
    vec3: (...values) => vector(3, values),
    vec4: (...values) => vector(4, values),
    abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt,
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    mix: (low, high, amount) => componentwise((a, b, t) => a + (b - a) * t,
        low, high, amount),
    normalize: (value) => value.map((channel) => channel / Math.hypot(...value)),
    length: (value) => Math.hypot(...value),
    dot: (a, b) => a.reduce((sum, channel, index) => sum + channel * b[index], 0),
    saturate,
    smoother: (low, high, value) => {
        const t = saturate((value - low) / Math.max(0.0001, high - low));
        return t ** 3 * (t * (t * 6 - 15) + 10);
    },
    u_cloud_base: "base", u_cloud_detail: "detail",
};

export const createWebGlFieldEvaluator = (source, entryPoint) => {
    assert.match(entryPoint, /^[a-z_][a-z_0-9]*$/i);
    const executable = source
        .replace(/\b(?:float|vec[234])\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
            (_, name, parameters) => `function ${name}(${parameters.replace(
                /\b(?:float|vec[234]|CloudLayer)\s+/g, "")}) {`)
        .replace(/\b(?:float|vec[234])\s+(\w+)\s*=/g, "let $1 =");
    const emitted = ts.transpileModule(executable, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
        transformers: { before: [(context) => {
            const visit = (node) => {
                if (ts.isBinaryExpression(node) && arithmetic.has(node.operatorToken.kind)) {
                    return ts.factory.createCallExpression(ts.factory.createIdentifier("binary"),
                        undefined, [ts.factory.createStringLiteral(arithmetic.get(node.operatorToken.kind)),
                            ts.visitNode(node.left, visit), ts.visitNode(node.right, visit)]);
                }
                if (ts.isPropertyAccessExpression(node) && /^[xyzwrgba]{1,4}$/.test(node.name.text)) {
                    return ts.factory.createCallExpression(ts.factory.createIdentifier("swizzle"),
                        undefined, [ts.visitNode(node.expression, visit),
                            ts.factory.createStringLiteral(node.name.text)]);
                }
                return ts.visitEachChild(node, visit, context);
            };
            return (source) => ts.visitNode(source, visit);
        }] },
        reportDiagnostics: true,
    });
    assert.deepEqual(emitted.diagnostics, [], "the field must remain inside the numerical GLSL subset");
    return (bindings) => {
        const scope = { ...runtime, ...bindings };
        return new Function(...Object.keys(scope),
            `${emitted.outputText}\nreturn ${entryPoint};`)(...Object.values(scope));
    };
};
