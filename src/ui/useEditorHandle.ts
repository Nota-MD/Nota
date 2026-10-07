/**
 * 把编辑器的两个**内部句柄**（主窗格的 `EditorHandle` / `SourceHandle`，分屏
 * 预览的 `EditorHandle`）转发成 `EditorPaneHandle` 交给 `App`——也就是
 * `EditorPane` 那个 `useImperativeHandle`（2026-10-07 从 `ui/EditorPane.tsx`
 * 搬出来的，`docs/07` 第 89 项）。
 *
 * 一句话职责：**外面那 13 条命令怎么落到"当前活着的那两个实例"上**。
 *
 * # 为什么每条都要 `?.` 加兜底值
 *
 * 外面（菜单、快捷键、大纲、工具栏）拿到的是 `EditorPaneHandle`，它在组件
 * 挂载的那一刻就有了——而里面的实例是**异步**建出来的（`createEditor` 是
 * async）。中间那一段窗口里 `handleRef.current` 是 `null`，此时：
 *
 * - 读的给 `undefined` / `null` / `0` / `false`（**"这一侧没做"或"没有"**）；
 * - 写的**什么都不做**。
 *
 * ⚠️ **一律不抛错**。这些方法会从菜单点击、大纲点击、查找条关闭那几条路上
 * 被调到，而那些时刻**常常正好压在"编辑器正在重建"上**（换文档、切模式、
 * 拨了要重建的设置）。抛出去的症状不是"某条命令没生效"，而是**整棵 React
 * 树被带下来**——白屏，而且看不出跟刚才那一下有什么关系。
 *
 * # ⚠️ `setMarkdown` 为什么要连 `最新文本Ref` 一起改
 *
 * 那条路是"整篇替换"（插件改文档、存盘前的强制同步）。`最新文本Ref` 是切模式
 * 时新实例的初始值（见 `EditorPane` 文件头第 1 条），不一起改的话，紧接着切一次
 * 模式就会把**替换前**那一份装回去——用户看到的是"插件刚做的改动被撤掉了"。
 *
 * ⚠️ 预览那一格**顺手也推一把**：分屏右侧那份文本不接 `onChange`（它是显示端，
 * 接了就是回声，见 `EditorPane` 文件头第 2 条），所以整篇替换必须自己推过去，
 * 不然右格会停在被替换之前的内容上。
 */

import { useImperativeHandle, type Ref, type RefObject } from "react";

import type { 选区内容, CommandPayload, EditorCommand, EditorHandle } from "@/editor/create";
import type { FindOptions } from "@/editor/find";
import type { SourceHandle } from "@/editor/source";
import type { EditorPaneHandle } from "@/ui/EditorPane";

/** 这一层要攥着的那几样东西，都是 `EditorPane` 自己的 ref。 */
export interface 句柄接线 {
  /** 外面递进来的那个 `ref`（`Props.ref`）。 */
  ref?: Ref<EditorPaneHandle>;
  /** 主窗格那个实例（源码模式是 `SourceHandle`，见 `editor/create.ts` 文件头）。 */
  主句柄Ref: RefObject<EditorHandle | SourceHandle | null>;
  /** 分屏右侧那个**只读**实例（没分屏时恒 `null`）。 */
  预览句柄Ref: RefObject<EditorHandle | null>;
  /** 「最后一次知道的文本」，见文件头 `setMarkdown` 那一段。 */
  最新文本Ref: RefObject<string>;
}

export function use编辑器句柄({
  ref,
  主句柄Ref,
  预览句柄Ref,
  最新文本Ref,
}: 句柄接线): void {
  // 把 handle 暴露给 App（存盘前要强制同步、插件改文档时整篇替换）。
  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => 主句柄Ref.current?.getMarkdown(),
      setMarkdown: (markdown: string) => {
        最新文本Ref.current = markdown;
        主句柄Ref.current?.setMarkdown(markdown);
        预览句柄Ref.current?.setMarkdown(markdown);
      },
      runCommand: (name: EditorCommand, payload?: CommandPayload) =>
        主句柄Ref.current?.runCommand(name, payload) ?? false,
      // ⚠️ 没 handle 时给 `false`（"这一侧没做"），不是抛错——同 `runCommand`。
      插入在光标处: (text: string) => 主句柄Ref.current?.插入在光标处(text) ?? false,

      // 查找五条**直接转发**给当前那个 handle。⚠️ 没有 handle 时（编辑器
      // 还没建好/已经拆了）给"什么都没做"的安全值，不是抛错——关查找条
      // 恰好发生在编辑器重建的那一瞬间（换文档）时，抛错会把整棵树带下来。
      setFind: (query: string, options: FindOptions) =>
        主句柄Ref.current?.setFind(query, options),
      findStep: (方向: 1 | -1) => 主句柄Ref.current?.findStep(方向),
      clearFind: () => 主句柄Ref.current?.clearFind(),
      replaceCurrent: (text: string) => 主句柄Ref.current?.replaceCurrent(text) ?? false,
      replaceAll: (text: string) => 主句柄Ref.current?.replaceAll(text) ?? 0,
      // ⚠️ 没 handle 时给 `null`（"没有选区"），不是抛错：菜单点下去的那一刻
      // 可能正好在换文档（编辑器重建），抛错会把整棵树带下来。
      选区: (): 选区内容 | null => 主句柄Ref.current?.选区() ?? null,
      // ⚠️ 同一条口径：编辑器还没建好时点大纲，什么都不做，不抛错。
      跳到标题: (目标: { line: number; index: number }) =>
        主句柄Ref.current?.跳到标题(目标),
      focus: () => 主句柄Ref.current?.focus(),
    }),
    // ⚠️ **空依赖是对的**：这一份只会碰上面那三个 ref 的 `.current`，而那三个
    // ref **对象本身**是建一次就不换的（换的是里面的值）。每一条命令在**被调
    // 那一刻**才去读 `.current`，所以句柄不必重建——重建反而会让调用方手里
    // 那份旧引用作废（菜单里存着的就是这个）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
