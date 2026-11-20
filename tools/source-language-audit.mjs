#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const roots = ["src", "src-tauri/src"];
const extensions = new Set([".rs", ".ts", ".tsx"]);
const baselinePath = "tools/source-language-baseline.json";
const han = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

function excluded(file) {
  const normalized = file.split(path.sep).join("/");
  return (
    /^src\/i18n\/zh(?:-|\.)/.test(normalized) ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith("/tests.rs") ||
    normalized.endsWith("_tests.rs")
  );
}

function collect(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file, files);
    else if (extensions.has(path.extname(entry.name)) && !excluded(file)) {
      files.push(file);
    }
  }
  return files;
}

const counts = {};
let total = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const file of collect(root)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const count = lines.filter((line) => han.test(line)).length;
    if (count === 0) continue;
    const key = file.split(path.sep).join("/");
    counts[key] = count;
    total += count;
  }
}

const update = process.argv.includes("--update");
const check = process.argv.includes("--check");
const details = process.argv.includes("--details");
const diffIndex = process.argv.indexOf("--check-diff");
const diffBase = diffIndex >= 0 ? process.argv[diffIndex + 1] : "";

if (details) {
  for (const [file, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(5)} ${file}`);
  }
}

console.log(JSON.stringify({ files: Object.keys(counts).length, lines: total }));

if (update) {
  fs.writeFileSync(baselinePath, `${JSON.stringify({ total, files: counts }, null, 2)}\n`);
  console.log(`Updated ${baselinePath}`);
}

if (check) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const regressions = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline.files?.[file] ?? 0;
    if (count > allowed) regressions.push(`${file}: ${allowed} -> ${count}`);
  }
  if (total > (baseline.total ?? 0) && regressions.length === 0) {
    regressions.push(`total: ${baseline.total ?? 0} -> ${total}`);
  }
  if (regressions.length) {
    console.error("New Chinese source violations:");
    for (const item of regressions) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log("No new Chinese source violations.");
}

if (diffBase) {
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", `${diffBase}...HEAD`, "--", ...roots],
    { encoding: "utf8" },
  );
  let file = "";
  const added = [];
  const removedSequences = new Map();
  const sequence = (line) => line.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/gu)?.join("") ?? "";
  const isSubsequence = (candidate, previous) => {
    let index = 0;
    for (const character of previous) {
      if (character === candidate[index]) index += 1;
      if (index === candidate.length) return true;
    }
    return candidate.length === 0;
  };
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      const sequences = removedSequences.get(file) ?? [];
      sequences.push(sequence(line.slice(1)));
      removedSequences.set(file, sequences);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (excluded(file)) continue;
    if (!han.test(line.slice(1))) continue;
    const current = sequence(line.slice(1));
    const sequences = removedSequences.get(file) ?? [];
    const match = sequences.findIndex((previous) => isSubsequence(current, previous));
    if (match >= 0) sequences.splice(match, 1);
    else added.push(`${file}: ${line.slice(1).trim()}`);
  }
  if (added.length) {
    console.error("Chinese source added in this change:");
    for (const item of added) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log("Diff contains no added Chinese source.");
}
