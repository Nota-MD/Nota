/** 图片后缀、MIME 与“粘贴图片网址”识别。 */

import { readFileSync } from "node:fs";

import {
  imageAddressOfPastedText,
  imageExtensionFromMime,
  imageSliceExtension,
  isImageSliceTextItem,
} from "../src/editor/image-kind";

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

function equal(actual: unknown, expected: unknown, description: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${description}：期望 ${right}，实际 ${left}`);
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【图片链接识别】");

testCase("支持的后缀表只保留裸小写后缀", () => {
  for (const extension of imageSliceExtension) {
    equal(extension, extension.toLowerCase(), `${extension} 不是小写`);
    equal(extension.startsWith("."), false, `${extension} 带了点`);
  }
});

testCase("文件名与 MIME 走同一套后缀表", () => {
  for (const extension of imageSliceExtension) {
    equal(isImageSliceTextItem(`photo.${extension.toUpperCase()}`), true, extension);
  }
  equal(imageExtensionFromMime("image/png"), "png", "PNG");
  equal(imageExtensionFromMime("image/jpeg"), "jpg", "JPEG");
  equal(imageExtensionFromMime("image/svg+xml"), "svg", "SVG");
  equal(imageExtensionFromMime("application/octet-stream"), "png", "未知类型回退");
});

testCase("带查询串、片段与大写后缀的图片网址", () => {
  equal(
    imageAddressOfPastedText("https://example.com/photo.PNG?raw=1#preview"),
    "https://example.com/photo.PNG?raw=1#preview",
    "普通图片地址",
  );
  equal(
    imageAddressOfPastedText("www.example.com/a/b/photo.webp"),
    "https://www.example.com/a/b/photo.webp",
    "缺协议的 www 地址",
  );
});

testCase("常见无后缀图片 CDN 也能识别", () => {
  equal(
    imageAddressOfPastedText("https://img.shields.io/badge/Nota-0.10.0-blue"),
    "https://img.shields.io/badge/Nota-0.10.0-blue",
    "徽章",
  );
  equal(
    imageAddressOfPastedText("https://images.unsplash.com/photo-123"),
    "https://images.unsplash.com/photo-123",
    "图片 CDN",
  );
});

testCase("普通网页、Markdown 与夹在正文中的网址不误判", () => {
  for (const value of [
    "https://example.com/index.html",
    "https://example.com/article",
    "![图](https://example.com/a.png)",
    "看图 https://example.com/a.png",
    "not a url",
  ]) {
    equal(imageAddressOfPastedText(value), null, value);
  }
});

testCase("粘贴流程先认图片、兼容 text/uri-list，并保持选中文字加链接", () => {
  const source = readFileSync("src/editor/paste.ts", "utf8");
  assertValue(source.includes('getData("text/uri-list")'), "没有兼容 text/uri-list");
  assertValue(source.includes("plainTextData ||"), "text/plain 为空时不会回退到 text/uri-list");
  const imageIndex = source.indexOf("imageAddressOfPastedText(plainText)");
  const linkIndex = source.indexOf("pasteAboveUrlTransaction(view.state, plainText)");
  assertValue(imageIndex >= 0 && imageIndex < linkIndex, "图片判定没有排在普通链接之前");
  assertValue(source.includes("!selection.empty"), "选中文字时仍会替换成图片");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
