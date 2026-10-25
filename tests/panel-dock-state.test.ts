/**
 * `src/ui/panel-dock-state.ts`（2026-10-10 新建）的可运行测试集。
 *
 * # 跑法（与 `tests/panel-cards.test.ts` 同一套：不装任何包，`esbuild` ＋ `node`）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/panel-dock-state.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-插件栏测试/panel-dock-state.test.mjs
 * node /tmp/nota-插件栏测试/panel-dock-state.test.mjs
 * ```
 *
 * ⚠️ **要 `--alias:@=./src`**：`panel-dock-state.ts` 里那句 `@/ui/panel-nodes`
 * 是 Vite 的别名。⚠️ 这份**不读文件**（除了最后那一组"接线对不对"要读
 * `src/ui/PluginDock.tsx` 的源码文本——本仓没有 jsdom，组件那一层只能这么钉）。
 *
 * # 挡的是什么
 *
 * 用户 2026-10-10 报的「**AI插件运行中关掉插件面板再打开就找不到了**」
 * （`docs/07` 第 111 项）。根因是两件事叠在一起，这份文件把**两半**都钉住：
 *
 * 1. **内容拉不回来的时候也要画得出来**（第一组第三条、第二组）——插件的一条
 *    命令跑着的时候宿主握着 `plugins` 锁，`nota_plugin_panel_content` 拿不到
 *    那把锁，所以"重开面板时那次拉"要等命令整个跑完。那条路上唯一能看见的东西
 *    就是插件正往外吐的文字（`nota.ui.stream` 是**推**的，不走那把锁）。
 * 2. **关掉这一栏不丢账**（第三、四组）——组件被卸载，组件里的 `useState`
 *    全没了，所以那三份凭据住在模块里；而抄进记忆的时候**必须抹掉 `busy`**
 *    （留着的话重开面板是一排永远解不开的灰按钮，没有任何东西会把它解开）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { recordRecall, recordHoldContentTable, startStartPage, thisValuePageDrawWhatWhat, type PanelState } from "../src/ui/panel-dock-state";

/* ── 极小的测试工装（与 `panel-cards.test.ts` 同一套）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function eq(actual: unknown, want: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(want);
  if (a === b) {
    pass++;
  } else {
    fail++;
    failed.push(`${what}\n     想要 [${b}]\n     实得 [${a}]`);
  }
}

/** 一片拉到一半 / 拉到了 / 拉失败的面板。 */
function pullToValueHalf(): PanelState {
  return { state: "loading" };
}
function pullToDone(...text3: string[]): PanelState {
  return {
    state: "ok",
    nodes: text3.map((t) => ({ kind: "text", text: t }) as never),
    busy: null,
  };
}
function pullFailure(speech: string): PanelState {
  return { state: "error", message: speech, busy: null };
}

/** 一份节点里所有的文本（画出来的是这些）。 */
function texts(draw: ReturnType<typeof thisValuePageDrawWhatWhat>): string[] {
  return draw.nodes.map((n) => (n as unknown as { text?: string }).text ?? n.kind);
}

/* ── (1) 三档：正在拉 / 拉到了 / 拉失败了 ────────────────────────── */

{
  const emptyValue = thisValuePageDrawWhatWhat(pullToValueHalf(), "");
  eq(emptyValue.nodes, [], "还在拉、没有流式文字：一个节点都不画");
  eq(emptyValue.notice, "载入", "还在拉：画那句「正在读取…」");
  eq(emptyValue.error, null, "还在拉不算错");
  eq(emptyValue.busy, null, "还没拿到内容，没有 busy 可言");

  const has = thisValuePageDrawWhatWhat(pullToDone("你好", "在的"), "");
  eq(texts(has), ["你好", "在的"], "拉到了：内容是那几条");
  eq(has.notice, null, "有内容就不画提示");
  eq(has.busy, null, "busy 跟着面板状态走");

  const broken = thisValuePageDrawWhatWhat(pullFailure("插件报错了"), "");
  eq(broken.nodes, [], "拉失败：不画任何节点");
  eq(broken.error, "插件报错了", "拉失败：把那句话端出来（不许吞）");
  eq(broken.notice, null, "拉失败时不再说「正在读取…」");

  const assertValueEmpty = thisValuePageDrawWhatWhat(pullToDone(), "");
  eq(assertValueEmpty.nodes, [], "插件这一刻没有内容可显示");
  eq(assertValueEmpty.notice, "空", "空**不是错误**：如实说「这一页现在没东西」");
  eq(assertValueEmpty.error, null, "空也不是错");
}

