/**
 * 从 markdown 正文抽大纲——**标题在哪、第几级、叫什么**。
 *
 * # 为什么在前端用正则扫，而不是问后端要
 *
 * 扫描本身必须是 O(行数) 的轻活：几千行的文档也就微秒级，谁喂文本都不心疼。
 * （后端也有 markdown 镜像，但**镜像是去抖的**——打字时它慢 300ms。）
 *
 * ⚠️ **2026-10-04 把这段理据改对**（`docs/07` 第 32 项）：上面原话是"前端手里
 * 就是最新的文本……用后端那份会一顿一顿"，但**现实是消费者喂的就是去抖镜像**——
 * `App.tsx` 传给侧栏的 `docText` 与状态栏的 `doc.text` 都是 `refreshDocs()` 刷过
 * 的那份（300ms）。当时设想的"大纲跟着光标实时跳"后来并没有做，而真喂实时文本
 * （`latestRef`）就得让整个外壳跟着每次按键重渲染，为一个侧栏列表不值得。
 * **所以这是承认下来的取舍，不是 bug**：大纲与字数最多慢 300ms，换外壳不重渲染。
 * 哪天真要实时，得走"编辑器直改 DOM"那条路，而不是往 React props 里塞实时的串。
 *
 * ⚠️ 这是**启发式**，不是真解析。它认不出 HTML 块里的 `#`、也认不出
 * 缩进代码块（四空格那种）里的 `#`。真解析要过 remark，而为一个侧栏列表
 * 引入完整 AST 不划算。已知误差见 `docs/07`；真出问题时再换 remark。
 *
 * ⚠️ `strict` 是**严格模式**（`Settings.strict_markdown`，默认 `false`）：
 * 宽松（默认）时 `#你好` 也算标题。判据不在本文件里，见 `editor/atx.ts`
 * 的 `atxTextRe`——那份判据要和解析、打字、后端挑标题**一模一样**。
 *
 * # 2026-09-27 从 `ui/outline.ts` 搬过来
 *
 * 原来它和 `countText`（数数）挤在一个文件里，挂在 `ui/` 下。搬家的理由是
 * **依赖方向**：`docs/10` §1 的「目录（TOC）」那条命令要**同一份判据**
 * （见 `editor/toc.ts`），而那条命令在编辑器那一侧——`src/editor/` 里
 * **从来没有任何一处 import `@/ui/`**，反过来 `src/ui/` 到处 import
 * `@/editor/`。为了不改这条方向，只能把判据搬到低的那一层来。
 *
 * ⚠️ 于是**全仓扫标题只有这一处实现**，两个消费者：
 * - `ui/Sidebar.tsx` 的「大纲」页（只读导航）；
 * - `editor/toc.ts` 的「内容目录」（写进正文的那一份）。
 *
 * 两处必须给出同一张表——它们摆在同一个界面上，用户会对。
 */

import { atxTextRe } from "@/editor/atx";
import { frontMatterLineCount } from "@/editor/front-matter";

export interface OutlineItem {
  level: number;
  text: string;
  /** 在正文里的行号（0 起），将来做"点了跳过去"要用。 */
  line: number;
}

export function extractOutline(markdown: string, strict = false): OutlineItem[] {
  const out: OutlineItem[] = [];
  let inFence = false;

  const lines = markdown.split("\n");
  // ── front matter：判据用 `front-matter.ts` 那份**严**的（第 63 项合并）────
  // ⚠️ 以前这里自带一条松判据（"首行 `---`、遇空行/标题/闭栏即止"），与
  // 存盘边界那份各判各的，同一份文件会出现"所见即所得里看不见、大纲却
  // 当正文数"的对不上。合完之后**大纲藏的与编辑器藏的是同一段**；为什么
  // 不用自己再兜"残缺文件"，见 `front-matter.ts` 文件头。跳过的是行**数**，
  // `i` 仍是整篇文档的行号（`line` 字段的口径没有变）。
  const jumpPass = frontMatterLineCount(markdown);
  for (let i = jumpPass; i < lines.length; i++) {
    const line = lines[i]!;

    const trimmed = line.trimStart();

    // ── 围栏代码块：里面的 `#` 是注释，不是标题 ─────────────────────────
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // ── ATX 标题 ────────────────────────────────────────────────────────
    const m = atxTextRe(strict).exec(trimmed);
    if (!m) continue;

    const text = m[2]!.trim().replace(/\s*#+\s*$/, "").trim();
    if (!text) continue;

    out.push({ level: m[1]!.length, text, line: i });
  }

  return out;
}
