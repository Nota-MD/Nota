/**
 * `src/editor/url-link.ts`（裸 URL ＋ 粘贴网址包链接）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/url-link.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/url-link.mjs
 * node /tmp/nota-测试/url-link.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 这一格的对错**全在判据上**，而且两个方向都会出事：
 *
 * - **认多了**：`README.md` 变成链接——"把用户写的普通文字改成一个链接"是
 *   这件事唯一不能犯的错。所以第一组把**每一条不该认的**都钉住
 *   （裸域名、带空格的、危险协议、没写完的）。
 * - **认少了 / 位置算错**：链接包住了 URL 前面那颗空格、或者第一个字符被切掉。
 *   第五组拿 {@link 裸URL正则} **真跑一遍匹配**，再按输入规则那份算法算出区间，
 *   用切片验证——**偏移那套算术是这份文件最容易错的地方**（它由
 *   `prosemirror-inputrules` 的"从光标反推"决定，写错了不报错，只是包歪）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **「打完一行网址再敲空格，屏幕上真变成链接」没验**：`自动链接输入()` 只
 *   验到"挂了 1 条规则"。真跑要 `Editor.make()` ＋ 真 DOM（本仓没有 jsdom）。
 * - ⚠️ **`贴上网址事务` 没验**（它要一个真 `EditorState`）：于是
 *   "选中一段再粘网址会包住它"这条主路径是空白。⚠️ 它同时被 `paste.ts`
 *   的 `handlePaste` 挡着，也要真 view——**这两条合起来是本文件最大的空白**，
 *   在 `docs/07` 那一项里列成开窗目检。
 * - ⚠️ **「行尾那颗回车不触发」没验**（那是 `prosemirror-inputrules` 的行为，
 *   不是本文件的判据）。
 */

import {
  DangerousProtocol,
  NormalizeUrl,
  isBareURL,
  splitTailPunctuation,
  bareURLCorrectRule,
  selfActionLinkInput,
} from "../src/editor/url-link";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 一、危险协议 ───────────────────────────────────────────────────── */

group("一、危险协议（一个都不许写成链接）");

testCase("黑名单里的都拦下", () => {
  for (const broken of [
    "javascript:alert(1)",
    "vbscript:msgbox",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "blob:https://a.com/xxx",
  ]) {
    equal(DangerousProtocol(broken), true, broken);
    equal(NormalizeUrl(broken), null, `${broken} 不该被当网址`);
  }
});

testCase("⚠️ 大小写与空白绕不过去（`java\\tscript:` 也是它）", () => {
  // ⚠️ 浏览器解析 `href` 时会把里面的制表符与换行吃掉，它**仍然是**一条
  // `javascript:`。只判字符串开头就会从这道闸底下钻过去。
  equal(DangerousProtocol("JaVaScRiPt:alert(1)"), true, "大小写");
  equal(DangerousProtocol("java\tscript:alert(1)"), true, "制表符");
  equal(DangerousProtocol("java\nscript:alert(1)"), true, "换行");
  equal(DangerousProtocol(" javascript:alert(1)"), true, "前导空格");
});

testCase("⚠️ `mailto:` / `tel:` **放行**（它们是正当协议）", () => {
  equal(DangerousProtocol("mailto:a@b.c"), false, "mailto");
  equal(DangerousProtocol("tel:+8613800000000"), false, "tel");
  equal(DangerousProtocol("https://a.com"), false, "https");
});

/* ── 二、正规化网址（认哪些）────────────────────────────────────────── */

group("二、正规化网址");

testCase("带协议的**原样**给出", () => {
  equal(NormalizeUrl("https://a.com/b?c=1#d"), "https://a.com/b?c=1#d", "https");
  equal(NormalizeUrl("http://a.com"), "http://a.com", "http 也认");
  equal(NormalizeUrl("HTTPS://A.COM/B"), "HTTPS://A.COM/B", "大小写原样（可用性不受影响）");
});

testCase("`www.` 开头的补 https", () => {
  equal(NormalizeUrl("www.nota.app"), "https://www.nota.app", "www");
  equal(NormalizeUrl("www.nota.app/a/b"), "https://www.nota.app/a/b", "带路径");
});

testCase("前后的空白算干净（trim 掉）", () => {
  equal(NormalizeUrl("  https://a.com  "), "https://a.com", "两侧空白");
});

