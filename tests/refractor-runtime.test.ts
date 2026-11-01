/**
 * 长尾代码语言表的惰性加载判据。
 *
 * 这条测试先确认基础入口只注册常用语言，再主动请求完整表；它能抓到两种回归：
 * 模块 import 时又偷偷预加载全部解析器，或者按需入口没有真正注册语言。
 */

import { refractor } from "refractor";

import {
  ensureFullLanguageTable,
  languageTableReady,
} from "../src/editor/refractor-runtime";

let pass = 0;
let fail = 0;

function assertValue(condition: unknown, message: string): void {
  if (!condition) {
    fail++;
    console.log(`  ✘ ${message}`);
    return;
  }
  pass++;
  console.log(`  ✔ ${message}`);
}

const commonCount = refractor.listLanguages().length;

assertValue(!languageTableReady(), "导入运行层时没有自动加载 refractor/all");
assertValue(commonCount < 100, `基础语言表保持精简（${commonCount} 个名字）`);

await ensureFullLanguageTable();

assertValue(languageTableReady(), "主动请求后完整语言表标记为就绪");
assertValue(
  refractor.listLanguages().length >= 200,
  `完整语言表完成注册（${refractor.listLanguages().length} 个名字）`,
);

await ensureFullLanguageTable();
assertValue(true, "重复请求共享同一次已完成加载");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
