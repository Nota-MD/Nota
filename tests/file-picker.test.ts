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

let 过 = 0;
let 败 = 0;

function 测(名: string, 体: () => void): void {
  try {
    体();
    过 += 1;
    console.log(`  ✔ ${名}`);
  } catch (error) {
    败 += 1;
    console.log(`  ✘ ${名}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

console.log("\n【自绘文件选择器】");

测("Unix 与 Windows 路径拆分", () => {
  真(pathDirectory("/home/me/a.md") === "/home/me", "Unix 目录");
  真(pathBase("/home/me/a.md") === "a.md", "Unix 文件名");
  真(pathDirectory("C:\\Users\\me\\a.md") === "C:\\Users\\me", "Windows 目录");
  真(pathBase("C:\\Users\\me\\a.md") === "a.md", "Windows 文件名");
  真(pathDirectory("name.md") === "", "相对文件名没有目录");
  真(pathDirectory("C:\\a.md") === "C:\\", "盘符根目录保留反斜杠");
  真(pathDirectory("C:\\") === "C:\\", "盘符根目录不被截断");
  真(pathDirectory("\\\\server\\share\\a.md") === "\\\\server\\share", "UNC 路径目录");
});

测("路径拼接与上一级", () => {
  真(joinPath("/home/me", "a.md") === "/home/me/a.md", "Unix 拼接");
  真(joinPath("C:\\Users\\me", "a.md") === "C:\\Users\\me\\a.md", "Windows 拼接");
  真(parentPath("/home/me/a.md") === "/home/me", "上一级");
  真(parentPath("/") === null, "根没有上一级");
  真(parentPath("C:\\a.md") === "C:\\", "盘符根目录可以作为上一级");
  真(parentPath("name.md") === null, "相对文件名没有上一级");
});

测("筛选与保存后缀", () => {
  const markdown = [{ name: "Markdown", extensions: ["md", "markdown"] }];
  真(matchesFileFilters("a.MD", markdown), "后缀大小写无关");
  真(!matchesFileFilters("a.txt", markdown), "不匹配的扩展名被滤掉");
  真(resolveSavePath("/tmp", "note", markdown) === "/tmp/note.md", "补第一个后缀");
  真(resolveSavePath("/tmp", "note.markdown", markdown) === "/tmp/note.markdown", "已有后缀不重复补");
  真(
    resolveSavePath("/tmp", "backup", [
      { name: "Settings", extensions: ["nota-backup", "zip"] },
    ]) === "/tmp/backup.nota-backup",
    "多后缀筛选补第一个具体后缀",
  );
});

测("前端源码不再直接引用原生 dialog 插件", () => {
  const root = join("src");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = readFileSync(path, "utf8");
        真(!text.includes('from "@tauri-apps/plugin-dialog"'), `${path} 仍引用原生文件对话框`);
      }
    }
  }
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  真(
    !packageJson.dependencies?.["@tauri-apps/plugin-dialog"] &&
      !packageJson.devDependencies?.["@tauri-apps/plugin-dialog"],
    "package.json 仍依赖原生文件对话框",
  );
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
  真(!cargo.includes("tauri-plugin-dialog"), "Cargo.toml 仍依赖原生文件对话框");
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  真(!lib.includes("tauri_plugin_dialog"), "宿主仍注册原生文件对话框");
  const capability = readFileSync("src-tauri/capabilities/default.json", "utf8");
  真(!capability.includes("dialog:"), "能力清单仍放行原生文件对话框");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
