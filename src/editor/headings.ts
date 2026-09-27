/**
 * 从 markdown 正文抽大纲——**标题在哪、第几级、叫什么**。
 *
 * # 为什么在前端用正则扫，而不是问后端要
 *
 * 后端也有 markdown（镜像），但**镜像是去抖的**——打字时它会慢 300ms。
 * 大纲要跟着光标附近的标题实时跳，用那份数据会看到明显的一顿一顿。
 * 前端手里就是最新的文本，扫一遍是 O(行数)，几千行的文档也就微秒级。
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

export interface OutlineItem {
  level: number;
  text: string;
  /** 在正文里的行号（0 起），将来做"点了跳过去"要用。 */
  line: number;
}

export function extractOutline(markdown: string, strict = false): OutlineItem[] {
  const out: OutlineItem[] = [];
  let inFence = false;
  let inFrontMatter = false;

  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // ── front matter：只在文件最开头才算，跳过整段 ──────────────────────
    if (i === 0 && line.trimEnd() === "---") {
      inFrontMatter = true;
      continue;
    }
    const trimmed = line.trimStart();
    if (inFrontMatter) {
      const t = line.trimEnd();
      // 结束条件三条：
      //   ① 收尾的 `---` / `...`（本来就有的那条）；
      //   ② **空行**——YAML front matter 是一串连续的 `key: value`，里面不会
      //      有空行；而"文件头一条 `---` 当分隔线、正文里还有一条 `---`"这种
      //      文档中间是有空行的；
      //   ③ **标题**——`---` 再也没闭合的残缺文件，不该把正文整个吃光。
      // ⚠️ ② 是 **BUG-32** 的正主：原来只认 ①，于是"两条 `---` 之间"整个被当成
      // front matter，正文里的第一个标题连同中间所有段落一条都进不了大纲。
      // 现场是 `/tmp/nota-fixture/words.md`（第 1 行 `---`、第 5 行 `# 字数样张`、
      // 第 11 行又一条 `---`）——大纲整个空着，而后端那边标题是算得出来的。
      if (t === "---" || t === "...") {
        inFrontMatter = false;
        continue; // 收尾这一行本身不是标题
      }
      if (t !== "" && !atxTextRe(strict).test(trimmed)) continue; // 真 front matter 的行
      // ⚠️ 走到这里说明是 ②/③：front matter 到此为止，而**这一行按普通行
      // 继续往下走**（不能 `continue`——那样第 ③ 条里的那个标题正好被吃掉，
      // 又回到 BUG-32 那个症状上）。
      inFrontMatter = false;
    }

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
