/**
 * 更新器契约：清单、安装类型、固定来源和前端入口必须一起存在。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let 过 = 0;
let 败 = 0;

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

function 读(...段: string[]): string {
  return readFileSync(join(...段), "utf8");
}

console.log("\n【更新器契约】");

测("应用清单覆盖五种安装包，开发构建走重建命令", () => {
  const manifest = JSON.parse(读("update", "latest.json")) as {
    schema: number;
    version: string;
    packages: Record<string, { url: string; sha256: string; file: string }>;
  };
  真(manifest.schema === 1, "schema 不是 1");
  真(manifest.version === "0.7.0-beta", "清单版本不是 0.7.0-beta");
  for (const kind of ["deb", "rpm", "appimage", "exe", "exeinstall"]) {
    真(manifest.packages[`${kind}-x86_64`], `缺少 ${kind}-x86_64`);
  }
  for (const [kind, asset] of Object.entries(manifest.packages)) {
    真(
      asset.url.startsWith("https://github.com/Nota-MD/Nota/releases/download/"),
      `${kind} 指向了非官方地址`,
    );
    真(asset.sha256.length > 0 && asset.file.length > 0, `${kind} 缺少摘要或文件名`);
  }
});

测("宿主固定清单地址且不信任前端 URL", () => {
  const source = 读("src-tauri", "src", "update.rs");
  真(
    source.includes("https://github.com/Nota-MD/Nota/releases/latest/download/latest.json"),
    "固定清单地址缺失",
  );
  真(source.includes("RELEASE_PREFIX"), "官方 Release 前缀围栏缺失");
  真(source.includes("Sha256::digest"), "SHA-256 校验缺失");
  const bridge = 读("src", "bridge", "ipc.ts");
  真(!bridge.includes('invoke<UpdateStatus>("nota_update_check", { url'), "前端仍可传 URL");
});

测("插件清单声明更新源且复用现有包校验", () => {
  const manifest = 读("src-tauri", "src", "plugin", "manifest.rs");
  const updater = 读("src-tauri", "src", "plugin", "updater.rs");
  真(manifest.includes("pub struct UpdateSpec"), "插件清单没有 [update] 结构");
  真(updater.includes("latest.json") || updater.includes("仓库"), "插件仓库解析缺失");
  真(updater.includes("Sha256::digest"), "插件包 SHA-256 缺失");
  真(updater.includes("host.装"), "插件更新没有复用原子安装流程");
  真(updater.includes("source.signer"), "缺少签名者连续性检查");
});

测("主题没有接入自动更新命令", () => {
  const bridge = 读("src", "bridge", "ipc.ts");
  const themeStart = bridge.indexOf("theme: {");
  const themeEnd = bridge.indexOf("uiStyle: {", themeStart);
  真(themeStart >= 0 && themeEnd > themeStart, "找不到主题 API 段");
  真(!bridge.slice(themeStart, themeEnd).includes("update"), "主题 API 出现了更新入口");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
