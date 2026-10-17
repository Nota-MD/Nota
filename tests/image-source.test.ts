/**
 * 图片显示地址的**纯路径判据**。
 *
 * 节点里的 `attrs.src` 必须保持 Markdown 原文；这里只算“屏幕上的 `<img>` 应该
 * 从哪个本机绝对路径加载”。真正转成 Tauri asset URL 的一步不在这里测（要真宿主）。
 */

import { 本地图片绝对路径 } from "../src/editor/video-view";

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

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
}

console.log("\n【图片本地路径】");

测("Unix 绝对路径原样交给宿主读成 data URL", () => {
  等(本地图片绝对路径("/home/lqy/下载/monoton_n.svg", null), "/home/lqy/下载/monoton_n.svg", "绝对路径");
});

测("相对路径按当前文档目录解析", () => {
  等(
    本地图片绝对路径("./assets/a.png", "/home/lqy/稿子/甲.md"),
    "/home/lqy/稿子/assets/a.png",
    "当前目录",
  );
  等(
    本地图片绝对路径("../img/a.png", "/home/lqy/稿子/甲.md"),
    "/home/lqy/img/a.png",
    "上级目录",
  );
});

测("Windows 盘符与反斜杠相对路径", () => {
  等(本地图片绝对路径("C:\\图\\a.png", null), "C:\\图\\a.png", "盘符绝对路径");
  等(
    本地图片绝对路径("assets\\a.png", "C:\\稿子\\甲.md"),
    "C:\\稿子\\assets\\a.png",
    "Windows 相对路径",
  );
});

测("file:// 地址去掉协议并解码", () => {
  等(本地图片绝对路径("file:///home/lqy/a%20b.png", null), "/home/lqy/a b.png", "file URL");
});

测("网络 / data / blob / asset 地址不碰", () => {
  for (const 地址 of [
    "https://example.com/a.png",
    "http://localhost/a.png",
    "data:image/png;base64,AA==",
    "blob:http://localhost/x",
    "asset://localhost/a.png",
  ]) {
    等(本地图片绝对路径(地址, "/home/lqy/甲.md"), null, 地址);
  }
});

测("没存过盘的文档无法猜相对路径", () => {
  等(本地图片绝对路径("./a.png", null), null, "没有文档路径");
  等(本地图片绝对路径("", "/home/lqy/a.md"), null, "空地址");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