/* ── (2) ⚠️ 这一组是那条报障的可见那一半：**锁拿不到，也要看得见字** ── */

{
  const draw = thisValuePageDrawWhatWhat(pullToValueHalf(), "正在写…");
  eq(texts(draw), ["正在写…"], "还在拉，但有流式文字 → **先把字画出来**（不许只剩一句「正在读取…」）");
  eq(draw.notice, null, "既然画了字，就不要再叠一句「正在读取…」");
  eq(draw.busy, null, "这一档没有 busy（内容都还没到手）");

  // ⚠️ 对照组：把流式那一支去掉（改回 `态.state === "ok"` 才算数），这条当场红。
  eq(thisValuePageDrawWhatWhat(pullToValueHalf(), "").nodes, [], "（对照）没有流式文字时那一档什么也不画");

  const hasDone = thisValuePageDrawWhatWhat(pullToDone("前情"), "后面这些字");
  eq(texts(hasDone), ["前情", "后面这些字"], "内容已在手里：流式那段**拼在末尾**（位置对）");
  eq(hasDone.notice, null, "有内容就不画提示");

  const emptyButReemits = thisValuePageDrawWhatWhat(pullToDone(), "先吐着");
  eq(emptyButReemits.notice, null, "内容是空的、但正在吐：**不说「没东西」**（明明有字）");
  eq(texts(emptyButReemits), ["先吐着"], "画的就是那段字");

  const brokenButNonEmpty = thisValuePageDrawWhatWhat(pullFailure("炸了"), "半截回答");
  eq(texts(brokenButNonEmpty), [], "⚠️ 拉失败时**不画**流式文字（两句真话叠在一起读不出哪句是真的）");
  eq(brokenButNonEmpty.error, "炸了", "这时只有那句错");
}

/* ── (3) 记忆：关掉再打开时停在哪一页（三态，别用 `??`）────────── */

{
  eq(startStartPage(undefined, ["git/status", "ai/assistant"]), "git/status", "从没选过 → 第一页");
  eq(startStartPage("ai/assistant", ["git/status", "ai/assistant"]), "ai/assistant", "记得的那一页还开着 → 回那一页");
  eq(startStartPage(null, ["git/status"]), null, "⚠️ 用户自己停在「插件」那一页 → 就该回那儿（`??` 会把它顶回第一页）");
  eq(startStartPage(undefined, []), null, "面板清单还没拉回来（启动那一小会儿）→ 「插件」那一页");
  eq(startStartPage("没了的/面板", ["git/status"]), "没了的/面板", "记住的那一页没了也照给（上面那个 effect 会兜底换掉）");
}

/* ── (4) 记忆：抄过去的时候抹掉 `busy`，而且是**另一份对象** ────── */

