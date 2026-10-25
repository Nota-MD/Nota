/**
 * 界面临时文案的回归围栏。
 *
 * Emoji 数据本身是编辑器功能，不在这里限制；这里只检查进入 `t()` 的界面文案。
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

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

function assertValue(condition: boolean, description: string): void {
  if (!condition) throw new Error(description);
}

function columnOutput(itemRecord: string): string[] {
  return readdirSync(itemRecord, { withFileTypes: true }).flatMap((item5) => {
    const path = join(itemRecord, item5.name);
    if (item5.isDirectory()) return columnOutput(path);
    return [".ts", ".tsx"].includes(extname(item5.name)) ? [path] : [];
  });
}

const banEndOfMark = /[⚠️✅❌🚀✨🎉🔒📌💡👉👈]/u;
const banEndOfMouthLanguage = /别担心|不会丢|这就会|放心吧|搞定|一键|轻松|智能地|为你|帮你|亲爱的|哈喽|太棒了|超赞|完美|快来|点这里|注意啦/u;

console.log("\n【界面文案语体】");

testCase("t() 原文不含状态 emoji 和口语化用语", () => {
  for (const path of columnOutput(join(process.cwd(), "src"))) {
    const source3 = readFileSync(path, "utf8");
    for (const match2 of source3.matchAll(/\bt\(\s*"([^"\n]*)"/g)) {
      const copy2 = match2[1];
      assertValue(!banEndOfMark.test(copy2), `${relative(process.cwd(), path)}：${copy2}`);
      assertValue(!banEndOfMouthLanguage.test(copy2), `${relative(process.cwd(), path)}：${copy2}`);
    }
  }
});

testCase("中文界面译文不含状态 emoji", () => {
  for (const name3 of ["zh-ui.ts", "zh-settings.ts", "zh-runtime.ts"]) {
    const source3 = readFileSync(join(process.cwd(), "src", "i18n", name3), "utf8");
    for (const match2 of source3.matchAll(/:\s*"([^"\n]*)"/g)) {
      assertValue(!banEndOfMark.test(match2[1]), `${name3}：${match2[1]}`);
    }
  }
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
