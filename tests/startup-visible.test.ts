/** 主窗口只在编辑器可输入后显示。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let 过 = 0;
let 败 = 0;

function 测(name: string, body: () => void): void {
  try {
    body();
    过 += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    败 += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function 真(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【启动窗口可见性】");

测("主窗口先在屏幕外预热，且不占任务栏", () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as {
    app: {
      windows: Array<{ label: string; visible?: boolean; skipTaskbar?: boolean; x?: number; y?: number }>;
    };
  };
  const main = config.app.windows.find((window) => window.label === "main");
  真(main?.visible === true, "窗口必须在屏幕外保持可渲染");
  真(main?.skipTaskbar === true, "预热时不能出现在任务栏");
  真((main?.x ?? 0) < 0 && (main?.y ?? 0) < 0, "预热位置必须在屏幕外");
});

测("入口不再绘制 Nota 加载动画", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  真(!html.includes('id="nota-boot"'), "仍有启动文字层");
  真(!html.includes("html:not([data-booted]) #root"), "应用内容仍被启动层遮住");
});

测("编辑器聚焦后才宣告 ready", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/EditorPane.tsx"), "utf8");
  const focus = source.indexOf("handle.focusAtStart()");
  const ready = source.indexOf("markEditorReady()", focus);
  真(focus >= 0, "缺少 focusAtStart");
  真(ready > focus, "markEditorReady 必须排在聚焦之后");
});

测("揭幕动作是显示原生窗口，而不是播放网页动画", () => {
  const source = readFileSync(join(process.cwd(), "src/ui/useBootReveal.ts"), "utf8");
  真(/api\.window\s*\.showMain\(\)/.test(source), "没有调用宿主显示窗口");
  真(!source.includes("opacity"), "仍有网页透明度动画");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
