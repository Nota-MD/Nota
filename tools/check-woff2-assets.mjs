import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = "dist/assets";
const entries = await readdir(root, { withFileTypes: true });
const legacy = entries
  .filter((entry) => entry.isFile() && [".ttf", ".otf", ".woff"].includes(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name);
if (legacy.length) {
  throw new Error(`legacy font assets remain in dist: ${legacy.join(", ")}`);
}

for (const entry of entries) {
  if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".css") continue;
  const css = await readFile(join(root, entry.name), "utf8");
  const legacyReference = css.match(/url\([^)]*\.(?:ttf|otf|woff)(?:[?#][^)]*)?\)/i);
  if (legacyReference) {
    throw new Error(`legacy font reference remains in ${entry.name}: ${legacyReference[0]}`);
  }
}

console.log("WOFF2 font assets: OK");
