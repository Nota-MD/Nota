#!/usr/bin/env node
/**
 * 从一组 Release 产物生成 latest.json。
 *
 * 用法：node tools/make-update-manifest.mjs <产物目录> [tag]
 *
 * 只收录当前版本的文件；包类型与架构由文件名判断。开发构建没有下载包，
 * 由宿主直接显示源码重建命令，因此不写进 packages。
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const dir = process.argv[2];
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = conf.version;
const tag = process.argv[3] ?? `v${version}`;
if (!dir) {
  console.error("usage: node tools/make-update-manifest.mjs <release-assets-dir> [tag]");
  process.exit(2);
}

// Actions 会保留 upload-artifact 里的 `bundle/deb` 等目录层级；这里必须递归，
// 否则解压后的产物明明存在，清单却会误报缺失。
const files = 找文件(dir)
  .filter((path) => basename(path).includes(version))
  .sort();

const packages = {};
for (const path of files) {
  const file = basename(path);
  const entry = classify(file);
  if (!entry) continue;
  const bytes = readFileSync(path);
  packages[`${entry.kind}-${entry.arch}`] = {
    url: `https://github.com/Nota-MD/Nota/releases/download/${tag}/${encodeURIComponent(file)}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    file,
  };
}

// A platform-local build may intentionally contain only the packages available
// on that host. Release CI still runs without this flag and requires every kind.
const requireAll = !process.argv.includes("--available-only");
if (requireAll) {
  for (const kind of ["deb", "rpm", "appimage", "exe", "exeinstall"]) {
    const key = `${kind}-x86_64`;
    if (!packages[key]) {
      console.error(`missing x86_64 ${kind} asset for ${version}`);
      process.exit(1);
    }
  }
}

const manifest = {
  schema: 1,
  version,
  release_url: `https://github.com/Nota-MD/Nota/releases/tag/${tag}`,
  notes:
    "Application updates are experimental. Windows support is new and has limited testing. Package selection follows the installation type and CPU architecture.",
  packages,
};

const out = join(dir, "latest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(out);

function classify(name) {
  if (/^Nota_.*_amd64\.deb$/.test(name)) return { kind: "deb", arch: "x86_64" };
  if (/^Nota_.*_arm64\.deb$/.test(name)) return { kind: "deb", arch: "aarch64" };
  if (/^Nota-.*\.x86_64\.rpm$/.test(name)) return { kind: "rpm", arch: "x86_64" };
  if (/^Nota-.*\.aarch64\.rpm$/.test(name)) return { kind: "rpm", arch: "aarch64" };
  if (/^Nota_.*_amd64\.AppImage$/.test(name)) return { kind: "appimage", arch: "x86_64" };
  if (/^Nota_.*_aarch64\.AppImage$/.test(name)) return { kind: "appimage", arch: "aarch64" };
  if (/^Nota_.*_x64-portable\.zip$/.test(name)) return { kind: "exe", arch: "x86_64" };
  if (/^Nota_.*_arm64-portable\.zip$/.test(name)) return { kind: "exe", arch: "aarch64" };
  if (/^Nota_.*_x64-setup\.exe$/.test(name)) return { kind: "exeinstall", arch: "x86_64" };
  if (/^Nota_.*_arm64-setup\.exe$/.test(name)) return { kind: "exeinstall", arch: "aarch64" };
  return null;
}

function 找文件(path) {
  const out = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) out.push(...找文件(child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}
