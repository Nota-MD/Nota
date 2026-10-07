/**
 * `editor/key-conflicts.ts::撞车键位` 的**可运行**判据：源码模式的默认键位
 * 到底有没有把菜单上的快捷键吃掉。
 *
 * # 它是为谁写的（BUG-58，2026-10-04）
 *
 * `Ctrl+U`（下划线）四个月来在**源码模式**里"按下去什么都不发生"。真凶不是
 * 档案里当时猜的那条（`format_keys.rs` 那张表缺 `u`——那一层在真程序里**一次
 * 都没拦到过键**），而是 CodeMirror 的 `historyKeymap` 里有一条
 * `{ key: "Mod-u", run: undoSelection, preventDefault: true }`：
 * 它先跑、还带 `preventDefault`，于是 `ui/useMenus.ts` 那条
 * `if (e.defaultPrevented) return;`（BUG-49 的正主）把整颗键放行了。
 *
 * 那份名单（`撞车键位`）当时是**人手维护**的，而漏一条的症状是"某个快捷键
 * 静默失灵"——不报错、不崩、界面上还写着那颗键。所以这份测试反过来查：
 * **凡是 CodeMirror 绑了、本应用菜单也绑了同一个键位的，必须在名单里**。
 *
 * # 跑法（不装任何包）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/key-conflicts.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-测试/key-conflicts.mjs
 * node /tmp/nota-测试/key-conflicts.mjs
 * ```
 *
 * ⚠️ `--alias:@=./src` 不能省（本文件与 `@/ui/commands`、`@/ui/accel` 都从
 * `@/…` 进）。⚠️ **不需要** `--loader:.svg=text`：这条链上没有一个 svg。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真按一下键会怎么样没验**：这里只比"两张表里的键位文本"。真窗口里的
 *   那一次读数是 `docs/06` §5.47（`Ctrl+U` 在源码模式把 `<u>x</u>` 摘回 `x`）。
 * - **它只认 Linux 那一支**：CodeMirror 的键位可以带 `mac:` / `linux:` 变体，
 *   这里只拿**通用 `key` ＋ `linux:`** 去比（本仓的目检与用户都在 Linux 上）。
 *   mac 上那几条（`Ctrl-l` / `Mod-Shift-u` 之类）不在这份判据的覆盖范围里。
 * - **它管不到"两边都跑"那一类**（`Ctrl+/` 那种：CodeMirror 与 `window` 各自
 *   执行一遍）。那类没有 `preventDefault`，从键位表上看和正常绑定一模一样。
 *   名单里仍然列着它们，是因为它们在**应用侧**也别有用处。
 */

import { defaultKeymap, historyKeymap } from "@codemirror/commands";

import { 撞车键位 } from "@/editor/key-conflicts";
import { accelSig, parseAccel } from "@/ui/accel";
import { MENUS, walkMenuItems } from "@/ui/commands";

let 过 = 0;
let 败 = 0;
const 失败明细: string[] = [];

function 判(条件: boolean, 说明: string) {
  if (条件) {
    过++;
  } else {
    败++;
    失败明细.push(说明);
  }
}

/**
 * CodeMirror 那套写法（`"Shift-Mod-k"`）→ 本仓的键位签名（`"cs-:k"`）。
 *
 * ⚠️ 两个方向都必须**一模一样地**对得上：签名对不上，查出来的"没撞车"是假的。
 * 认不出的修饰键返回 `null`（不静默按"没撞车"处理）。
 *
 * ⚠️ `Mod` 在 CodeMirror 里是"那个平台上的命令键"（Linux 上就是 Ctrl），
 * 而 `ui/accel.ts` 把 `Cmd` / `Meta` / `Super` **一律归到 `ctrl` 这一维**，
 * 所以这里一视同仁——两边同一个约定。
 */
function 码镜键位签名(文本: string): string | null {
  const 段 = 文本.split("-");
  const 名 = 段.pop();
  if (!名) return null;
  let ctrl = false;
  let shift = false;
  let alt = false;
  for (const 一 of 段) {
    switch (一.toLowerCase()) {
      case "mod":
      case "ctrl":
      case "control":
      case "cmd":
      case "meta":
        ctrl = true;
        break;
      case "shift":
        shift = true;
        break;
      case "alt":
        alt = true;
        break;
      default:
        return null;
    }
  }
  return `${ctrl ? "c" : "-"}${shift ? "s" : "-"}${alt ? "a" : "-"}:${名.toLowerCase()}`;
}

