/**
 * `src/editor/lang-icons-real.ts`（真·语言图标那张表）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/lang-icons.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-lang-icons-test/lang-icons.test.mjs
 * node /tmp/nota-lang-icons-test/lang-icons.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * ⚠️ **要在仓库里跑**（`cd <仓库>` 那一步不能省）：这份测试要读仓库里的
 * 图标文件，它从 `process.cwd()` 往上找那个"有 `src/editor/lang-icons-real.ts`
 * 的目录"。bundle 出来的 `.mjs` 落在 `/tmp`，所以**不能**靠 `import.meta.url`
 * 定位仓库（那个 URL 指的是 `/tmp` 里那一份，不是源码那一份）——
 * 这一点和 `mark-hint.test.ts` / `math-view.test.ts` 不同，那两份不读文件。
 *
 * # 这份测试挡的是什么
 *
 * 三个**静默**的坏法，全都不会报错、界面上看着也完全正常：
 *
 * 1. **表里写了个没有对应文件的图标名** —— 那个语言回落成首字母徽章。
 *    界面只是"这颗图不太一样"，混在几十行下拉里根本看不出来。
 *    （`图标组` 里的名字是手抄上游文件名的，抄错一个字母就到了这里。）
 * 2. **表里写了个 `refractor` 没有的语言 id** —— 那条映射**永远命中不了**，
 *    等于白写。同理，vscode-icons 的文件名和语言名**常常不一样**
 *    （`dartlang` 不是 `dart`、`shell` 不是 `bash`、`tex` 不是 `latex`），
 *    所以"猜一个名字"是这份表的默认风险。
 * 3. **同一个语言 id 出现在两组里** —— 后写的那组赢，前一组白写。
 *    （`语言到图标` 那张 Map 是顺序 `set` 的，重复时不会报错。）
 *
 * ⚠️ 反过来，**这份文件里少一个语言不是错**——400 个语言 id 里绝大多数
 * 一辈子不会有人贴进 Markdown，回落徽章本来就是设计的一部分。所以这里
 * **没有**"必须覆盖 N 个语言"那种断言，只有下面第五组那几个"肯定要盖到"
 * 的抽样。
 *
 * # 这份测试**证明不了**什么
 *
 * 它证明不了：图标在界面上画出来了、大小对不对、深浅主题下看不看得清、
 * 下拉里那几十颗图排在一起齐不齐。那些一律是**目检**的事
 * （见 `docs/06` §5.9 起的开窗目检一节）。
 *
 * ⚠️ 它**也**证明不了"文件内容没被人改过"——那是 `SHA256SUMS` 的事：
 * `bash tools/fetch-lang-icons.sh --verify`。这里只检查文件**存在**、
 * 且是一颗**看着像 SVG** 的东西。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ⚠️ 与 `code-block.ts` 同一个模块、同一个 `refractor` 单例：`all` 那一份
//    才会把 400 个语言全注册上，只 import `refractor` 拿到的是 common 那份。
import "refractor/all";
import { refractor } from "refractor";

import { representTableLanguage, iconName, iconGroup, allIconNames } from "../src/editor/lang-icons-real";

/* ── 极小的测试工装（与 `mark-hint.test.ts` 同一套长相）───────────────── */

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

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 定位仓库（见文件头上那条 ⚠️）────────────────────────────────────── */

function findRepositoryLibraryRoot(): string {
  let place = process.cwd();
  for (let layer = 0; layer < 12; layer++) {
    if (existsSync(join(place, "src", "editor", "lang-icons-real.ts"))) return place;
    const above = join(place, "..");
    if (above === place) break;
    place = above;
  }
  throw new Error(
    `从 ${process.cwd()} 一路往上都没找到 src/editor/lang-icons-real.ts —— ` +
      `这份测试要在仓库里跑（\`cd <仓库>\` 再跑）。`,
  );
}

const repositoryLibraryRoot = findRepositoryLibraryRoot();
const iconItemRecord = join(repositoryLibraryRoot, "src", "assets", "lang-icons");

const fileOnDisk = readdirSync(iconItemRecord).filter((name3) => name3.endsWith(".svg"));
const onDiskIconName = new Set(
  fileOnDisk.map((name3) => name3.replace(/^file_type_/, "").replace(/\.svg$/, "")),
);

const allLanguageIds = new Set<string>(refractor.listLanguages());
/** `math` 是本仓为 LaTeX 数学围栏增加的别名，不是 refractor 自带 id。 */
const localRepositoryExtensionExtendLanguage = new Set(["math"]);

/* ── 用例 ─────────────────────────────────────────────────────────────── */

group("一、表里每个图标名，磁盘上都要有那颗 .svg");

