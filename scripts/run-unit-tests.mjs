import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tests = readdirSync(import.meta.dirname)
    .filter((name) => /^test-.*\.mjs$/.test(name))
    .filter((name) => name !== "test-cloud-previews-black-box.mjs")
    .sort()
    .map((name) => join("scripts", name));

const result = spawnSync(process.execPath, ["--test", ...tests], {
    cwd: root,
    stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
