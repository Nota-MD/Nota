/**
 * **这份文件是什么类型，该用哪种编辑模式打开**。
 * 2026-09-28 落地，用户原话：「**按文件名认类型（schema-aware）**」。
 *
 * # 它解决的那个具体问题
 *
 * Nota 的编辑器内核是 **Markdown 的**（Milkdown 那棵树认的是 CommonMark）。
 * 而**任何 UTF-8 文件都能打开**——跳出 `Open` 对话框的筛选、拖进来、`nota x.py`
 * 都行。于是拖一个 `foo.py` 进来，它会被当成一份 Markdown 解析：
 * 行首的 `# 注释` 变成一级标题、`*args` 变成斜体、下划线标签变成 `<u>`。
 * 存回去字节还是对的（本仓的往返很小心），但**屏幕上那幅画是错的**。
 *
 * ⚠️ **这不是"猜"，是"看一眼名字"**：后缀说了它是 `.py`，就没有理由拿
 * CommonMark 去读它。真正猜不出来的那一半（内容像不像代码）在
 * `editor/lang-guess.ts`，两件事别混。
 *
 * # 两张表，都在这一个文件里
 *
 * | 表 | 回答 | 谁在用 |
 * |---|---|---|
 * | {@link MARKDOWN后缀} | **哪一族后缀算 Markdown** | 本文件、`ui/useDocuments.ts` 的对话框筛选、`ui/useFileDrop.ts` 的分类 |
 * | {@link 大文件阈值} | **多大就不该走富文本了** | 本文件的 {@link 降级缘由} |
 *
 * # ⚠️ 为什么后缀表要收在一处
 *
 * 在收到这里之前，那张单子**在四个地方各写了一遍**（Rust 的
 * `commands/workspace.rs::is_markdown`、`ui/useDocuments.ts` 的对话框筛选、
 * `ui/useFileDrop.ts` 的 `是_markdown`、以及它旁边那张更宽的 `文本后缀`），
 * 而且**已经不一致了**：`.txt` 在 Rust 与打开对话框那一侧算 Markdown，
 * 在拖放那一侧**不算**（拖一篇 `.txt` 进来会被归到"别的文件"，
 * 走 `drop_importable` 那条设置）。症状是"同一份 .txt，从菜单打开是一回事，
 * 拖进来是另一回事"。
 *
 * ⚠️ 这张表现在是**唯一的一份**，但它**不是**真值源——真值源是
 * `src-tauri/src/commands/workspace.rs::is_markdown`（宿主那边决定文件树列什么）。
 * `tests/file-kind.test.ts` 第一组**去读那份 Rust 源码**，两边对不上就 FAIL。
 * 这样"改了一处忘了另一处"变成一件跑得出来的事，而不是一条注释里的请求。
 *
 * # ⚠️ 这张表**不管**"能不能当文本打开"
 *
 * `ui/useFileDrop.ts` 里那张更宽的 `文本后缀`（`.json` `.toml` `.py` …）回答的是
 * 另一个问题：**这个文件能不能作为一份文本文档打开**。答案是"能"——它们是用户
 * 会写笔记的地方。两张表**故意不一样**，别合并：合并了就会变成
 * "Nota 只打得开 Markdown"，而那是 `docs/10` §11.2 明确**不做**的格式转换。
 */

import type { ViewMode } from "@/bridge/ipc";

/**
 * **Markdown 那一族**的后缀，小写、**不带点**。
 *
 * ⚠️ 改这里的**同一次提交**要改 `src-tauri/src/commands/workspace.rs::is_markdown`
 * （`tests/file-kind.test.ts` 第一组会读那份 Rust 源码逐个对，对不上就是 FAIL）。
 *
 * ⚠️ `.txt` **在这张表里**，是**有意的**：Nota 一直把纯文本当 Markdown 打开
 *（写作时先生成 `.txt` 再改名的人多得是），而它走的是同一条解析路径。
 * `mdx` 也在——那条是 backlog 第 28 项定的（它认 `.mdx`，对话框也得筛得出来）。
 */
export const mARKDOWNExtension: readonly string[] = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mdx",
  "txt",
];

