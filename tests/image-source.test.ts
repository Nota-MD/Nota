/**
 * 图片显示地址的**纯路径判据**。
 *
 * 节点里的 `attrs.src` 必须保持 Markdown 原文；这里只算“屏幕上的 `<img>` 应该
 * 从哪个本机绝对路径加载”。真正转成 Tauri asset URL 的一步不在这里测（要真宿主）。
 */

import { localLocalImageSliceAbsoluteCorrectPath } from "../src/editor/video-view";

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

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

console.log("\n【图片本地路径】");

testCase("Unix 绝对路径原样交给宿主读成 data URL", () => {
  equal(localLocalImageSliceAbsoluteCorrectPath("/home/lqy/下载/monoton_n.svg", null), "/home/lqy/下载/monoton_n.svg", "绝对路径");
});

testCase("相对路径按当前文档目录解析", () => {
  equal(
    localLocalImageSliceAbsoluteCorrectPath("./assets/a.png", "/home/lqy/稿子/甲.md"),
    "/home/lqy/稿子/assets/a.png",
    "当前目录",
  );
  equal(
    localLocalImageSliceAbsoluteCorrectPath("../img/a.png", "/home/lqy/稿子/甲.md"),
    "/home/lqy/img/a.png",
    "上级目录",
  );
});

testCase("Windows 盘符与反斜杠相对路径", () => {
  equal(localLocalImageSliceAbsoluteCorrectPath("C:\\图\\a.png", null), "C:\\图\\a.png", "盘符绝对路径");
  equal(
    localLocalImageSliceAbsoluteCorrectPath("assets\\a.png", "C:\\稿子\\甲.md"),
    "C:\\稿子\\assets\\a.png",
    "Windows 相对路径",
  );
});

testCase("file:// 地址去掉协议并解码", () => {
  equal(localLocalImageSliceAbsoluteCorrectPath("file:///home/lqy/a%20b.png", null), "/home/lqy/a b.png", "file URL");
});

testCase("网络 / data / blob / asset 地址不碰", () => {
  for (const address of [
    "https://example.com/a.png",
    "http://localhost/a.png",
    "data:image/png;base64,AA==",
    "blob:http://localhost/x",
    "asset://localhost/a.png",
  ]) {
    equal(localLocalImageSliceAbsoluteCorrectPath(address, "/home/lqy/甲.md"), null, address);
  }
});

testCase("没存过盘的文档无法猜相对路径", () => {
  equal(localLocalImageSliceAbsoluteCorrectPath("./a.png", null), null, "没有文档路径");
  equal(localLocalImageSliceAbsoluteCorrectPath("", "/home/lqy/a.md"), null, "空地址");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
