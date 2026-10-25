/**
 * 所有模态对话框都必须提供同一个右上角关闭入口。
 *
 * 只查视觉结果不够：漏掉一个框时，Esc 和点遮罩仍然能用，界面看起来也没有
 * 报错。这里直接按 `role="dialog"` / `role="alertdialog"` 找出全部对话框，
 * 要求同一文件引用并渲染 `DialogClose`。
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

const dialog = [
  "src/ui/AboutDialog.tsx",
  "src/ui/ConfirmDialog.tsx",
  "src/ui/EmojiDialog.tsx",
  "src/ui/FilePickerDialog.tsx",
  "src/ui/FocusSummaryDialog.tsx",
  "src/ui/ImageDialog.tsx",
  "src/ui/LicenseDialog.tsx",
  "src/ui/LinkDialog.tsx",
  "src/ui/PandocPanel.tsx",
  "src/ui/PrintDialog.tsx",
  "src/ui/PromptDialog.tsx",
  "src/ui/settings/SettingsDialog.tsx",
  "src/ui/settings/SettingsExportDialog.tsx",
];

console.log("\n【对话框统一关闭入口】");

testCase("每个模态对话框都渲染 DialogClose", () => {
  for (const path of dialog) {
    const source3 = readFileSync(join(process.cwd(), path), "utf8");
    assertValue(
      source3.includes('from "@/ui/DialogClose"') && source3.includes("<DialogClose"),
      `${path} 缺少导入或渲染 DialogClose`,
    );
  }
});

testCase("DialogClose 有可读名称、标题和统一图标", () => {
  const source3 = readFileSync(join(process.cwd(), "src/ui/DialogClose.tsx"), "utf8");
  assertValue(source3.includes('aria-label={t("Close")}'), "缺少 aria-label");
  assertValue(source3.includes('title={t("Close")}'), "缺少 title");
  assertValue(source3.includes('name="folio-close-symbolic"'), "关闭图标不统一");
  assertValue(source3.includes("size={16}"), "关闭图标没有使用官方 16px 尺寸");
});

testCase("独立对话框壳都给绝对定位的关闭按钮提供定位上下文", () => {
  const overlay = readFileSync(join(process.cwd(), "src/styles/overlay.css"), "utf8");
  const print = readFileSync(join(process.cwd(), "src/styles/print-dialog.css"), "utf8");
  const picker = readFileSync(join(process.cwd(), "src/styles/file-picker.css"), "utf8");
  const settings = readFileSync(join(process.cwd(), "src/styles/settings.css"), "utf8");
  assertValue(/\.confirm-dialog\s*\{[^}]*position:\s*relative/s.test(overlay), "确认框壳缺少 position");
  assertValue(/\.print-dialog\s*\{[^}]*position:\s*relative/s.test(print), "打印框缺少 position");
  assertValue(/\.file-picker\s*\{[^}]*position:\s*relative/s.test(picker), "文件选择器缺少 position");
  assertValue(/\.settings-shell\s*\{[^}]*position:\s*relative/s.test(settings), "设置框缺少 position");
  assertValue(/\.dialog-close\s*\{[^}]*position:\s*absolute/s.test(overlay), "关闭按钮不是绝对定位");
  assertValue(/\.dialog-close\s*\{[^}]*width:\s*32px/s.test(overlay), "关闭按钮点击区不是 32px");
  assertValue(/\.dialog-close:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s.test(overlay), "关闭按钮缺少统一焦点环");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
