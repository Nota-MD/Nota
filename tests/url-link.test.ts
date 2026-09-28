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
  危险协议,
  正规化网址,
  是裸URL,
  切尾标点,
  裸URL正则,
  自动链接输入,
} from "../src/editor/url-link";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/* ── 一、危险协议 ───────────────────────────────────────────────────── */

组("一、危险协议（一个都不许写成链接）");

测("黑名单里的都拦下", () => {
  for (const 坏 of [
    "javascript:alert(1)",
    "vbscript:msgbox",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "blob:https://a.com/xxx",
  ]) {
    等(危险协议(坏), true, 坏);
    等(正规化网址(坏), null, `${坏} 不该被当网址`);
  }
});

测("⚠️ 大小写与空白绕不过去（`java\\tscript:` 也是它）", () => {
  // ⚠️ 浏览器解析 `href` 时会把里面的制表符与换行吃掉，它**仍然是**一条
  // `javascript:`。只判字符串开头就会从这道闸底下钻过去。
  等(危险协议("JaVaScRiPt:alert(1)"), true, "大小写");
  等(危险协议("java\tscript:alert(1)"), true, "制表符");
  等(危险协议("java\nscript:alert(1)"), true, "换行");
  等(危险协议(" javascript:alert(1)"), true, "前导空格");
});

测("⚠️ `mailto:` / `tel:` **放行**（它们是正当协议）", () => {
  等(危险协议("mailto:a@b.c"), false, "mailto");
  等(危险协议("tel:+8613800000000"), false, "tel");
  等(危险协议("https://a.com"), false, "https");
});

/* ── 二、正规化网址（认哪些）────────────────────────────────────────── */

组("二、正规化网址");

测("带协议的**原样**给出", () => {
  等(正规化网址("https://a.com/b?c=1#d"), "https://a.com/b?c=1#d", "https");
  等(正规化网址("http://a.com"), "http://a.com", "http 也认");
  等(正规化网址("HTTPS://A.COM/B"), "HTTPS://A.COM/B", "大小写原样（可用性不受影响）");
});

测("`www.` 开头的补 https", () => {
  等(正规化网址("www.nota.app"), "https://www.nota.app", "www");
  等(正规化网址("www.nota.app/a/b"), "https://www.nota.app/a/b", "带路径");
});

测("前后的空白算干净（trim 掉）", () => {
  等(正规化网址("  https://a.com  "), "https://a.com", "两侧空白");
});

测("⚠️ 裸域名**一律不认**（这是故意的，不是漏了）", () => {
  // 认了的话 `README.md` / `node.js` / `index.html` / `图.png` / `v1.2`
  // 全会变成链接。GitHub 认裸域名，代价正是这几类误报。
  for (const 文 of ["example.com", "README.md", "node.js", "index.html", "v1.2", "a.b"]) {
    等(正规化网址(文), null, 文);
  }
});

测("中间有空白的不认（「看这里 https://a.com 很有意思」不能整段变链接）", () => {
  等(正规化网址("https://a.com 很有意思"), null, "带尾巴文字");
  等(正规化网址("看 https://a.com"), null, "带前缀文字");
});

测("localhost 与 IPv4 放行", () => {
  等(正规化网址("http://localhost:5273/"), "http://localhost:5273/", "localhost+端口");
  等(正规化网址("http://127.0.0.1:8000"), "http://127.0.0.1:8000", "IPv4");
});

测("⚠️ `www.v2` / `www.1` 这种半截不认（最后一段要 ≥2 个字母）", () => {
  等(正规化网址("www.v2"), null, "一位 TLD");
  等(正规化网址("www.x"), null, "一位字母 TLD");
  等(正规化网址("www.nota.app"), "https://www.nota.app", "正常域名");
});

测("没写完的 / 别的写法一律不认", () => {
  等(正规化网址("https://"), null, "光协议");
  等(正规化网址("//a.com"), null, "协议相对写法");
  等(正规化网址("ftp://a.com"), null, "ftp");
  等(正规化网址(""), null, "空串");
  等(正规化网址("   "), null, "全空白");
});

测("`是裸URL` 与 `正规化网址` 是同一个答案", () => {
  // ⚠️ 两路（打字 / 粘贴）共用一条判据，测试也钉住这一点。
  for (const 文 of ["https://a.com", "www.a.com", "a.com", "", "javascript:x"]) {
    等(是裸URL(文), 正规化网址(文) !== null, 文);
  }
});

/* ── 三、切尾标点 ───────────────────────────────────────────────────── */

组("三、切尾标点");

测("句读一律切下来", () => {
  等(切尾标点("https://a.com.").网址, "https://a.com", "句号");
  等(切尾标点("https://a.com.").尾巴, ".", "句号留在尾巴上");
  等(切尾标点("https://a.com,").网址, "https://a.com", "逗号");
  等(切尾标点("https://a.com!?").网址, "https://a.com", "连着两颗");
});