testCase("⚠️ 裸域名**一律不认**（这是故意的，不是漏了）", () => {
  // 认了的话 `README.md` / `node.js` / `index.html` / `图.png` / `v1.2`
  // 全会变成链接。GitHub 认裸域名，代价正是这几类误报。
  for (const text4 of ["example.com", "README.md", "node.js", "index.html", "v1.2", "a.b"]) {
    equal(NormalizeUrl(text4), null, text4);
  }
});

testCase("中间有空白的不认（「看这里 https://a.com 很有意思」不能整段变链接）", () => {
  equal(NormalizeUrl("https://a.com 很有意思"), null, "带尾巴文字");
  equal(NormalizeUrl("看 https://a.com"), null, "带前缀文字");
});

testCase("localhost 与 IPv4 放行", () => {
  equal(NormalizeUrl("http://localhost:5273/"), "http://localhost:5273/", "localhost+端口");
  equal(NormalizeUrl("http://127.0.0.1:8000"), "http://127.0.0.1:8000", "IPv4");
});

testCase("⚠️ `www.v2` / `www.1` 这种半截不认（最后一段要 ≥2 个字母）", () => {
  equal(NormalizeUrl("www.v2"), null, "一位 TLD");
  equal(NormalizeUrl("www.x"), null, "一位字母 TLD");
  equal(NormalizeUrl("www.nota.app"), "https://www.nota.app", "正常域名");
});

testCase("没写完的 / 别的写法一律不认", () => {
  equal(NormalizeUrl("https://"), null, "光协议");
  equal(NormalizeUrl("//a.com"), null, "协议相对写法");
  equal(NormalizeUrl("ftp://a.com"), null, "ftp");
  equal(NormalizeUrl(""), null, "空串");
  equal(NormalizeUrl("   "), null, "全空白");
});

testCase("`是裸URL` 与 `正规化网址` 是同一个答案", () => {
  // ⚠️ 两路（打字 / 粘贴）共用一条判据，测试也钉住这一点。
  for (const text4 of ["https://a.com", "www.a.com", "a.com", "", "javascript:x"]) {
    equal(isBareURL(text4), NormalizeUrl(text4) !== null, text4);
  }
});

/* ── 三、切尾标点 ───────────────────────────────────────────────────── */

group("三、切尾标点");

testCase("句读一律切下来", () => {
  equal(splitTailPunctuation("https://a.com.").url, "https://a.com", "句号");
  equal(splitTailPunctuation("https://a.com.").tailPart, ".", "句号留在尾巴上");
  equal(splitTailPunctuation("https://a.com,").url, "https://a.com", "逗号");
  equal(splitTailPunctuation("https://a.com!?").url, "https://a.com", "连着两颗");
});

testCase("⚠️ 右括号数着切（维基那种地址要保住）", () => {
  // `https://en.wikipedia.org/wiki/A_(b)` 必须以 `)` 结尾。
  equal(splitTailPunctuation("https://en.wikipedia.org/wiki/A_(b)").url, "https://en.wikipedia.org/wiki/A_(b)", "配平的括号保住");
  // ⚠️ 注意这里喂进去的是 `https://a.com)` 而**不是** `(https://a.com)`：
  // 真实那一路里，前导那颗 `(` 是**被正则的前缀吃掉的**（`m[1]` 只含网址本体），
  // 所以 `切尾标点` 看到的从来就是右边这一半。
  equal(splitTailPunctuation("https://a.com)").url, "https://a.com", "外层那颗切掉");
  equal(splitTailPunctuation("https://a.com)").tailPart, ")", "尾巴");
});

testCase("配平的反例：左边多就保住、右边多就切", () => {
  equal(splitTailPunctuation("https://a.com))").url, "https://a.com", "右括号多：连着切两颗");
  equal(splitTailPunctuation("https://a.com/(x)").url, "https://a.com/(x)", "配平：保住");
  equal(splitTailPunctuation("https://a.com)").url, "https://a.com", "右括号多一颗：切");
});

testCase("中文的右引号 / 书名号那一族同样数着切", () => {
  equal(splitTailPunctuation("https://a.com」").url, "https://a.com", "右角括号");
  equal(splitTailPunctuation("https://a.com”").url, "https://a.com", "右弯引号");
});

testCase("没有尾巴时给空串", () => {
  equal(splitTailPunctuation("https://a.com").tailPart, "", "干净");
  equal(splitTailPunctuation("https://a.com").url, "https://a.com", "网址");
});