testCase("图标名 → 文件（缺一个就说明抄错了名字）", () => {
  const missing2 = allIconNames().filter((name3) => !onDiskIconName.has(name3));
  assertion(
    missing2.length === 0,
    `这几个名字在 src/assets/lang-icons/ 里没有对应文件：${missing2.join("、")}\n` +
      "      （症状是那个语言悄悄回落成首字母徽章。名字要照上游的文件名写，" +
      "先用 tools/fetch-lang-icons.sh 抓下来再加进表里。）",
  );
});

testCase("文件 → 图标名（磁盘上有、表里没人用的就是白搬来的）", () => {
  const tableEntry = new Set(allIconNames());
  const nonePersonUse = [...onDiskIconName].filter((name3) => !tableEntry.has(name3));
  assertion(
    nonePersonUse.length === 0,
    `这些文件搬进来了但表里没人用：${nonePersonUse.join("、")}\n` +
      "      （要么补进 图标组，要么从 tools/fetch-lang-icons.sh 的 NAMES 里删掉）",
  );
});

testCase("图标名不许带前缀或后缀（存的是上游文件名的**中段**）", () => {
  for (const name3 of allIconNames()) {
    assertion(!name3.startsWith("file_type_"), `「${name3}」不该带 file_type_ 前缀`);
    assertion(!name3.endsWith(".svg"), `「${name3}」不该带 .svg 后缀`);
  }
});

group("二、磁盘上那些文件真的是 SVG");

testCase("每个文件都以 <svg 开头、且带 viewBox", () => {
  //  ⚠️ 抓取脚本只用 `curl -f` 挡住了 404——404 的响应体是一篇 HTML 错误页，
  //     存成 `.svg` 照样能写进磁盘。这一条挡的是"半套图标"（被代理塞了一页
  //     登录页那种），而那种坏法在界面上是一片空白，看不出原因。
  const bad: string[] = [];
  for (const textItem of fileOnDisk) {
    const head2 = readFileSync(join(iconItemRecord, textItem), "utf8").slice(0, 600);
    if (!head2.includes("<svg") || !head2.includes("viewBox")) bad.push(textItem);
  }
  assertion(bad.length === 0, `这几个不是正常的 SVG：${bad.join("、")}`);
});

testCase("没有空文件", () => {
  const emptyValue = fileOnDisk.filter(
    (textItem) => readFileSync(join(iconItemRecord, textItem)).length < 100,
  );
  assertion(emptyValue.length === 0, `这几个文件小得不像一颗图：${emptyValue.join("、")}`);
});

group("三、⚠️ 表里的语言 id 必须是 `refractor` 或本仓扩展里真有的 id");

testCase("每个语言 id 都在 refractor.listLanguages() 或本仓扩展表里", () => {
  //  ⚠️ 这一组挡的是"猜了一个语言名"——`bash` 有、`zsh` 没有，`markup` 有、
  //     `svg` 在、`jsx` 在……记不全就得靠这条。写错了的症状是那条映射
  //     **永远命中不了**，一句报错都没有。
  const notSaveAtOf: string[] = [];
  for (const { language } of iconGroup) {
    for (const id of language) {
      if (!allLanguageIds.has(id) && !localRepositoryExtensionExtendLanguage.has(id)) notSaveAtOf.push(id);
    }
  }
  assertion(
    notSaveAtOf.length === 0,
    `这几个语言 id 在 refractor 里没有：${notSaveAtOf.join("、")}\n` +
      "      （先把语言列表打出来看一眼，别照语言名猜：在仓库里跑 " +
      "`node -e \"console.log(require('refractor/lib/all.js'))\"` 之类太绕，" +
      "直接写个两行的探针脚本 import \"refractor/all\" 打 listLanguages() 就行。）",
  );
});

testCase("反过来：表里覆盖到的语言，翻译回来还是它自己", () => {
  //  ⚠️ 走一遍 `图标名()` 而不是直接读 `图标组`：真正被调用的是这个函数
  //     （`lang-icon.ts` 用的也是它），要保证摊平那张 Map 没把谁挤掉。
  for (const { icon, language } of iconGroup) {
    for (const id of language) equal(iconName(id), icon, `${id} 翻译出来`);
  }
});

group("四、同一个语言不许出现在两组里（后写的会赢）");

testCase("语言 id 没有重复", () => {
  const seePass = new Map<string, string>();
  const collideOf: string[] = [];
  for (const { icon, language } of iconGroup) {
    for (const id of language) {
      const firstBefore = seePass.get(id);
      if (firstBefore !== undefined) collideOf.push(`${id}（${firstBefore} 与 ${icon}）`);
      seePass.set(id, icon);
    }
  }
  assertion(
    collideOf.length === 0,
    "这些语言 id 被两组同时声明了：" +
      `${collideOf.join("、")}\n` +
      "      （`语言到图标` 是按顺序 set 的，重复时后写的赢、前一组白写，不报错。）",
  );
});