/** CodeMirror 那两张表里的全部键位（只取 Linux 上生效的那一支）。 */
function 码镜键位(): string[] {
  const 出: string[] = [];
  for (const 条 of [...defaultKeymap, ...historyKeymap] as Array<{
    key?: string;
    linux?: string;
    mac?: string;
  }>) {
    if (条.key) 出.push(条.key);
    // ⚠️ `linux:` 那一条**替代** `key`（`historyKeymap` 的 `Ctrl-Shift-z` 就是
    // 这种），要一起收——不收的话它在 Linux 上的那一次覆盖就漏掉了。
    if (条.linux) 出.push(条.linux);
  }
  return 出;
}

/** 菜单上真正绑着的键位（含子菜单、含插件那一栏不在此列——那是运行时的）。 */
function 菜单键位(): Map<string, string> {
  const 出 = new Map<string, string>();
  walkMenuItems(MENUS, (项) => {
    if (!项.accel) return;
    const a = parseAccel(项.accel);
    if (!a) return;
    if (!出.has(accelSig(a))) 出.set(accelSig(a), 项.id);
  });
  return 出;
}

// ── 一、承重的那条：撞了就必须在名单里 ────────────────────────────────────

const 菜单 = 菜单键位();
const 码镜 = 码镜键位();

let 撞车数 = 0;
for (const 键 of 码镜) {
  const 签名 = 码镜键位签名(键);
  if (!签名) continue;
  const 菜单项 = 菜单.get(签名);
  if (!菜单项) continue;
  撞车数++;
  判(
    撞车键位.has(键),
    `CodeMirror 的 "${键}" 与菜单项 ${菜单项} 撞了，但它不在 editor/key-conflicts.ts 的` +
      ` 撞车键位 里——源码模式里那颗键会静默失灵（或执行两遍）`,
  );
}

// ⚠️ 这条是"判据本身还能用"的自检：如果哪天 `defaultKeymap` 换了导出形状、
// 或者本仓的菜单表被改成全都不带 `accel`，上面那个循环会**一条都不报**，
// 看着全绿。所以钉住"至少查得到几处真撞车"。
判(撞车数 >= 5, `本该查到至少 5 处真撞车，实际只查到 ${撞车数} 处（判据本身是不是失效了？）`);

// ── 二、反向：名单里不许有死条目 ──────────────────────────────────────────

// 名单比的是 `b.key`，而那串文本来自 CodeMirror。**写错一个字母就静默不摘**
// ——多写一条的代价是"以后 CodeMirror 真绑了它，我们却不摘"，比漏一条轻，
// 但同样是没人看得见的偏差。
for (const 键 of 撞车键位) {
  判(
    码镜.includes(键),
    `名单里的 "${键}" 在 CodeMirror 的 defaultKeymap / historyKeymap 里根本没有——` +
      `要么是拼错了，要么是上游改名了（改完就得跟着改）`,
  );
}

// ── 三、BUG-58 那条单独钉一次 ─────────────────────────────────────────────
//
// ⚠️ 这里原来还有一组"`故意不摘` 里那几条必须**真的**在撞"。2026-10-07
// `Alt-ArrowUp` / `Alt-ArrowDown`（那组唯一的成员）接上了应用侧的实现、
// 挪进 `撞车键位`，于是那份名单撤了、那一组也一起删——**只剩一份名单，
// 没有"例外"这一档**（理由写在 `editor/key-conflicts.ts` 的文件头）。
// 下面这条留着是因为它的报错信息里直接写着"就是 BUG-58 那颗键"，
// 比上面那个循环里的通用文案好认。


// 上面那两条已经覆盖它了，这里再钉一次**指名道姓**的：这条回来的时候，
// 报错信息里会直接写着"就是 BUG-58 那颗键"，不必再去比对两张表。
判(撞车键位.has("Mod-u"), "BUG-58：Mod-u（CodeMirror 的 undoSelection）必须在名单里");
判(
  菜单.get("c--:u") === "fmt.underline",
  "菜单上 c--:u 该是 fmt.underline（下划线）——判据变了的话上面这条也就没意义了",
);

// ── 汇总 ──────────────────────────────────────────────────────────────────

if (失败明细.length) {
  console.log("失败明细：");
  for (const 条 of 失败明细) console.log("  · " + 条);
}
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
