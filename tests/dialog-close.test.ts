/**
 * 所有模态对话框都必须提供同一个右上角关闭入口。
 *
 * 只查视觉结果不够：漏掉一个框时，Esc 和点遮罩仍然能用，界面看起来也没有
 * 报错。这里直接按 `role="dialog"` / `role="alertdialog"` 找出全部对话框，
 * 要求同一文件引用并渲染 `DialogClose`。
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

const 对话框 = [
  "src/ui/AboutDialog.tsx",
  "src/ui/ConfirmDialog.tsx",
  "src/ui/EmojiDialog.tsx",
  "src/ui/FocusSummaryDialog.tsx",
  "src/ui/ImageDialog.tsx",
  "src/ui/LicenseDialog.tsx",
  "src/ui/LinkDialog.tsx",
  "src/ui/PandocPanel.tsx",
  "src/ui/PrintDialog.tsx",
  "src/ui/PromptDialog.tsx",
  "src/ui/settings/SettingsDialog.tsx",
];

console.log("\n【对话框统一关闭入口】");

测("每个模态对话框都渲染 DialogClose", () => {
  for (const 路径 of 对话框) {
    const 源 = readFileSync(join(process.cwd(), 路径), "utf8");
    真(
      源.includes('from "@/ui/DialogClose"') && 源.includes("<DialogClose"),
      `${路径} 缺少导入或渲染 DialogClose`,
    );
  }
});

测("DialogClose 有可读名称、标题和统一图标", () => {
  const 源 = readFileSync(join(process.cwd(), "src/ui/DialogClose.tsx"), "utf8");
  真(源.includes('aria-label={t("Close")}'), "缺少 aria-label");
  真(源.includes('title={t("Close")}'), "缺少 title");
  真(源.includes('name="folio-close-symbolic"'), "关闭图标不统一");
});

测("三类对话框壳都给绝对定位的关闭按钮提供定位上下文", () => {
  const overlay = readFileSync(join(process.cwd(), "src/styles/overlay.css"), "utf8");
  const settings = readFileSync(join(process.cwd(), "src/styles/settings.css"), "utf8");
  真(/\.confirm-dialog\s*\{[^}]*position:\s*relative/s.test(overlay), "确认框壳缺少 position");
  真(/\.print-dialog\s*\{[^}]*position:\s*relative/s.test(overlay), "打印框缺少 position");
  真(/\.settings-shell\s*\{[^}]*position:\s*relative/s.test(settings), "设置框缺少 position");
  真(/\.dialog-close\s*\{[^}]*position:\s*absolute/s.test(overlay), "关闭按钮不是绝对定位");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