testCase("图标名也没有重复（同名的两组，前一组全白写）", () => {
  const all2 = iconGroup.map(({ icon }) => icon);
  const heavyRestore = [...new Set(all2.filter((name3, i) => all2.indexOf(name3) !== i))];
  assertion(heavyRestore.length === 0, `这几个图标名出现在两组里：${heavyRestore.join("、")}`);
});

group("五、抽样：这几个语言**必须**有真图（不然这个功能等于没做）");

testCase("最常贴进 Markdown 的那些都在", () => {
  //  ⚠️ 抽样不是"必须覆盖多少"的意思——是"要是连这几个都没有，先别急着
  //     调样式，回头看看表是不是整块没生效"。
  const mustMustHas = [
    "javascript", "typescript", "jsx", "tsx", "python", "rust", "go",
    "c", "cpp", "java", "kotlin", "swift", "ruby", "php", "lua",
    "html", "css", "scss", "json", "yaml", "toml",
    "bash", "shell", "powershell", "sql", "docker", "dockerfile",
    "markdown", "latex", "text", "mermaid", "git", "diff",
  ];
  const missing2 = mustMustHas.filter((id) => iconName(id) === null);
  assertion(missing2.length === 0, `这几个语言没有真图标：${missing2.join("、")}`);
});

testCase("⚠️ `latex` 和 `tex` 都有图（用户最常写的那两个，本仓专门盯过）", () => {
  equal(iconName("latex"), "tex", "latex 的图");
  equal(iconName("tex"), "tex", "tex 的图");
});

testCase("⚠️ 上游文件名和语言名不一样的那几个，映射对得上", () => {
  //  这一组是查表时最容易"照语言名猜"的几个，钉住：
  equal(iconName("dart"), "dartlang", "dart 的图叫 dartlang");
  equal(iconName("bash"), "shell", "bash 的图叫 shell");
  equal(iconName("plaintext"), "text", "plaintext 的图叫 text");
  equal(iconName("objectivec"), "objectivec", "objectivec 就是它自己");
  equal(iconName("protobuf"), "protobuf", "protobuf 就是它自己");
});

group("六、兜底那条路要留着");

testCase("不指定语言（空串）没有真图 —— 走徽章那条路画那个破折号", () => {
  //  ⚠️ `NO_LANGUAGE` 是空串（与 `code-block.ts` 同一个值）。它要是被谁
  //     映射到某颗图上，下拉最上面那一项「纯文本」就会长成别的语言的图。
  equal(iconName(""), null, "空串");
  equal(iconName("clike"), null, "clike 这种没有真图的也该是 null");
  equal(iconName("没有这个语言"), null, "瞎编的名字");
});

testCase("没有真图 ≠ 没有图标：`lang-icon.ts` 那边照旧会画一颗徽章", () => {
  //  ⚠️ 这一条靠**读源码**判，不是跑它（`lang-icon.ts` 里那两句要 DOM）。
  //     判据是"`languageIcon` 里真图那条路后面还有一条兜底分支"——真有人把
  //     兜底删掉、只留真图的话，400 个语言里 300 多个会连一颗图标都没有。
  const source3 = readFileSync(join(repositoryLibraryRoot, "src", "editor", "lang-icon.ts"), "utf8");
  assertion(source3.includes("assertValueIconURI("), "`lang-icon.ts` 应当先问真图");
  assertion(source3.includes("shrinkWrite(lang)"), "`lang-icon.ts` 应当留着徽章那条兜底");
});

group("七、一个语言族只留一行（2026-10-16，朋友报的「代码块语言类型重复」）");

testCase("代表语言：一组里所有写法都指向表里排第一的那个", () => {
  equal(representTableLanguage("armasm"), "nasm", "armasm 是 nasm 的别名");
  equal(representTableLanguage("arm-asm"), "nasm", "arm-asm 同一族");
  equal(representTableLanguage("md"), "markdown", "md → markdown");
  equal(representTableLanguage("plain"), "plaintext", "plain → plaintext");
  equal(representTableLanguage("txt"), "plaintext", "txt 也是同一族");
  equal(representTableLanguage("markdown"), "markdown", "代表名映射到它自己");
});

testCase("⚠️ 每一族的代表名必须是它自己（不然那一族会整族从下拉里消失）", () => {
  const bad: string[] = [];
  for (const { language } of iconGroup) {
    const representTable = language[0]!;
    if (representTableLanguage(representTable) !== representTable) bad.push(representTable);
  }
  assertion(bad.length === 0, `这些代表名映射到了别的族：${bad.join("、")}`);
});

testCase("⚠️ 表里没有的 id 原样返回（用户自己敲的那种）", () => {
  equal(representTableLanguage("没有这个语言"), "没有这个语言", "不认识的原样给回去");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
