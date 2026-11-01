import { localizedDocumentTitle, setLanguage } from "@/i18n";

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

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}

console.log("\n【文档标题本地化】");

testCase("英文界面显示语言中立的未命名标题", () => {
  setLanguage("en");
  equal(localizedDocumentTitle("Untitled 3"), "Untitled 3", "英文标题");
});

testCase("中文界面翻译未命名标题并保留序号", () => {
  setLanguage("zh-CN");
  equal(localizedDocumentTitle("Untitled 3"), "未命名 3", "中文标题");
});

testCase("升级前已经生成的旧标题也不会漏出中文", () => {
  setLanguage("en");
  equal(localizedDocumentTitle("未命名 8"), "Untitled 8", "旧标题");
});

testCase("普通文档标题原样保留", () => {
  setLanguage("en");
  equal(localizedDocumentTitle("我的笔记"), "我的笔记", "用户标题");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