{
  const handInside: Record<string, PanelState> = {
    "ai/assistant": { state: "ok", nodes: [], busy: "send" },
    "git/status": { state: "error", message: "炸了", busy: "commit" },
    "plugin-x/y": { state: "loading" },
  };
  const save = recordHoldContentTable(handInside);

  eq((save["ai/assistant"] as { busy: string | null }).busy, null,
    "⚠️ `busy` 不进记忆（留着的话重开面板是一排永远解不开的灰按钮）");
  eq((save["git/status"] as { busy: string | null }).busy, null, "失败那一档同样抹掉");
  eq(save["plugin-x/y"], { state: "loading" }, "正在拉的那一档原样带过去");

  eq(save["ai/assistant"] === handInside["ai/assistant"], false, "存的是**新的对象**（不许和组件手上那份共用引用）");
  eq(handInside["ai/assistant"].state === "ok" && handInside["ai/assistant"].busy, "send",
    "对照组：组件手上那份**没有被改**（它还要照着 busy 灰按钮）");

  // 共享引用的坏处：改一处两份一起变——这条钉的是"没有那种共享"。
  (save["ai/assistant"] as { nodes: unknown[] }).nodes.push({ kind: "text", text: "后来加的" } as never);
  eq(handInside["ai/assistant"].state === "ok" && handInside["ai/assistant"].nodes.length, 0,
    "往记忆里塞一条，组件手上那份不受影响");

  const emptyTable = recordHoldContentTable({});
  eq(emptyTable, {}, "空表进、空表出");
  eq(emptyTable === handInside, false, "永远是新的那一份");
}

/* ── (5) 接线：`PluginDock.tsx` 真的用了上面这几样 ───────────────── */

{
  // ⚠️ 本仓没有 jsdom，组件那一层测不了——所以这一组读**源码文本**（先例：
  // `tests/context-menu.test.ts`）。它钉的是"上面那些判据真的接在这一栏上"，
  // 不是重新测一遍判据（判据在前四组）。
  // ⚠️ 路径按**当前工作目录**算（`join("src", …)`），与 `tests/bar-close.test.ts`
  // 同一条口径：这份 bundle 落在 /tmp，`import.meta.url` 指过去就找不着仓库了，
  // 所以**必须在仓库根跑**（跑法见文件头那两行）。
  const source2 = readFileSync(join("src", "ui", "PluginDock.tsx"), "utf8");

  const has = (slice: string, whatWhat: string) => {
    if (source2.includes(slice)) pass++;
    else {
      fail++;
      failed.push(`${whatWhat}\n     源码里找不到 [${slice}]`);
    }
  };

  has(
    "useState<page>(() => startStartPage(recordRecall.current, keys))",
    "① 开起来时停在哪一页：从记忆里捞",
  );
  has(
    "useState<Record<string, PanelState>>(() => recordRecall.contentTable)",
    "② 内容表：从记忆里捞",
  );
  has(
    "useState<Record<string, string>>(() => recordRecall.actualTimeTable)",
    "③ 流式那段字：从记忆里捞",
  );
  has(
    "recordRecall.contentTable = recordHoldContentTable(contentTable)",
    "④ 每变一次抄一份进记忆（抹 busy 那一手在这一句里）",
  );
  has("recordRecall.current = current", "⑤ 当前页也记下来");
  has(
    "const draw = thisValuePageDrawWhatWhat(state2, actualTime);",
    "⑥ 画什么**只走这一个纯函数**（别再在组件里分叉一份）",
  );

  // ⚠️ 反过来的两条：这两句**不许**再出现在组件里，否则就是把判据抄了第二份——
  // 两份一旦漂开，症状是"重开面板那一下又空了"而单测全绿。
  const notAllow = (slice: string, whatWhat: string) => {
    if (source2.includes(slice)) {
      fail++;
      failed.push(`${whatWhat}\n     源码里不该再有 [${slice}]`);
    } else {
      pass++;
    }
  };
  notAllow("态.state === \"ok\" &&", "⑦ 组件里不该再自己拼「只有 ok 才画流式」那条（那是纯函数的事）");
  notAllow("态.state === \"loading\"", "⑧ 组件里不该再自己判断 loading 那一档");
}

/* ── 收工 ───────────────────────────────────────────────────────── */

console.log(`\n插件栏的面板状态（panel-dock-state）：${pass} 条通过、${fail} 条失败`);
for (const m of failed) console.log("  FAIL " + m);
if (fail > 0) process.exit(1);