testCase("⚠️ 全是标点时网址成空串（调用方自己判）", () => {
  // ⚠️ 这里**不替调用方兜底**：留空串出去，让 `正规化网址` 去落空。
  equal(splitTailPunctuation("...").url, "", "三颗点");
});

/* ── 四、裸URL正则：该认的认 ───────────────────────────────────────── */

group("四、`裸URL正则`（打到词尾那一下的匹配式）");

/**
 * 把"敲下触发键之后的那一行"喂给 {@link 裸URL正则}，再按**输入规则那份算法**
 * 算出网址本体的区间，用切片验回来。
 *
 * ⚠️ 这一段是**本文件最有用的一条断言**：`prosemirror-inputrules` 是拿
 * `始 = 光标 - match[0].length` 反推的，所以区间算错了不报错，只是**包歪**
 *（最典型的是把 URL 前面那颗空格也包进链接里）。
 *
 * @returns 网址本体在原文里的样子；没匹配给 `null`。
 */
function matchRange(fullText: string): string | null {
  const m = bareURLCorrectRule.exec(fullText);
  if (!m) return null;
  const original = m[1]!;
  const prefixLength = m[0].length - original.length - 1;
  const cursor = fullText.length;
  const start6 = cursor - m[0].length + prefixLength;
  const end3 = cursor - 1;
  return fullText.slice(start6, end3);
}

testCase("行首：`https://a.com ` 认", () => {
  equal(matchRange("https://a.com "), "https://a.com", "行首");
});

testCase("字后面：`见 https://a.com ` 认，且**不带上那颗空格**", () => {
  // ⚠️ 这一条正是"包歪"那个毛病的探针。
  equal(matchRange("见 https://a.com "), "https://a.com", "空格后");
});

testCase("左括号后面认", () => {
  equal(matchRange("(https://a.com "), "https://a.com", "左括号");
  equal(matchRange("「https://a.com "), "https://a.com", "中文左角括号");
});

testCase("`www.` 开头的认", () => {
  equal(matchRange("www.nota.app "), "www.nota.app", "www");
});

testCase("制表符也能当触发字符", () => {
  equal(matchRange("https://a.com\t"), "https://a.com", "tab");
});

testCase("⚠️ 地址里的标点**照收**（切尾标点是后面那一步的事）", () => {
  // ⚠️ 正则**不做**切尾标点：两步分开才是"匹配逻辑只有一份"那条规矩的落点。
  equal(matchRange("https://a.com/b. "), "https://a.com/b.", "带句号");
 equal(matchRange("https://a.com/(x) "), "https://a.com/(x)", "带括号");
});

/* ── 五、裸URL正则：不该认的不认 ───────────────────────────────────── */

group("五、`裸URL正则` 的否决");

testCase("⚠️ 没敲触发键（末尾不是空格 / 制表符）就不匹配", () => {
  // 用户还在打，还没打完。
  equal(bareURLCorrectRule.test("https://a.com"), false, "行尾");
  equal(bareURLCorrectRule.test("https://a.com/b"), false, "打了一半");
});

testCase("⚠️ 前面紧挨着字母或数字的不认（`xhttps://a.com `）", () => {
  // ⚠️ 收尾里没有词边界，靠的是前缀那一支：前面必须是行首 / 空白 / 左括号族。
  equal(bareURLCorrectRule.test("xhttps://a.com "), false, "字母后");
  equal(bareURLCorrectRule.test("1https://a.com "), false, "数字后");
});

testCase("⚠️ 反引号与尖括号收尾：不认（实际地址里它们必须转义）", () => {
  equal(bareURLCorrectRule.test("见 `<https://a.com>`"), false, "尖括号那一串");
});

testCase("中文正文里夹一条网址：认（前缀是空白）", () => {
  equal(matchRange("地址是 https://a.com "), "https://a.com", "中文夹网址");
});

/* ── 六、装配 ───────────────────────────────────────────────────────── */

group("六、装配");

testCase("`自动链接输入()` 挂 1 条规则（没有开关，一直挂着）", () => {
  // ⚠️ 这一件事没有对应的设置项（用户要的就是它一直在），所以**没有**"关着
  // 返回空数组"那一档——`auto-correct.ts` 那个 `自动更正输入(false)` 才是。
  equal(selfActionLinkInput().length, 1, "条数");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
