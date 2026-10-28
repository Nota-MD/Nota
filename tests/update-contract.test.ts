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
    manifest.release_url.endsWith(`/v${manifest.version}`),
    `清单版本 ${manifest.version} 与 release_url 不一致；当前包版本为 ${currentVersionLocal}`,
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

testCase("应用更新可终止，并在安装后自动重启", () => {
  const source = read("src-tauri", "src", "update.rs");
  const commands = read("src-tauri", "src", "commands", "update.rs");
  const bridge = read("src", "bridge", "ipc.ts");
  const pane = read("src", "ui", "SoftwareUpdatePane.tsx");
  const remote = read("src-tauri", "src", "remote.rs");
  assertValue(remote.includes("取_带进度_可取消"), "下载循环没有取消检查");
  assertValue(commands.includes("nota_update_cancel"), "缺少取消命令");
  assertValue(bridge.includes('cancel: () => invoke<void>("nota_update_cancel")'), "前端取消桥缺失");
  assertValue(pane.includes('t("Cancel Download")'), "更新页没有终止下载按钮");
  assertValue(pane.includes("getCurrentWindow().close()"), "安装后没有自动关闭重启路径");
  assertValue(source.includes("' /UPDATE'") || source.includes("'/UPDATE'"), "Windows 安装器未使用 UPDATE 模式");
  assertValue(source.includes("'/R'"), "Windows 安装器安装后不会自动重启");
  assertValue(source.includes("while kill -0"), "Linux 包更新没有等待旧进程退出");
  assertValue(source.includes("nohup"), "Linux 包更新没有重新启动应用");
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

testCase("Release 资产按平台分组，latest.json 最后上传", () => {
  const workflow = read(".github", "workflows", "release.yml");
  const order = read("tools", "order-release-assets.sh");
  assertValue(workflow.includes("order-release-assets.sh"), "Release 工作流没有调用排序脚本");
  const win = order.indexOf('upload_group "${win_x64[@]}"');
  const linux = order.indexOf('upload_group "${linux_x64[@]}"');
  const winArm = order.indexOf('upload_group "${win_arm64[@]}"');
  const linuxArm = order.indexOf('upload_group "${linux_arm64[@]}"');
  const latest = order.lastIndexOf('upload_group "$dir/latest.json"');
  assertValue(win >= 0 && win < linux && linux < winArm && winArm < linuxArm && linuxArm < latest, "平台上传顺序不正确");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
