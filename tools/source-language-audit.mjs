#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const roots = ["src", "src-tauri/src"];
const extensions = new Set([".rs", ".ts", ".tsx"]);
const baselinePath = "tools/source-language-baseline.json";
const han = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const emoji = /\p{Emoji_Presentation}/u;

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

function decodeEscapes(value) {
  return value
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function maskRust(source) {
  const output = source.split("");
  let index = 0;
  const blank = (from, to) => {
    for (let cursor = from; cursor < to; cursor += 1) {
      if (output[cursor] !== "\n" && output[cursor] !== "\r") output[cursor] = " ";
    }
  };

  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      const stop = end < 0 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        if (source.startsWith("/*", cursor)) {
          depth += 1;
          cursor += 2;
        } else if (source.startsWith("*/", cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      blank(index, cursor);
      index = cursor;
      continue;
    }

    const character = /^(?:b)?'(?:\\.|\\u\{[0-9a-fA-F]+\}|[^'\\\r\n])'/.exec(
      source.slice(index),
    );
    if (character) {
      blank(index, index + character[0].length);
      index += character[0].length;
      continue;
    }

    const raw = /^(?:b?r)(#*)"/.exec(source.slice(index));
    if (raw) {
      const opener = raw[0].length;
      const closer = `"${raw[1]}`;
      const end = source.indexOf(closer, index + opener);
      const stop = end < 0 ? source.length : end + closer.length;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (source[index] === '"' || source.startsWith('b"', index)) {
      const start = source[index] === '"' ? index : index + 1;
      let cursor = start + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") cursor += 2;
        else if (source[cursor] === '"') {
          cursor += 1;
          break;
        } else {
          cursor += 1;
        }
      }
      blank(index, cursor);
      index = cursor;
      continue;
    }
    index += 1;
  }
  return output.join("");
}

function matchingBrace(masked, open) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === "{") depth += 1;
    else if (masked[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return masked.length - 1;
}

function rustTestRanges(text) {
  const masked = maskRust(text);
  const ranges = [];
  for (const marker of ["#[cfg(test)]", "#[test]"]) {
    let position = 0;
    while ((position = masked.indexOf(marker, position)) >= 0) {
      const open = masked.indexOf("{", position + marker.length);
      if (open < 0) break;
      ranges.push([position, matchingBrace(masked, open)]);
      position = open + 1;
    }
  }
  return ranges;
}

function productionLines(file, text) {
  if (!file.endsWith(".rs")) return text.split(/\r?\n/);
  const ranges = rustTestRanges(text);
  const output = [];
  let offset = 0;
  for (const line of text.split(/\r?\n/)) {
    const ignored = ranges.some(([start, end]) => offset >= start && offset <= end);
    output.push(ignored ? "" : decodeEscapes(line));
    offset += line.length + 1;
  }
  return output;
}

const update = process.argv.includes("--update");
const check = process.argv.includes("--check");
const details = process.argv.includes("--details");
const diffIndex = process.argv.indexOf("--check-diff");
const diffBase = diffIndex >= 0 ? process.argv[diffIndex + 1] : "";

const counts = {};
const matchedLines = {};
let total = 0;
let emojiCount = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const file of collect(root)) {
    const key = file.split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    if (details && process.argv.includes("--ranges") && key.endsWith(".rs")) {
      console.error(`${key}: ${JSON.stringify(rustTestRanges(text))}`);
    }
    const lines = productionLines(key, text);
    const count = lines.filter((line) => han.test(line)).length;
    if (
      !key.endsWith("src/editor/emoji.ts") &&
      !key.endsWith("src/editor/github-docs.ts")
    ) {
      emojiCount += lines.filter((line) => emoji.test(line)).length;
    }
    if (count === 0) continue;
    counts[key] = count;
    matchedLines[key] = lines
      .map((line, index) => (han.test(line) ? index + 1 : 0))
      .filter(Boolean);
    total += count;
  }
}

if (details) {
  for (const [file, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(
      `${String(count).padStart(5)} ${file}: ${matchedLines[file].join(", ")}`,
    );
  }
}

console.log(
  JSON.stringify({ files: Object.keys(counts).length, lines: total, emojiLines: emojiCount }),
);

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
  if (emojiCount > 0) {
    console.error(`Production source contains emoji on ${emojiCount} lines.`);
    process.exit(1);
  }
  console.log("No new Chinese source violations.");
}

if (diffBase) {
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", `${diffBase}...HEAD`, "--", ...roots],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
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
