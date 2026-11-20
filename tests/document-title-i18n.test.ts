import { localizedDocumentTitle, setLanguage } from "@/i18n";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    fail++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}

console.log("\n[Document title localization]");

testCase("English keeps language-neutral untitled titles", () => {
  setLanguage("en");
  equal(localizedDocumentTitle("Untitled 3"), "Untitled 3", "English title");
});

testCase("Chinese translates untitled titles and preserves the index", () => {
  setLanguage("zh-CN");
  equal(localizedDocumentTitle("Untitled 3"), "未命名 3", "Chinese title");
});

testCase("Legacy untitled titles are translated in English", () => {
  setLanguage("en");
  equal(localizedDocumentTitle("未命名 8"), "Untitled 8", "Legacy title");
});

testCase("User document titles remain unchanged", () => {
  setLanguage("en");
  equal(localizedDocumentTitle("我的笔记"), "我的笔记", "User title");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
