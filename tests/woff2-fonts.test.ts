import { collapseFontFaces } from "../tools/font-css";

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
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

testCase("普通 WOFF2 + WOFF + TTF 回退只留下 WOFF2", () => {
  const css = '@font-face{font-family:X;src:url(./x.woff2) format("woff2"),url(./x.woff) format("woff"),url(./x.ttf) format("truetype")}';
  equal(
    collapseFontFaces(css),
    '@font-face{font-family:X;src:url(./x.woff2) format("woff2")}',
    "旧格式回退没有删净",
  );
});

testCase("Data URI 里的 base64 分号不会截断 src", () => {
  const css = '@font-face{font-family:X;src:url(data:font/woff2;base64,AAAA) format("woff2"),url(./x.woff) format("woff")}';
  equal(
    collapseFontFaces(css),
    '@font-face{font-family:X;src:url(data:font/woff2;base64,AAAA) format("woff2")}',
    "data URI 被分号截断",
  );
});

testCase("没有 WOFF2 的 src 原样保留，交给构建闸门报错", () => {
  const css = '@font-face{src:url(./x.woff) format("woff")}';
  equal(collapseFontFaces(css), css, "无 WOFF2 时不应伪造格式");
});

console.log(`\nWOFF2 font gate: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