/**
 * **超过这个字符数就走源码模式**（UTF-16 码元，就是 `String.length`）。
 *
 * ⚠️ **这是一个判断，不是量出来的转折点**，所以把它单独摆在这儿、写明理由：
 *
 * - ProseMirror 那棵树与它的 DOM 是**整篇**建的，不是按视口建的。约 10 万
 *   字符开始出现可感迟滞，超过 20 万后每次输入都要重排整篇文档。
 * - 20 万**码元**已经远超普通长文，源码模式仍可编辑、搜索、存盘，且不会
 *   产生结构解析与整棵 DOM 重排。
 * - ⚠️ 阈值仍高于"正常长文"：用户可以在「视图」菜单手动切回富文本；自动
 *   降级只负责避免默认进入必然卡顿的模式。
 */
export const largeTextItemThresholdValue = 200_000;

/** 路径的后缀（小写、不带点）。没有后缀、或名字以点开头且没有别的点时给空串。 */
export function extension(path: string): string {
  const name3 = path.split(/[/\\]/).pop() ?? "";
  const point = name3.lastIndexOf(".");
  // ⚠️ `点 <= 0` 一并挡住 `.bashrc` 那种"点开头就是整个名字"的情形：
  // 取出来会得到 `bashrc`，而那是**名字**不是后缀。
  if (point <= 0) return "";
  return name3.slice(point + 1).toLowerCase();
}

/** 名字说是 Markdown 吗。 */
export function isMarkdownExtension(path: string): boolean {
  return mARKDOWNExtension.includes(extension(path));
}

/** 这份文件是什么类型。`text` = 不是 Markdown 的文本（照样能开，只是不按 Markdown 解析）。 */
export type TextItemType = "markdown" | "text";

export function recognizeTextItemType(path: string): TextItemType {
  return isMarkdownExtension(path) ? "markdown" : "text";
}

/** 这份文档太大了吗（`字符数` 是 `String.length`）。 */
export function isLargeTextItem(characterNumber: number): boolean {
  return characterNumber > largeTextItemThresholdValue;
}

/**
 * 该不该**把这份文档按源码模式打开**，该的话是因为哪一条。
 *
 * 返回 `null` = 不用管，按用户设置的模式来。
 *
 * ⚠️ **两条缘由分开返回**，不合成一个布尔：提示条要说清是**哪件事**让它换了
 * 模式。合成一个的话，用户拖一篇 3 MB 的 `.md` 进来，看到的是一句
 * "这不是 Markdown" —— 而它明明是。
 */
export type LowerLevelReason = "text" | "large";

/**
 * ⚠️ `路径` 可以是 `null`，那是"**还没存盘的新文档**"（`Document.path` 就是
 * `string | null`）。它按 Markdown 算——Nota 新建出来的东西**就是**一篇
 * Markdown，名字还没起而已。但**大小那一条照判**：从剪贴板粘一篇 200 万字符的
 * 东西进来，它一样会把编辑器拖垮，跟有没有名字没关系。
 */
export function LowerLevelReason(path: string | null, characterNumber: number): LowerLevelReason | null {
  if (path !== null && recognizeTextItemType(path) === "text") return "text";
  if (isLargeTextItem(characterNumber)) return "large";
  return null;
}

/**
 * 把「用户设的模式」与「这一份文档的降级缘由」合成**实际该用的模式**。
 *
 * ⚠️ 降级**压过用户的设置**，而且三档都压：`split` 右侧那半是一份**只读的
 * Milkdown**（`ui/EditorPane.tsx`），大文件在那上面一样卡；非 Markdown 的
 * 文件在那上面一样被解析错。所以降级之后一律 `source`，不是
 * "把 split 的右半关掉"。
 *
 * ⚠️ 用户**自己**在「视图」菜单里选一次模式，就应当解除这一份的降级
 *（`App.tsx` 里那一段），否则会出现"菜单里 ✓ 在源码上，我点了「所见即所得」，
 * 它纹丝不动"——那是把用户锁在外面。合成本函数时**只管规则**，
 * 解除那一步在调用方。
 */
export function actualMode(preference: ViewMode, reason: LowerLevelReason | null): ViewMode {
  return reason === null ? preference : "source";
}