测("⚠️ 右括号数着切（维基那种地址要保住）", () => {
  // `https://en.wikipedia.org/wiki/A_(b)` 必须以 `)` 结尾。
  等(切尾标点("https://en.wikipedia.org/wiki/A_(b)").网址, "https://en.wikipedia.org/wiki/A_(b)", "配平的括号保住");
  // ⚠️ 注意这里喂进去的是 `https://a.com)` 而**不是** `(https://a.com)`：
  // 真实那一路里，前导那颗 `(` 是**被正则的前缀吃掉的**（`m[1]` 只含网址本体），
  // 所以 `切尾标点` 看到的从来就是右边这一半。
  等(切尾标点("https://a.com)").网址, "https://a.com", "外层那颗切掉");
  等(切尾标点("https://a.com)").尾巴, ")", "尾巴");
});

测("配平的反例：左边多就保住、右边多就切", () => {
  等(切尾标点("https://a.com))").网址, "https://a.com", "右括号多：连着切两颗");
  等(切尾标点("https://a.com/(x)").网址, "https://a.com/(x)", "配平：保住");
  等(切尾标点("https://a.com)").网址, "https://a.com", "右括号多一颗：切");
});

测("中文的右引号 / 书名号那一族同样数着切", () => {
  等(切尾标点("https://a.com」").网址, "https://a.com", "右角括号");
  等(切尾标点("https://a.com”").网址, "https://a.com", "右弯引号");
});

测("没有尾巴时给空串", () => {
  等(切尾标点("https://a.com").尾巴, "", "干净");
  等(切尾标点("https://a.com").网址, "https://a.com", "网址");
});

测("⚠️ 全是标点时网址成空串（调用方自己判）", () => {
  // ⚠️ 这里**不替调用方兜底**：留空串出去，让 `正规化网址` 去落空。
  等(切尾标点("...").网址, "", "三颗点");
});

/* ── 四、裸URL正则：该认的认 ───────────────────────────────────────── */

组("四、`裸URL正则`（打到词尾那一下的匹配式）");

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
function 匹配区间(全文: string): string | null {
  const m = 裸URL正则.exec(全文);
  if (!m) return null;
  const 原 = m[1]!;
  const 前缀长 = m[0].length - 原.length - 1;
  const 光标 = 全文.length;
  const 始 = 光标 - m[0].length + 前缀长;
  const 终 = 光标 - 1;
  return 全文.slice(始, 终);
}

测("行首：`https://a.com ` 认", () => {
  等(匹配区间("https://a.com "), "https://a.com", "行首");
});

测("字后面：`见 https://a.com ` 认，且**不带上那颗空格**", () => {
  // ⚠️ 这一条正是"包歪"那个毛病的探针。
  等(匹配区间("见 https://a.com "), "https://a.com", "空格后");
});

测("左括号后面认", () => {
  等(匹配区间("(https://a.com "), "https://a.com", "左括号");
  等(匹配区间("「https://a.com "), "https://a.com", "中文左角括号");
});

测("`www.` 开头的认", () => {
  等(匹配区间("www.nota.app "), "www.nota.app", "www");
});

测("制表符也能当触发字符", () => {
  等(匹配区间("https://a.com\t"), "https://a.com", "tab");
});

测("⚠️ 地址里的标点**照收**（切尾标点是后面那一步的事）", () => {
  // ⚠️ 正则**不做**切尾标点：两步分开才是"匹配逻辑只有一份"那条规矩的落点。
  等(匹配区间("https://a.com/b. "), "https://a.com/b.", "带句号");
 等(匹配区间("https://a.com/(x) "), "https://a.com/(x)", "带括号");
});

/* ── 五、裸URL正则：不该认的不认 ───────────────────────────────────── */

组("五、`裸URL正则` 的否决");

测("⚠️ 没敲触发键（末尾不是空格 / 制表符）就不匹配", () => {
  // 用户还在打，还没打完。
  等(裸URL正则.test("https://a.com"), false, "行尾");
  等(裸URL正则.test("https://a.com/b"), false, "打了一半");
});

测("⚠️ 前面紧挨着字母或数字的不认（`xhttps://a.com `）", () => {
  // ⚠️ 收尾里没有词边界，靠的是前缀那一支：前面必须是行首 / 空白 / 左括号族。
  等(裸URL正则.test("xhttps://a.com "), false, "字母后");
  等(裸URL正则.test("1https://a.com "), false, "数字后");
});

测("⚠️ 反引号与尖括号收尾：不认（实际地址里它们必须转义）", () => {
  等(裸URL正则.test("见 `<https://a.com>`"), false, "尖括号那一串");
});

测("中文正文里夹一条网址：认（前缀是空白）", () => {
  等(匹配区间("地址是 https://a.com "), "https://a.com", "中文夹网址");
});

/* ── 六、装配 ───────────────────────────────────────────────────────── */

组("六、装配");

测("`自动链接输入()` 挂 1 条规则（没有开关，一直挂着）", () => {
  // ⚠️ 这一件事没有对应的设置项（用户要的就是它一直在），所以**没有**"关着
  // 返回空数组"那一档——`auto-correct.ts` 那个 `自动更正输入(false)` 才是。
  等(自动链接输入().length, 1, "条数");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
