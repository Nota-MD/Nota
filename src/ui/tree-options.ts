/**
 * **文件树的口径**：排序档 / 过滤档 / 要不要显示隐藏文件。
 * 2026-09-28 落地，用户原话：「文件树排序（名/创建/修改）」。
 *
 * # 为什么需要这么一个小文件
 *
 * 这三格分散在三处用：`App.tsx`（换工作区时重取）、`ui/useDocuments.ts`
 * （展开子目录、开文件夹）、`ui/Sidebar.tsx`（口径变了要重取整棵树）。
 * 三处各写一遍拼装的话，"哪一格存在设置里、哪一格叫什么名字"就有了三份答案
 * ——而它们对不上的症状是**某一个入口的排序跟别的入口不一样**，
 * 用户点两下才看得出来。
 *
 * # ⚠️ 为什么是"随请求带"而不是"让宿主自己读设置"
 *
 * 设成设置项的那一刻，宿主当然读得到。但那一路是**先写内存、再落盘**的
 * （`ui/settings/panes/props.tsx::paneWriter`），而且写盘是异步的——用户在下拉里
 * 换成"按修改时间"，紧接着发出的那一次 `tree` 请求完全可能赶在设置到达宿主
 * **之前**。那时宿主手里的还是旧档，树**不换**；等下一次别的原因刷新才换。
 * 这种"拨了没反应、过一会儿自己好了"是最难报的一类 bug。
 *
 * 前端把当前口径**跟着请求一起递过去**，就没有这个时间差——这也是宿主那边
 * `TreeOptions` 存在的唯一理由。
 *
 * ⚠️ **逐格回落**：前端只填自己关心的那一格是允许的（宿主那边一格一格地
 * 回落到设置，见 `commands/workspace.rs::口径解析`）。
 */

import type { FileFilter, Settings, TreeSort } from "@/bridge/ipc";

/** 一份齐全的口径。三格都不缺，可以直接拼进请求。 */
export interface TreeMouthPath {
  sort: TreeSort;
  filter: FileFilter;
  showHidden: boolean;
}

/**
 * 设置还没读到（启动那几百毫秒）时用的口径。
 *
 * ⚠️ 三个值**必须与宿主那边 [`Default`] 给出的默认值逐字一致**
 * （`settings/files.rs::Files::default`）：不一致的话，启动瞬间那一次取树
 * 会按这一份来，之后设置到了再按设置来——用户看到的是**树先按一种规则排、
 * 眨一下眼又按另一种规则重排**。
 */
export const fallbackOptions: TreeMouthPath = {
  sort: "name",
  filter: "supported",
  showHidden: false,
};

/**
 * 从当前设置里读出口径。`settings` 还没到（`null`）时给 {@link 缺省口径}。
 *
 * ⚠️ **不要在这里缓存**（比如"设置没变就返回同一个对象"）：这个函数被
 * `useCallback` 的依赖数组看着，返回一个新对象是**它该有的行为**——
 * 缓存反而会让依赖数组判不出变化（见 {@link 口径键}，那个才是给比较用的）。
 */
export function readMouthPath(settings: Settings | null): TreeMouthPath {
  if (!settings) return fallbackOptions;
  return {
    sort: settings.files.tree_sort,
    filter: settings.files.tree_filter,
    showHidden: settings.files.show_hidden,
  };
}

/**
 * 把口径压成一个**能直接比较的字符串**（给 `useEffect` 的依赖数组用）。
 *
 * ⚠️ **不能拿 {@link 读口径} 的返回值当依赖**：那个对象每次渲染都是新的，
 * 依赖它等于每次渲染都重取一遍文件树——展开十几个目录之后每次敲字都在
 * 重取。比字符串没有这个问题。
 */
export function optionKey(mouthPath: TreeMouthPath): string {
  return `${mouthPath.sort}|${mouthPath.filter}|${mouthPath.showHidden}`;
}
