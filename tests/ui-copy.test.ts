/**
 * 界面临时文案的回归围栏。
 *
 * Emoji 数据本身是编辑器功能，不在这里限制；这里只检查进入 `t()` 的界面文案。
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

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

function 真(条件: boolean, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 列出(目录: string): string[] {
  return readdirSync(目录, { withFileTypes: true }).flatMap((项) => {
    const 路径 = join(目录, 项.name);
    if (项.isDirectory()) return 列出(路径);
    return [".ts", ".tsx"].includes(extname(项.name)) ? [路径] : [];
  });
}

const 禁止的标记 = /[⚠️✅❌🚀✨🎉🔒📌💡👉👈]/u;
const 禁止的口语 = /别担心|不会丢|这就会|放心吧|搞定|一键|轻松|智能地|为你|帮你|亲爱的|哈喽|太棒了|超赞|完美|快来|点这里|注意啦/u;

console.log("\n【界面文案语体】");

测("t() 原文不含状态 emoji 和口语化用语", () => {
  for (const 路径 of 列出(join(process.cwd(), "src"))) {
    const 源 = readFileSync(路径, "utf8");
    for (const 匹配 of 源.matchAll(/\bt\(\s*"([^"\n]*)"/g)) {
      const 文案 = 匹配[1];
      真(!禁止的标记.test(文案), `${relative(process.cwd(), 路径)}：${文案}`);
      真(!禁止的口语.test(文案), `${relative(process.cwd(), 路径)}：${文案}`);
    }
  }
});

测("中文界面译文不含状态 emoji", () => {
  for (const 名 of ["zh-ui.ts", "zh-settings.ts", "zh-runtime.ts"]) {
    const 源 = readFileSync(join(process.cwd(), "src", "i18n", 名), "utf8");
    for (const 匹配 of 源.matchAll(/:\s*"([^"\n]*)"/g)) {
      真(!禁止的标记.test(匹配[1]), `${名}：${匹配[1]}`);
    }
  }
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
