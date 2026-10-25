/**
 * 更新器契约：清单、安装类型、固定来源和前端入口必须一起存在。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

console.log("\n【更新器契约】");

testCase("应用清单覆盖五种安装包，开发构建走重建命令", () => {
  const manifest = JSON.parse(read("update", "latest.json")) as {
    schema: number;
    version: string;
    packages: Record<string, { url: string; sha256: string; file: string }>;
   };
  const currentVersionLocal = (
    JSON.parse(read("src-tauri", "tauri.conf.json")) as { version: string }
  ).version;
  assertValue(manifest.schema === 1, "schema 不是 1");
  assertValue(
    manifest.version === currentVersionLocal,
    `清单版本 ${manifest.version} 与当前包版本 ${currentVersionLocal} 不一致`,
  );
  for (const kind of ["deb", "rpm", "appimage", "exe", "exeinstall"]) {
    assertValue(manifest.packages[`${kind}-x86_64`], `缺少 ${kind}-x86_64`);
  }
  for (const [kind, asset] of Object.entries(manifest.packages)) {
    assertValue(
      asset.url.startsWith("https://github.com/Nota-MD/Nota/releases/download/"),
      `${kind} 指向了非官方地址`,
    );
    assertValue(asset.sha256.length > 0 && asset.file.length > 0, `${kind} 缺少摘要或文件名`);
  }
});

testCase("宿主固定清单地址且不信任前端 URL", () => {
  const source = read("src-tauri", "src", "update.rs");
  assertValue(
    source.includes("https://github.com/Nota-MD/Nota/releases/latest/download/latest.json"),
    "固定清单地址缺失",
  );
  assertValue(source.includes("RELEASE_PREFIX"), "官方 Release 前缀围栏缺失");
  assertValue(source.includes("Sha256::digest"), "SHA-256 校验缺失");
  const bridge = read("src", "bridge", "ipc.ts");
  assertValue(!bridge.includes('invoke<UpdateStatus>("nota_update_check", { url'), "前端仍可传 URL");
});

testCase("插件清单声明更新源且复用现有包校验", () => {
  const manifest = read("src-tauri", "src", "plugin", "manifest.rs");
  const updater = read("src-tauri", "src", "plugin", "updater.rs");
  assertValue(manifest.includes("pub struct UpdateSpec"), "插件清单没有 [update] 结构");
  assertValue(updater.includes("latest.json") || updater.includes("仓库"), "插件仓库解析缺失");
  assertValue(updater.includes("Sha256::digest"), "插件包 SHA-256 缺失");
  assertValue(updater.includes("host.装"), "插件更新没有复用原子安装流程");
  assertValue(updater.includes("source.signer"), "缺少签名者连续性检查");
});

testCase("主题没有接入自动更新命令", () => {
  const bridge = read("src", "bridge", "ipc.ts");
  const themeStart = bridge.indexOf("theme: {");
  const themeEnd = bridge.indexOf("uiStyle: {", themeStart);
  assertValue(themeStart >= 0 && themeEnd > themeStart, "找不到主题 API 段");
  assertValue(!bridge.slice(themeStart, themeEnd).includes("update"), "主题 API 出现了更新入口");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
