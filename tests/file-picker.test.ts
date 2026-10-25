/** 自绘文件选择器：路径算法与“不再调用原生对话框”的契约。 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  joinPath,
  matchesFileFilters,
  parentPath,
  pathBase,
  pathDirectory,
  resolveSavePath,
} from "../src/ui/file-picker";

let pass = 0;
let fail = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

console.log("\n【自绘文件选择器】");

testCase("Unix 与 Windows 路径拆分", () => {
  assertValue(pathDirectory("/home/me/a.md") === "/home/me", "Unix 目录");
  assertValue(pathBase("/home/me/a.md") === "a.md", "Unix 文件名");
  assertValue(pathDirectory("C:\\Users\\me\\a.md") === "C:\\Users\\me", "Windows 目录");
  assertValue(pathBase("C:\\Users\\me\\a.md") === "a.md", "Windows 文件名");
  assertValue(pathDirectory("name.md") === "", "相对文件名没有目录");
  assertValue(pathDirectory("C:\\a.md") === "C:\\", "盘符根目录保留反斜杠");
  assertValue(pathDirectory("C:\\") === "C:\\", "盘符根目录不被截断");
  assertValue(pathDirectory("\\\\server\\share\\a.md") === "\\\\server\\share", "UNC 路径目录");
});

testCase("路径拼接与上一级", () => {
  assertValue(joinPath("/home/me", "a.md") === "/home/me/a.md", "Unix 拼接");
  assertValue(joinPath("C:\\Users\\me", "a.md") === "C:\\Users\\me\\a.md", "Windows 拼接");
  assertValue(parentPath("/home/me/a.md") === "/home/me", "上一级");
  assertValue(parentPath("/") === null, "根没有上一级");
  assertValue(parentPath("C:\\a.md") === "C:\\", "盘符根目录可以作为上一级");
  assertValue(parentPath("name.md") === null, "相对文件名没有上一级");
});

testCase("筛选与保存后缀", () => {
  const markdown = [{ name: "Markdown", extensions: ["md", "markdown"] }];
  assertValue(matchesFileFilters("a.MD", markdown), "后缀大小写无关");
  assertValue(!matchesFileFilters("a.txt", markdown), "不匹配的扩展名被滤掉");
  assertValue(resolveSavePath("/tmp", "note", markdown) === "/tmp/note.md", "补第一个后缀");
  assertValue(resolveSavePath("/tmp", "note.markdown", markdown) === "/tmp/note.markdown", "已有后缀不重复补");
  assertValue(
    resolveSavePath("/tmp", "backup", [
      { name: "Settings", extensions: ["nota-backup", "zip"] },
    ]) === "/tmp/backup.nota-backup",
    "多后缀筛选补第一个具体后缀",
  );
});

testCase("前端源码不再直接引用原生 dialog 插件", () => {
  const root = join("src");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = readFileSync(path, "utf8");
        assertValue(!text.includes('from "@tauri-apps/plugin-dialog"'), `${path} 仍引用原生文件对话框`);
      }
    }
  }
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assertValue(
    !packageJson.dependencies?.["@tauri-apps/plugin-dialog"] &&
      !packageJson.devDependencies?.["@tauri-apps/plugin-dialog"],
    "package.json 仍依赖原生文件对话框",
  );
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
  assertValue(!cargo.includes("tauri-plugin-dialog"), "Cargo.toml 仍依赖原生文件对话框");
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  assertValue(!lib.includes("tauri_plugin_dialog"), "宿主仍注册原生文件对话框");
  const capability = readFileSync("src-tauri/capabilities/default.json", "utf8");
  assertValue(!capability.includes("dialog:"), "能力清单仍放行原生文件对话框");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
