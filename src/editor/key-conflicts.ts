/**
 * CodeMirror 自带键位里，**与本应用快捷键撞车的那几条**——建编辑器时要摘掉。
 *
 * # 它为什么自己一个文件（2026-10-04 分出来的）
 *
 * 这份名单原来长在 `source.ts` 里，**只有人眼在看**。BUG-58（`Ctrl+U` 下划线
 * 到不了应用）就是漏了一条进来的：名单里有 `Mod-z` / `Mod-y` / `Mod-i` /
 * `Mod-/` / `Shift-Mod-k`，**独独没有 `Mod-u`**，而 CodeMirror 的
 * `historyKeymap` 恰好有一条 `{ key: "Mod-u", run: undoSelection }`。
 * ⚠️ 更阴的是那条还带 `preventDefault: true`——`ui/useMenus.ts` 那条
 * `if (e.defaultPrevented) return;`（BUG-49 的正主）于是把整颗键放行了，
 * 症状是"按下去什么都没发生"（`undoSelection` 在没有选区历史时是空操作），
 * **和"这个功能没做"长得一模一样**。
 *
 * 所以搬出来是为了**能被测试读到**：`tests/key-conflicts.test.ts` 拿
 * CodeMirror 自己那张表反过来查一遍——凡是"CodeMirror 绑了、而本应用菜单
 * 也绑了同一个键位"的，必须在这份名单里。新加一条菜单快捷键、或者升一次
 * `@codemirror/*` 撞出新的一条，那条测试都会响。
 * ⚠️ 它**纯**：不 import CodeMirror、不 import DOM，所以测试里能直接跑。
 *
 * # 为什么会撞，以及为什么"两个都跑"了
 *
 * 本应用的快捷键**不是**在编辑器里发的，而是在 `window` 上收 `keydown`
 * （`ui/useMenus.ts`），**冒泡阶段**——CodeMirror 处理完自己那张表之后
 * 只调 `preventDefault()`，**不 `stopPropagation()`**（`@codemirror/view` 的
 * `runHandlers` 里只认键位自带的 `stopPropagation` 标志，默认那张表一条都没设）。
 * 于是同一次按键**两边都会执行**：CodeMirror 先做它那一件，应用再做自己那一件。
 *
 * ⚠️ **症状都不像"键位坏了"，像"功能自己乱动"**，所以很难被报上来
 * （2026-09-25 在无头 X 上实测到的四条，逐条都复现过）：
 *
 * | 按键 | CodeMirror 干的 | 应用干的 | 用户看到 |
 * |---|---|---|---|
 * | `Ctrl+/` | `toggleComment` | 切源码模式（已经是了，空操作） | 光标那行**被套上一对 `<!-- -->`** |
 * | `Ctrl+I` | `selectParentSyntax` | 斜体 | 选区**先被抢走**，斜体加在了别处 |
 * | `Ctrl+Shift+K` | `deleteLine` | 插入代码块 | **那一行被删掉**，换成一个空代码块 |
 * | `Ctrl+Z` / `Ctrl+Y` | `undo` / `redo` | 撤销 / 重做 | 一次按键**退两步** |
 * | `Ctrl+U` | `undoSelection` | 下划线 | **什么都不发生**（BUG-58，见上） |
 *
 * 前三条里 `Ctrl+/` 最阴：`<!-- 文字 -->` 在所见即所得里**整段渲染成空**，
 * 于是"我按了个视图切换键，那段字不见了"。第四条最常被按到。
 *
 * ⚠️ 最后一条（`Ctrl+U`）**和上面四条不是同一种**：上面四条是"两边都跑"，
 * 它带 `preventDefault`，是"**CodeMirror 一个人跑、应用被放行**"。
 * 两种都要进这份名单，但**查起来的方向相反**——"跑了两遍"看结果，
 * "被放行"只能看 `e.defaultPrevented`（2026-10-04 就是在窗口里打了一句
 * 探针、把它打进 `document.title` 才量出来的）。
 *
 * # 为什么是"摘掉"而不是"改键位"
 *
 * 这几条在**应用侧**都是有来历的（`ui/commands.ts` 那张表：源码模式 / 斜体 /
 * 代码块 / 撤销重做 / 下划线，撤销重做还是通用的肌肉记忆），动不得；
 * CodeMirror 那侧给的是它的通用默认值，本应用并不需要其中的这几条——
 * `toggleComment` 对 Markdown 更是**没有意义**（Markdown 没有注释语法，
 * 它套出来的是 HTML 注释，那不是"注释掉这一行"的语义）。
 *
 * # ⚠️ 故意**没有**摘的两条
 *
 * - `Alt-ArrowUp` / `Alt-ArrowDown`（CodeMirror 的 `moveLineUp` / `moveLineDown`）
 *   看起来和菜单里「编辑 → 上移该行 / 下移该行 `Alt+↑`」撞了，但**那两条在
 *   应用侧还没实现**（`App.tsx` 里没有它们的 handler，菜单上一直是灰的）。
 *   摘了就是**把唯一能用的那份拿掉**。
 *   📌 将来谁把 `edit.moveLineUp` / `edit.moveLineDown` 接上了，**必须回来
 *   把这两条加进 `撞车键位`**——否则那两条会一次移两行。
 * - `Escape`（`simplifySelection`）：应用侧的 `Esc` 不走这张表
 *   （沉浸模式是 `ui/useImmersive.ts` 自己收的），两边不冲突。
 *
 * ⚠️ 键位写法照抄 CodeMirror（`"Shift-Mod-k"`），**不是**菜单那套
 * （`"Ctrl+Shift+K"`）。摘的时候是拿它去 `!撞车键位.has(b.key ?? "")`
 * 比的，所以**必须一模一样**——差一个大小写就静默不摘。
 */
export const 撞车键位 = new Set([
  "Mod-/",
  "Mod-i",
  "Shift-Mod-k",
  "Mod-z",
  "Mod-y",
  // BUG-58：`historyKeymap` 的 `undoSelection`。⚠️ 它是**唯一**一条带
  // `preventDefault: true` 而应用侧又用着同一个键位的，漏了它症状最轻
  //（什么都不发生），所以它躲了整整四个月。
  "Mod-u",
]);

/**
 * 撞了车、但**故意照原样留着**的那几条——"要不要摘"的另一种答案。
 *
 * 它俩单独列出来是为了让 `tests/key-conflicts.test.ts` 能把账做平：那份测试要
 * **每一处撞车都在某一份名单里**（见文件头那张表），否则"漏一条"就查不出来了。
 * 而漏一条的症状正好是 BUG-58 那种——静默失灵，没人看得见。所以宁可在这里写明
 * "这两条是**知道**它撞、**决定**留着"，也不让它们挂着一句不存在的理由。
 *
 * ⚠️ **这两条是临时的**：`App.tsx` 里还没有 `edit.moveLineUp` /
 * `edit.moveLineDown` 的 handler（菜单上是灰的），摘了就是**把唯一能用的那份
 * 拿掉**。谁把它们接上了，就得把这两条从这份名单**挪进 `撞车键位`**——那时
 * CodeMirror 与应用的移动会一次移两行。
 *
 * ⚠️ `Escape`（`simplifySelection`）**不在这份名单里**，因为它压根不算撞车：
 * 菜单里没有 `Esc` 这个 accel（沉浸模式那份是 `ui/useImmersive.ts` 自己收的，
 * 不走菜单表）。文件头记着它，只是提醒"别以为漏了"。
 */
export const 故意不摘: ReadonlySet<string> = new Set(["Alt-ArrowUp", "Alt-ArrowDown"]);
