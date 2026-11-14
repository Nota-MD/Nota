/** Linux secondary dialogs must be owned by XDG Desktop Portal, not GTK3. */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertion(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const read = (path: string) => readFileSync(path, "utf8");
const cargo = read("src-tauri/Cargo.toml");
const dialog = read("src-tauri/src/commands/native_dialog.rs");
const print = read("src-tauri/src/pdf_print.rs");

console.log("\n【Linux 次级窗口使用 GTK4 Portal】");

testCase("Linux 文件选择器直接调用 XDG Desktop Portal", () => {
  const linux = dialog.slice(dialog.indexOf("async fn portal_dialog"));
  assertion(linux.includes("SelectedFiles::open_file()"), "打开文件没有走文件门户");
  assertion(linux.includes("SelectedFiles::save_file()"), "保存文件没有走文件门户");
  assertion(linux.includes(".directory(request.mode == \"directory\")"), "目录选择没有走文件门户");
  assertion(!linux.includes("rfd::"), "Linux 仍会进入 rfd");
  assertion(!linux.includes("zenity"), "Linux 仍保留 zenity 回退");
});

testCase("rfd 不再编入 Linux 主程序", () => {
  const general = cargo.slice(0, cargo.indexOf("[target.'cfg(target_os = \"linux\")'.dependencies]"));
  assertion(!/^rfd\s*=/m.test(general), "rfd 仍是无条件依赖");
  const nonLinux = cargo.slice(
    cargo.indexOf("[target.'cfg(not(target_os = \"linux\"))'.dependencies]"),
  );
  assertion(/^rfd\s*=/m.test(nonLinux), "非 Linux 原生选择器依赖缺失");
});

testCase("打印对话框只走 Portal，不再回退 GTK3", () => {
  const face = print.slice(
    print.indexOf("pub fn print_html_dialog_with"),
    print.indexOf("#[cfg(target_os = \"linux\")]\nmod linux"),
  );
  assertion(face.includes("linux::印刷"), "缺少无可见窗口的 PDF 生成兜底");
  assertion(face.includes("linux::portal_print"), "打印框没有调用 XDG Portal");
  assertion(!face.includes("linux::对话框"), "打印框仍回退 GTK3");
  assertion(!print.includes(".run_dialog("), "仍保留 WebKitGTK GTK3 打印框");
});

testCase("打印 Portal 传入 PDF 文件描述符", () => {
  const portal = print.slice(
    print.indexOf("pub(super) fn portal_print"),
    print.indexOf("const PRINTER"),
  );
  assertion(portal.includes("PrintProxy::new()"), "没有连接打印门户");
  assertion(portal.includes("prepare_print"), "没有打开系统打印对话框");
  assertion(portal.includes("file.as_fd()"), "没有把 PDF 交给打印门户");
});

testCase("正式的 Linux 次级窗口优先启动 GTK4 helper", () => {
  const bridge = read("src-tauri/src/gtk4_dialogs.rs");
  const helper = read("src-tauri/src/bin/nota-gtk4-dialogs.rs");
  assertion(bridge.includes("nota-gtk4-dialogs"), "没有 helper 路径");
  assertion(helper.includes("gtk::FileDialog::new()"), "文件框不是 GTK4 FileDialog");
  assertion(helper.includes("gtk::PrintDialog::new()"), "打印框不是 GTK4 PrintDialog");
  assertion(dialog.includes("crate::gtk4_dialogs::file_dialog"), "文件框没有优先使用 GTK4 helper");
  assertion(print.includes("crate::gtk4_dialogs::print_pdf"), "打印框没有优先使用 GTK4 helper");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
