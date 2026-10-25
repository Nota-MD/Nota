/** 主窗口只在编辑器可输入后显示。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【启动窗口可见性】");

testCase("主窗口先在屏幕外预热，且不占任务栏", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as {
    app: {
      windows: Array<{ label: string; visible?: boolean; skipTaskbar?: boolean; x?: number; y?: number }>;
    };
  };
  const main = config.app.windows.find((window) => window.label === "main");
  assertValue(main?.visible === true, "窗口必须在屏幕外保持可渲染");
  assertValue(main?.skipTaskbar === true, "预热时不能出现在任务栏");
  assertValue((main?.x ?? 0) < 0 && (main?.y ?? 0) < 0, "预热位置必须在屏幕外");
});

testCase("入口不再绘制 Nota 加载动画", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  assertValue(!html.includes('id="nota-boot"'), "仍有启动文字层");
  assertValue(!html.includes("html:not([data-booted]) #root"), "应用内容仍被启动层遮住");
});

testCase("编辑器聚焦后才宣告 ready", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/EditorPane.tsx"), "utf8");
  const focus = source.indexOf("handle.focusAtStart()");
  const ready = source.indexOf("markEditorReady()", focus);
  assertValue(focus >= 0, "缺少 focusAtStart");
  assertValue(ready > focus, "markEditorReady 必须排在聚焦之后");
});

testCase("揭幕动作是显示原生窗口，而不是播放网页动画", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useBootReveal.ts"), "utf8");
  assertValue(/api\.window\s*\.showMain\(\)/.test(source), "没有调用宿主显示窗口");
  assertValue(!source.includes("opacity"), "仍有网页透明度动画");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
