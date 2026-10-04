/**
 * 让**窗口标题**跟着当前文档走（第 51 项）。
 *
 * 在这之前标题是 `tauri.conf.json` 里写死的 `"Nota"`——全仓没有一处 `setTitle`。
 * 症状不是"标题不好看"，是**任务栏里几份文档分不出来**、也看不出哪一份有未保存
 * 的改动；用户从任务栏切回来时只能靠猜。
 *
 * # 为什么不写 `document.title`
 *
 * 改 `document.title` **不会**动原生窗口的标题：`tauri.conf.json` 里那个
 * `"title"` 是建窗时交给窗口系统的一份拷贝，WebView 之后怎么改自己的
 * `document.title` 都传不出去。要走 `getCurrentWindow().setTitle()`。
 * ⚠️ 权限已经在 `capabilities/default.json` 里（`core:window:allow-set-title`），
 * 它是**先于**这个功能加进去的——当时写进能力集、却一直没人调，正是第 51 项的
 * "入口等于还没有"。所以这里改的是前端，不必碰能力集。
 *
 * # 标题长什么样
 *
 * `我的笔记 • — Nota`（有未保存改动时多一个 `•`），没开文档就是 `Nota`。
 *
 * ⚠️ 用 `title` 而不是路径的**文件名**：`title` 是后端 `derive_title()` 算出来的
 * （YAML front matter 的 `title:` → 一级标题 → 文件名 → `未命名 N` 四条回退），
 * 和标签栏上写的是**同一个字符串**。改成从 `path` 自己取文件名，就会出现
 * "标签栏写着「我的笔记」、任务栏写着 `note-2026.md`"——同一份文档两个名字。
 *
 * ⚠️ **不截断**长标题：真按字数截会截在一个看不出是截断的地方（用户会以为
 * 标题本身就这么短）。窗口管理器自己会省略，那是它说了算的地方。
 *
 * # 2026-10-04：多一个开关（`appearance.show_filename_in_titlebar`）
 *
 * 关掉之后标题恒为 `Nota`（照 VMark 的窗口版加的，第 45 项）。⚠️ 默认
 * **开着**——就是上面那套一直以来的行为，理由写在 `settings/appearance.rs`
 * 那个字段上（"任务栏里几份文档分不出来"正是第 51 项要治的病）。
 *
 * ⚠️ 这里**只按标志位换一句话**，不另写一份"短标题"的拼法：两处各拼一份，
 * 迟早会出现"开的时候是 `我的笔记 • — Nota`、关一次再开变成别的东西"。
 */

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 没有文档时的标题。和 `tauri.conf.json` 里那个初值保持一致。 */
export const 应用名 = "Nota";

/**
 * 按标题与脏标志拼出该写的窗口标题。**纯函数**，好单独验
 * （`docs/06` 那一套无头流程里，`setTitle` 的结果在截图上读不到文字，
 * 只能靠这一层保证格式）。
 *
 * `带文件名` 为假时只有一个应用名——⚠️ **不拼一个"空标题的短版本"**：
 * 那是另一句话，迟早会漂成 ` — Nota` 这种留着一个破折号的写法。
 */
export function 窗口标题(标题: string | null, 脏: boolean, 带文件名 = true): string {
  if (!标题 || !带文件名) return 应用名;
  return `${标题}${脏 ? " •" : ""} — ${应用名}`;
}

/**
 * 盯住当前文档，把窗口标题写过去。`标题` 为 `null` 表示没开文档。
 *
 * ⚠️ **不弹错误提示**：这条 effect 不是用户发起的动作，`setTitle` 失败
 * （窗口还没建好、已经没了）时报错也无从补救，弹出来只是多一条关不掉的信息
 * ——和 `useImmersive.ts` 里 `同步全屏` 那条同一个口径。
 */
export function useWindowTitle(
  标题: string | null,
  脏: boolean,
  带文件名 = true,
): void {
  useEffect(() => {
    void getCurrentWindow()
      .setTitle(窗口标题(标题, 脏, 带文件名))
      .catch(() => {
        // 见上面那段：静默。
      });
  }, [标题, 脏, 带文件名]);
}
