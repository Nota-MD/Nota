/**
 * **文档的生命周期**：打开 / 新建 / 存盘 / 关闭 / 从磁盘重载 / 切页与自动保存
 *（2026-09-25 从 `App.tsx` 搬出）。
 *
 * # 为什么搬
 *
 * 搬之前 `App.tsx` 是 **998 行**，离 `.tsx` 的硬上限（1000，见 `AGENTS.md` §0.4）
 * 只剩两行——也就是下一处改动必然越线。搬走的是**一整块职责**（不是"为了少
 * 几行"）：这五件事回答的都是同一个问题——**磁盘上那份文件和用户手里这份之间
 * 怎么互相覆盖**。存盘、丢弃、重载都在这条线上，摆在一起才看得出它们的先后
 * 与各自的围栏；散在外壳文件里的时候，`App.tsx` 里那堆"打开 / 新建 / 保存"
 * 和文档表、活动文档、工作区、设置混在一起，读的人得自己把这几条拣出来。
 *
 * # ⚠️ 这一块里最要紧的三条（都是踩过的）
 *
 * 1. **`saveDoc` 的返回值必须被看**（见那条的注释）——它给的 `false` 是
 *    "什么都没写"，"保存并关闭"照关就是把用户的文件换成旧的；
 * 2. **`openPath` 必须待在本文件里 `useDocuments` 的返回对象上**，而它的
 *    使用方（`App.tsx` 的启动 effect）在**下面**——`useCallback` 的依赖数组
 *    在渲染时求值，顺序错了就是 `Cannot access 'openPath' before initialization`
 *    → 白屏。这条在 `App.tsx` 里待了一整天，2026-09-25 原样带过来。
 *    ⚠️ 同一条规矩现在也管着**函数之间**的顺序：`saveDoc` 被 `切换文档` 用、
 *    `切换文档` 被 `openPath` 用，所以它们按这个次序排（2026-09-25 加自动保存
 *    时把 `saveDoc` 从文件中间**往前提**了）。
 * 3. **切页一律走 `切换文档`，不要直接 `setActiveId`**——`closeDoc` 那处例外
 *    有它自己的理由（写在那一行旁边）。理由不是风格：绕过去那条路会把
 *    "先同步编辑器再写盘"读到**另一份文档的正文**。
 * 4. **从本文件出去的函数要"身份稳"**，尤其是 `openPath`：`App.tsx` 的启动
 *    effect 把它挂在依赖数组里（"命令行文件只开一次"就是这么实现的）。而
 *    `refreshDocs()` 每次都给一个**新数组**，所以凡是捕获 `docs` 的函数，
 *    身份都会跟着刷新——一旦这个抖动传到 `openPath` 上，启动 effect 就会
 *    反复重跑。**要读列表就用上面那个 `docsRef`，别闭包捕获。**
 *    （2026-09-25 加自动保存时踩过，现场是"新建文档后活动标签跳回原文件"。）
 *
 * # 自动保存（2026-09-25 接线）
 *
 * 两档各在一个地方：`autosave_seconds`（停笔 N 秒）在 `ui/useAutosave.ts`，
 * `autosave_on_switch`（切页前先存）在下面 `切换文档` 里。两档都走同一个
 * `saveDoc`，所以"手动存"和"自动存"写出来的字节完全一样。
 */

import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { api, type DocId, type Document, type Settings, type TreeNode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import { useAutosave } from "@/ui/useAutosave";
import type { Dialogs } from "@/ui/useDialogs";
import type { Toast } from "@/ui/Toasts";

export interface 文档接线 {
  /** 打开的文档列表（`App.tsx` 的 `docs`）。**读的是当前这一份快照。** */
  docs: readonly Document[];
  /** 活动文档 id。⚠️ 用 `setActiveId`，不是"打开完就完了"——界面要跟着翻页。 */
  setActiveId: (id: DocId | null) => void;
  /** 活动文档 id 的 **ref 快照**。⚠️ `reloadDoc` 用它判"这份是不是正显示着那个"。 */
  activeIdRef: RefObject<DocId | null>;
  /** 重新拉文档列表，返回新列表（`App.tsx` 的 `refreshDocs`）。 */
  refreshDocs: () => Promise<Document[]>;
  setWorkspace: (path: string | null) => void;
  setTree: (tree: TreeNode[]) => void;
  editorRef: RefObject<EditorPaneHandle | null>;
  /** 当前设置。⚠️ 只有 `confirm_unsaved` 用得上（关文档前问不问）。 */
  settings: Settings | null;
  toast: (message: string, level?: Toast["level"]) => void;
  /** ⚠️ 类型**从 `useDialogs` 借**，不在这里另写一份。 */
  askConfirm: Dialogs["askConfirm"];
  /** 同上：重命名要先问一个新名字。 */
  askPrompt: Dialogs["askPrompt"];
}

export interface 文档出口 {
  /**
   * 打开一份**磁盘上已有**的文档：对话框、文件树、命令行参数都走这里。
   *
   * **返回值是"开上了没有"**（2026-09-27 起）：`false` 时错误提示条**已经弹过**
   * 了。加这个返回值是为了「最近文件」那一条路——点一条已经不存在的记录时，
   * 界面得知道该把那一行摘掉（见 `ui/useSession.ts::打开最近`），而"打开失败"
   * 这件事原先只以一条提示条的形式存在过，调用方无从判断。
   *
   * ⚠️ **它排在这个返回对象的第一位是有意的**：`App.tsx` 的启动 effect
   *（在下方）要用它，而那个 effect 的依赖数组在渲染时求值——顺序错了就是白屏
   *（见文件头第 2 条）。
   */
  openPath: (path: string) => Promise<boolean>;
  /** 新建一份空文档并切过去。 */
  newDoc: () => Promise<void>;
  /** 打开对话框 → `openPath`。 */
  openViaDialog: () => Promise<void>;
  /**
   * 把一个文件夹当工作区。
   *
   * ⚠️ **不给路径就弹对话框**（工具栏那颗按钮走这条）；**给了路径就直接开**
   * ——拖放那条路（`ui/useFileDrop.ts`）用得上：拖进来的那个文件夹路径已经在
   * 手上了，再弹一个"请选择文件夹"的对话框等于让用户重做一遍他刚做完的事。
   *
   * ⚠️ 不给默认值 `""` 这种"空串当没有"的写法：`""` 是一个**合法**的路径
   * （相对路径里的当前目录），拿它当哨兵会在某个 cwd 下变成"打开了当前目录"
   * 这个真实的副作用。用 `undefined` 区分"没说"和"说了个空的"。
   */
  openFolder: (path?: string) => Promise<void>;
  /** 侧栏展开子目录时按需取一层（`depth = 1`）。 */
  loadDir: (subPath: string) => Promise<TreeNode[]>;
  /** 存盘。**返回值是"存上了没有"**（见下面那条注释）。`quiet` 见 `saveDoc`。 */
  saveDoc: (id: DocId, forceDialog?: boolean, quiet?: boolean) => Promise<boolean>;
  /**
   * 切到另一份文档。**界面上的切换一律走这里**，不要直接调 `setActiveId`——
   * 「切换文件时自动保存」要赶在编辑器换人**之前**把上一份写盘（见下面那段）。
   */
  切换文档: (id: DocId | null) => Promise<void>;
  /** 记一次"用户在打字"（自动保存的停笔判据）。接到 `EditorPane` 的 `onActivity` 上。 */
  记活动: () => void;
  /** 关掉一份文档。有未保存改动时先问，三个答案见 `useDialogs`。 */
  closeDoc: (id: DocId) => Promise<void>;
  /** 从磁盘重新载入（丢弃内存里的改动）。 */
  reloadDoc: (id: DocId) => Promise<void>;
  /** **重命名**：同一个目录下换个名字（盘上的文件真的跟着改名）。 */
  renameDoc: (id: DocId) => Promise<void>;
  /** **移动**：挪到另一个目录里（文件名不变）。 */
  moveDoc: (id: DocId) => Promise<void>;
}

export function useDocuments(w: 文档接线): 文档出口 {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const {
    docs,
    setActiveId,
    activeIdRef,
    refreshDocs,
    setWorkspace,
    setTree,
    editorRef,
    settings,
    toast,
    askConfirm,
    askPrompt,
  } = w;

  /**
   * 文档列表的 **ref 快照**。给 `saveDoc` / `切换文档` 查表用，**不进依赖数组**。
   *
   * ⚠️ 这两处**不能直接闭包捕获 `docs`**，理由不是"省一次重建"，是**在下面
   * `openPath` 那条**：`refreshDocs()`（App 里是空依赖 `useCallback`）每次都
   * `setDocs(新数组)`，捕获 `docs` 的函数身份就每次都变，而 `openPath` 捕获它、
   * `App.tsx` 的启动 effect 又捕获 `openPath`——那条链条一旦传上去，
   * **启动 effect 会在每次刷新文档列表时重跑一次，把命令行给的那份文件反复
   * 重新打开**。2026-09-25 加自动保存时真踩了：点「新建」新标签出来了、
   * 活动标签却仍旧跳回原来那份（`App.tsx` 启动 effect 旁边那句"只跑一次"
   * 的注释就是这条约定）。
   *
   * ⚠️ 用 ref 换来的另一个好处是**更新**不是更旧：`openPath` 里
   * `await api.doc.open()` / `await refreshDocs()` 之后才轮到 `切换文档`，
   * 那时列表里已经有新文档了——闭包捕获的旧数组里反而没有。
   */
  const docsRef = useRef(docs);
  docsRef.current = docs;

  /**
   * 存盘。**返回值是"存上了没有"**：
   * `false` 有三种情况——文档已经不在列表里、另存为被用户取消、写盘报错或同步失败。
   *
   * ⚠️ **调用方必须看它**，不能像以前那样 `void saveDoc(...)` 了事。以前返回值
   * 是 `void` 时无所谓（菜单点完就完了），但「保存并关闭」那条路上，"没存上"
   * 和"存上了"的后果差着一整个文件的内容：失败还照关，用户以为存住了，
   * 而文件里是旧的。界面上那句 `已保存到 …` 的提示也会跟着变成假话。
   * 菜单那两处 `.void` 依然可以——它们没有后续动作。
   *
   * ⚠️ **本函数排在这儿（`openPath` 之前）是被"切页前先存"拉上来的**：
   * `切换文档` 要用它，而 `openPath` / `newDoc` 又要用 `切换文档`——
   * `useCallback` 的依赖数组在渲染时求值，顺序反了就是
   * `Cannot access 'saveDoc' before initialization`（整页白屏）。
   *
   * ⚠️ **依赖数组里没有 `docs`，这是有意的、且是承重的**（见上面 `docsRef`）。
   * 想加回去之前，先看一眼 `App.tsx` 启动 effect 的依赖数组。
   */
  const saveDoc = useCallback(
    async (id: DocId, forceDialog = false, quiet = false): Promise<boolean> => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) return false;

      let target: string | undefined;
      if (forceDialog || !doc.path) {
        const picked = await saveDialog({
          title: t("保存为"),
          defaultPath: doc.path ?? `${doc.title}.md`,
          filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }],
        });
        if (!picked) return false; // 用户取消了，不是错误——但确实没存上
        target = picked;
      }

      try {
        // 存盘前**强制同步一次**——镜像可能还差最后几次击键
        //（见 document/mod.rs 顶上那段"代价与对策"）。
        const text = editorRef.current?.getMarkdown();
        if (text !== undefined) await api.doc.sync(id, text);

        const written = await api.doc.save(id, target);
        await refreshDocs();
        // ⚠️ `quiet` 只管**这条提示**，写盘一个字不差。自动保存用它：
        // 一次成功存盘没什么可报的（用户没按过任何键），每 30 秒弹一次
        // 「已保存到 …」反而把别的提示挤掉。**失败那一条不静音**——
        // 存不上是必须当场知道的事。
        if (!quiet) toast(t("已保存到 {0}", written), "success");
        return true;
      } catch (e) {
        toast(String(e), "error");
        return false;
      }
    },
    [editorRef, refreshDocs, toast],
  );

  /** 「切换文件时自动保存」这一档开着没有。 */
  const 切页前先存 = settings?.files.autosave_on_switch ?? false;

  /**
   * 切到另一份文档。
   *
   * ⚠️⚠️ **"切页前先存"必须发生在 `setActiveId` 之前，这一步是有硬理由的**：
   * 编辑器实例按文档挂着（`<EditorPane key={activeDoc.id}>`），`setActiveId`
   * 一渲染，活着的那个实例就换成**新文档**的了。而 `saveDoc` 的第一步是
   * "从编辑器强制同步一次"——那一读会读到**新文档的正文**，再拿它去写
   * **旧文档的路径**，两个文件的正文就此互换。这不是"少存一次"，是**写坏文件**。
   * 所以这里先存、后切，顺序不能反。
   *
   * ⚠️ 另一条路（改成监听 `activeId` 变化的 effect）做不到这件事：
   * effect 跑在提交之后，那时编辑器已经换人了。
   *
   * ⚠️ **依赖数组里没有 `docs`，理由同 `saveDoc`**（见 `docsRef`）——
   * 这一条比 `saveDoc` 那条更要紧：`openPath` 直接捕获本函数。
   */
  const 切换文档 = useCallback(
    async (id: DocId | null) => {
      const 当前 = activeIdRef.current;
      if (切页前先存 && 当前 !== null && 当前 !== id) {
        const doc = docsRef.current.find((d) => d.id === 当前);
        if (doc?.dirty && doc.path) await saveDoc(当前, false, true);
      }
      setActiveId(id);
    },
    [切页前先存, activeIdRef, saveDoc, setActiveId],
  );

  /**
   * 打开一份文档。**返回值是"开上了没有"**（`false` 时提示条已经弹过了）。
   *
   * ⚠️ 本函数**必须在 `App.tsx` 的启动 effect 之前**被调用（它是那个 effect
   * 的依赖），所以 `useDocuments` 这个 hook 也要在那边之前调用。
   */
  const openPath = useCallback(
    async (path: string) => {
      try {
        const id = await api.doc.open(path);
        await refreshDocs();
        await 切换文档(id);
        return true;
      } catch (e) {
        toast(String(e), "error");
        return false;
      }
    },
    [refreshDocs, 切换文档, toast],
  );

  /**
   * 侧栏展开某个子目录时**按需**取它那一层（`depth = 1`）。
   *
   * ⚠️ 传的是**相对工作区**的路径——后端 `sub_path` 就是这个口径，而且它
   * 会再过一遍 `resolve_in` 的围栏（那个参数从前端来，不假定干净）。
   * ⚠️ 不要把 `depth` 调大去"一次多取几层"：几万个文件的仓库那样会在
   * 打开工作区时卡住界面，`commands/workspace.rs` 顶上写着这条取舍。
   */
  const loadDir = useCallback((subPath: string) => api.workspace.tree(subPath, 1), []);

  const newDoc = useCallback(async () => {
    try {
      const id = await api.doc.create();
      await refreshDocs();
      await 切换文档(id);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [refreshDocs, 切换文档, toast]);

  const openViaDialog = useCallback(async () => {
    const picked = await openDialog({
      title: t("打开"),
      multiple: false,
      // ⚠️ 这张表要和后端 `is_markdown()` 对齐。它认 `.mdx`，这里漏掉的话
      // 文件**打得开**（拖进来、从文件树点），只是在对话框里筛不出来，
      // 用户会以为打不开（backlog 第 28 项）。
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx", "mdown", "mkd", "txt"] },
      ],
    });
    if (typeof picked === "string") await openPath(picked);
  }, [openPath]);

  const openFolder = useCallback(
    async (path?: string) => {
      // ⚠️ 有路径就直接开（拖放那条路），没路径才弹对话框（工具栏那条）。
      let picked = path;
      if (picked === undefined) {
        const 选的 = await openDialog({ title: t("打开文件夹"), directory: true });
        if (typeof 选的 !== "string") return;
        picked = 选的;
      }
      try {
        const canonical = await api.workspace.open(picked);
        setWorkspace(canonical);
        setTree(await api.workspace.tree(undefined, 1));
      } catch (e) {
        // ⚠️ 消息里带上目录名：拖放那条路走的是**用户没挑过**的路径，
        // 只说"不是目录 / 没有权限"他不知道自己拖的是什么了。
        toast(String(e), "error");
      }
    },
    [setTree, setWorkspace, t, toast],
  );

  const closeDoc = useCallback(
    async (id: DocId) => {
      const doc = docs.find((d) => d.id === id);
      if (doc?.dirty && settings?.confirm_unsaved) {
        // ⚠️ 这里三个按钮上的字（`extraLabel` / `confirmLabel`）都是**给用户看的
        // 文案**，`ConfirmDialog` 原样画出来；回来的 `answer` 是 `"cancel"` /
        // `"extra"` / `"confirm"` 三个**固定的值**，与那几句文案无关——所以文案
        // 翻不翻都不影响下面那两个比较。
        const answer = await askConfirm({
          title: t("有未保存的改动"),
          message: t("「{0}」还没存盘，关掉这份改动就没了。", doc.title),
          // 三条路：存了再关 / 不关 / 丢掉并关。中间那条是 2026-09-25 补的，
          // 之前用户只能自己先按一次 Ctrl+S 再回来关。
          extraLabel: t("保存并关闭"),
          confirmLabel: t("丢弃并关闭"),
          danger: true,
        });
        if (answer === "cancel") return;
        // ⚠️ **存不上就不许关**。`saveDoc` 给 `false` 的三种情况里有两种是
        // "什么都没写"（另存为被取消、写盘报错），这里照关就等于把「保存并关闭」
        // 偷偷降级成「丢弃并关闭」——用户以为存住了，文件里却是旧的。
        if (answer === "extra" && !(await saveDoc(id))) return;
      }
      try {
        await api.doc.close(id);
        const list = await refreshDocs();
        // ⚠️ **这里故意不绕 `切换文档`**：上面那段已经把"这份脏不脏"问过一遍了，
        // 三个答案都在那儿处理完了。再经过一次"切页前先存"的话，用户刚选的
        // 「丢弃并关闭」会被它**反手存回盘上**——那正是用户明确拒绝的事。
        setActiveId(list.length ? list[list.length - 1]!.id : null);
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [docs, settings, refreshDocs, setActiveId, toast, askConfirm, saveDoc],
  );

  /**
   * 现在是不是所见即所得那一档。⚠️ 与 `App.tsx` 那条 `viewMode` **同一个口径**
   *（`?? "wysiwyg"` 那个兜底也一样）：认领只在这一档发生，见下面 `reloadDoc`。
   *
   * ⚠️ 单独拎成一个布尔再进依赖数组，不是图好看：`settings` 每次刷新设置都换
   * 一个新对象，直接依赖它会让 `reloadDoc` 的身份跟着抖（本文件头第 4 条讲的就是
   * 这类抖动的代价）。
   */
  const 所见即所得 = (settings?.view_mode ?? "wysiwyg") === "wysiwyg";

  const reloadDoc = useCallback(
    async (id: DocId) => {
      // ⚠️ **先把编辑器里那几次还没推上去的击键推给后端**（与 `saveDoc` 开头同一句、
      // 同一个理由：镜像可能还差最后几次击键，见 `document/mod.rs` 顶上那段）。
      // 不做的话这里有个**真实的空洞**：用户在 300ms 去抖窗口里打完字就点「从磁盘
      // 重新加载」，后端的 `dirty` 还是上一轮的值（多数时候是 `false`）——那句
      // 「有未保存的改动」**根本不弹**，紧接着的 `setMarkdown` 把刚打的几个字抹掉，
      // 而屏幕上一个提示都没有。（`docs/07` §4 里记着这个现象：重载"点下去什么都
      // 不变、也没有提示"，当时没去查实现、也没登记成 BUG。）
      //
      // ⚠️ 判脏读的是**刚刷回来的那份列表**（`refreshDocs()` 的返回值），不是渲染
      // 时闭包抓住的 `docs`——同步刚推上去的改动只有在刷新之后才看得见。
      // ⚠️ 同步失败不上报错条、也不中断：按后端手里那份判脏，最坏的结果是少问一句。
      let 列表 = docsRef.current;
      if (id === activeIdRef.current) {
        const 手头 = editorRef.current?.getMarkdown();
        if (手头 !== undefined) {
          try {
            await api.doc.sync(id, 手头);
          } catch (e) {
            console.warn("[nota] 重载前同步文本失败：", e);
          }
          列表 = await refreshDocs();
        }
      }
      if (列表.find((d) => d.id === id)?.dirty) {
        // ⚠️ 这里**不给** `extraLabel`：重载的语义就是"以磁盘上那份为准"，
        // "先存再重载"等于什么都没做（存下去的正是要丢掉的那份）。
        const answer = await askConfirm({
          title: t("有未保存的改动"),
          message: t("从磁盘重新加载会丢掉当前的改动。"),
          confirmLabel: t("丢弃并重新加载"),
          danger: true,
        });
        if (answer !== "confirm") return;
      }
      try {
        const fresh = await api.doc.reload(id);
        // 只有它正显示着才需要动编辑器——编辑器一次只挂一份（见 App 的 key）。
        if (id === activeIdRef.current) {
          const 编辑器 = editorRef.current;
          编辑器?.setMarkdown(fresh.text);
          // ⚠️ **重载之后要认领一次**（`api.doc.settle`），跟 `EditorPane` 装载完
          // 那一段是同一件事、同一套判据。不做的症状（2026-09-26 目检抓到的）：
          // `nota_doc_reload` 把**磁盘原文**记成 `clean_text`，而编辑器手里那份是
          // 它**规范化之后**的（`|---|---|` 排成 `| - | - |`、末尾补一个空行）——
          // 两者不等，`refreshDocs()` 读回来的 `dirty` 就是 `true`。于是状态栏凭空
          // 显示「已修改」，用户顺手按一下 Ctrl+S 还会把这份谁都没改过的文件重写
          // 一遍（字节真变了）。
          //
          // ⚠️ 三条围栏都与 `EditorPane` 那边一一对应，别只抄一半：
          //   1. **只认领所见即所得**——源码模式（以及分屏里可编辑的那半）是
          //      CodeMirror，原样进原样出，`getMarkdown()` 就等于 `fresh.text`；
          //      判据留在这一处，是为了"哪些模式参与认领"只有一句话；
          //   2. **只在真的有差别时认领**——没差别还去认领，等于每次重载都往后端
          //      多写一次状态（`settle` 落的是后端的库，不动磁盘上的文件）；
          //   3. **认领失败不该挡住重载**——最坏的结果是脏标记虚报一次，所以下面
          //      单独 try 住、只 `console.warn`，不上报错条也不跳过后面的刷新。
          if (所见即所得) {
            const 规范化 = 编辑器?.getMarkdown();
            if (规范化 !== undefined && 规范化 !== fresh.text) {
              try {
                await api.doc.settle(id, 规范化);
              } catch (e) {
                console.warn("[nota] 重载后认领文本失败：", e);
              }
            }
          }
        }
        await refreshDocs();
      } catch (e) {
        toast(String(e), "error");
      }
    },
    // ⚠️ 依赖数组里没有 `docs`（2026-09-26 起）：判脏读的是 `docsRef` 与刚刷回来的
    // 那份列表，理由与 `saveDoc` / `切换文档` 完全相同（见文件头第 4 条 + `docsRef`）。
    [activeIdRef, editorRef, askConfirm, refreshDocs, toast, 所见即所得],
  );

  /**
   * **重命名**：同一个目录下换个名字。
   *
   * ⚠️ 交给宿主的只有**名字那一段**，不是整条路径（见
   * `commands/document.rs::nota_doc_rename` 顶上那两条理由）：手里这条
   * `doc.path` 是**有损**的（非 UTF-8 的目录名会变成 `?`），拿它拼新路径会把
   * 文件挪进一个新造出来的目录里。下面取最后一段**只是为了预填输入框**——
   * 就算目录名真被有损过，文件名那一段也还是准的。
   *
   * ⚠️ **改名前不存盘**：改名一个字节的内容都不动，所以带着未保存改动的文档
   * 改完名之后，脏的还是脏（`clean_text` 对应的那份内容现在挂在新路径上，
   * 关系没变），下次存盘自然写到新路径。这里多存一次是"用户没要求的写盘"。
   */
  const renameDoc = useCallback(
    async (id: DocId) => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) return;
      if (!doc.path) {
        // 与后端 `老路径` 那条错误同一句话——两条路（菜单/后端）说同一件事。
        toast(t("这份文档还没存过盘，先用「保存为」给它一个位置"), "error");
        return;
      }
      const 当前名 = doc.path.split("/").pop() ?? doc.path;
      const 答 = await askPrompt({
        title: t("重命名"),
        label: t("新名字"),
        initial: 当前名,
        confirmLabel: t("重命名"),
      });
      if (!答) return; // 取消
      const 新名 = 答.value.trim();
      // ⚠️ 名字没变就**不惊动磁盘**：宿主的改名是"绝不覆盖"的，同一个名字撞上
      // 自己那条判据（`同一个文件`）虽然放行，但没必要先把「最近」和列宽
      // 搬一遍再回来。这里挡掉，用户顺手按回车也不会多出一次写盘。
      if (新名 === 当前名) return;
      try {
        await api.doc.rename(id, 新名);
        // ⚠️ 刷列表这一步是**监视基准**跟着走的关键：前端重报"现在开着哪些
        // 文档"时按新路径去盘上读基准（见 `useExternalChanges` 与
        // `commands/document.rs::挪过去` 那段）。
        await refreshDocs();
        toast(t("已重命名为「{0}」", 新名), "success");
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [askPrompt, refreshDocs, t, toast],
  );

  /**
   * **移动**：挪到另一个目录里，文件名不变。
   *
   * ⚠️ 用目录选择框而不是让用户敲路径——敲路径那条路会绕开"这段路径到底存不
   * 存在"，而宿主那边的判据是"目标那一层目录会建出来"（`file_move.rs`），
   * 于是打错一个字母就会**静默造出一个新目录**，用户下次找不到自己的文件。
   */
  const moveDoc = useCallback(
    async (id: DocId) => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) return;
      if (!doc.path) {
        toast(t("这份文档还没存过盘，先用「保存为」给它一个位置"), "error");
        return;
      }
      const 选的 = await openDialog({ title: t("移动到…"), directory: true });
      if (typeof 选的 !== "string") return;
      try {
        await api.doc.move(id, 选的);
        await refreshDocs();
        toast(t("已移动到「{0}」", 选的), "success");
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [refreshDocs, t, toast],
  );

  /**
   * 自动保存的定时那一半（`autosave_on_switch` 那半在 `切换文档` 里）。
   *
   * ⚠️ 它**排在最末尾**是有意的：`saveDoc` 要先定义好。hooks 的顺序不能有条件，
   * 所以这个调用本身不能在 `if` 里——"关着"这件事由 `seconds = 0` 传进去，
   * 由那个 hook 自己决定挂不挂定时器。
   *
   * ⚠️ 传进去的存盘**必须走 `quiet`**：理由见 `saveDoc` 那段。这里包一层
   * 箭头函数是给它**固定住参数**（hook 里只认 `(id) => Promise`）。
   */
  const 记活动 = useAutosave({
    seconds: settings?.autosave_seconds ?? 0,
    docs,
    activeIdRef,
    saveDoc: (id) => saveDoc(id, false, true),
  });

  return {
    openPath,
    newDoc,
    openViaDialog,
    openFolder,
    loadDir,
    saveDoc,
    切换文档,
    记活动,
    closeDoc,
    reloadDoc,
    renameDoc,
    moveDoc,
  };
}
