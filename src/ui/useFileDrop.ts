/**
 * **拖进窗口的东西该干什么**（2026-09-27）。
 *
 * # 它是窗口级拖放的**唯一订阅者**
 *
 * 图片那条路原先自己订了一次 `onDragDropEvent`（见 `ui/useImageInsert.ts`
 * 文件头的"搬走了"那一段）。两条订阅同时在跑的话，拖一张图进来会被处理
 * **两次**——插两张。所以这一份收拢：**分类在这里，动作派出去**。
 *
 *   拖进来的东西 → `api.pathKind` 问清"是什么" → 按下表分派
 *
 * | 拖进来的是 | 谁的动作 | 判据（设置） |
 * |---|---|---|
 * | 文件夹 | 当工作区打开 | `files.drop_folder` |
 * | 图片 | `落一张`（插到光标） | ⚠️ **没有设置**，见下 |
 * | Markdown / 纯文本 | 当文档打开 | `files.drop_markdown` |
 * | 别的文件 | 按"可导入"办 | `files.drop_importable` |
 *
 * ⚠️ **图片这一支不看设置**（这是有意的，而且要在设置页里说清楚）：
 * 「拖放图片进正文」是一个**已经独立存在**的功能（第 66 项附近那一格），
 * 而 `drop_importable` 问的是"陌生文件怎么办"。图片不是陌生文件——它有一个
 * 明确的归宿（正文里的一个 `![]()`）。让 `drop_importable = ignore` 把插图
 * 也一起关掉，症状是"用户明明把图片拖进来了，什么都没发生，而设置页里那句话
 * 说的是别的东西"。
 *
 * # ⚠️ 为什么分类走宿主（`api.pathKind`），不靠后缀猜
 *
 * `notes.md` 可以是一个**目录**的名字，而没有后缀的普通文件也多得是。
 * 猜错的症状是"拖一个文件夹进来，它去当文档打开，然后弹一个红色的错"。
 * 前端够不着 `metadata`（没开 `plugin-fs` 的权限，见 `commands/path_kind.rs`）。
 *
 * # ⚠️ "一次拖好几个"的分工
 *
 * - **文件**：**全部**处理（一次拖十篇 Markdown 进来是想全开，不是想开第一份）。
 *   上限 `一次最多`，超出的**如实说一句还差几个**——不说的话用户会以为
 *   剩下的几篇打不开。
 * - **文件夹**：**只认第一个**。工作区同时只能有一个（`api.workspace.open`
 *   就是把当前那个换掉），开两个等于把第一个悄悄关了。
 * - **图片**：**只认第一个**（同 `ui/useImageInsert.ts` 的老口径：插一串图片
 *   用户还得再一张张删，而"这几张都要插"是更少见的诉求）。
 *
 * # ⚠️ 没有"拖到窗口哪一块"这回事
 *
 * Tauri 的拖放事件只给屏幕坐标，没有"落在哪个元素上"（`ui/useImageInsert.ts`
 * 文件头写过这条）。所以插入点一律是**当前光标**，而"焦点在编辑区"是
 * "用户此刻正在这里编辑"最接近的判据——图片那一支保留这条判据（焦点不在
 * 正文里就不插，免得用户以为图片丢了；**会提示一句**，让那件事有个说法）。
 * 而"打开一份文档"这个动作和焦点无关，所以别的几支不看焦点。
 */

import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { api, type ImageSourceArg, type 路径种类 } from "@/bridge/ipc";
import type { FilesSettings } from "@/bridge/types";
import { t as 翻译, useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import { 是Markdown后缀 } from "@/editor/file-kind";
import { 是图片文件 } from "@/ui/useImageInsert";

/** 一次拖进来的文件最多处理几个。⚠️ 超出的会如实说一句（见文件头）。 */
const 一次最多 = 12;

/**
 * 认得的**文本类**后缀。
 *
 * ⚠️ 这张单子回答的是"**能不能当文本文档打开**"，不是"能不能转成 Markdown"
 * ——后者 Nota 明确不做（`docs/10` §11.2：「导入格式族」已拍板不做，判据是
 * "把陌生文件变成文档树，方言问题大得多"）。所以 `.docx` / `.epub` / `.pdf`
 * **不在**这张单子里，拖进来会如实说一句"打不开"，而不是塞一屏乱码进去。
 *
 * ⚠️ `.txt` 之外的这些（`.json` `.toml` …）**照样是文本**：它们是用户会写
 * 笔记的地方（配置、脚本、数据），当纯文本打开没有任何副作用——按 Ctrl+S
 * 存回去还是原来那些字节。
 */
const 文本后缀 = [
  "md", "markdown", "mdown", "mkd", "mdx",
  "txt", "text", "log", "csv", "tsv",
  "json", "json5", "toml", "yaml", "yml", "ini", "conf", "env",
  "sh", "bash", "zsh", "py", "rs", "c", "h", "cc", "cpp", "hpp",
  "js", "jsx", "ts", "tsx", "css", "html", "htm", "xml", "sql", "lua",
];

/**
 * ⚠️ **后缀单子不在这儿**：`是Markdown后缀` 是 `editor/file-kind.ts` 里
 * {@link MARKDOWN后缀} 那**唯一一份**的一张表的用法（2026-09-28 收过去的）。
 *
 * ⚠️ 收之前这里自己写了一遍，而且**和别处不一致**：这份单子漏了 `.txt`，
 * 于是拖一篇 `.txt` 进来会被归到"别的文件"、走 `drop_importable` 那条设置，
 * 而同一份文件从「打开」对话框进去走的是 Markdown 那条。症状是
 * "同一份 txt，两条路不一样"。
 */

/** 能当文本文档打开吗（没有后缀的也当能——那多半是一篇没有扩展名的笔记）。 */
function 是文本文件(路径: string): boolean {
  const 名 = 路径.split("/").pop() ?? "";
  if (!名.includes(".")) return true;
  return 文本后缀.includes(名.split(".").pop()?.toLowerCase() ?? "");
}

export interface 拖放接线 {
  /** 打开一份磁盘上已有的文档（`useDocuments.openPath`）。返回值是"开上了没有"。 */
  openPath: (path: string) => Promise<boolean>;
  /**
   * 把某个目录当工作区打开。**给了路径就不弹对话框**（`useDocuments.openFolder`
   * 那个可选参数），拖放这条路上没有人能去点一个对话框。
   */
  openFolder: (path?: string) => Promise<void>;
  /** 把一张图插到当前光标（`useImageInsert` 的 `落一张`）。 */
  落一张: (source: ImageSourceArg, alt: string, 要上传?: boolean) => Promise<void>;
  /** 拖放那三条设置（`settings.files`）。`null` = 设置还没读回来，按默认办。 */
  files: FilesSettings | null;
  /** 有没有打开着文档（拖图片进来而一份都没开时要说一句）。 */
  hasDoc: boolean;
  toast: (message: string, level?: Toast["level"]) => void;
}

export function useFileDrop(w: 拖放接线): void {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，
  // 见 `i18n/index.ts::useT`）。
  const t = useT();
  const { openPath, openFolder, 落一张, files, hasDoc, toast } = w;

  useEffect(() => {
    /**
     * 一次 drop 的全过程。**写成 `async` 是为了 `await api.pathKind`**，
     * 但调用处不 `await` 它（事件回调不返回 Promise）——出错全在函数体里收拾。
     */
    const 收下一批 = async (paths: string[]) => {
      if (paths.length === 0) return;

      let 种类: 路径种类[];
      try {
        种类 = await api.pathKind(paths);
      } catch (e) {
        // ⚠️ 问不出来**不当成"什么都没有发生"**：那会让用户以为拖放坏了。
        toast(t("Could not tell what was dropped in: {0}", String(e)), "error");
        return;
      }
      if (种类.length !== paths.length) {
        // 长度对不上是宿主的契约破了（那边一一对应）。**宁可什么都不做**，
        // 也不要按下标硬凑——凑错的症状是"打开的东西不是拖进来的那个"。
        console.warn("[nota] nota_paths_kind 的长度与入参对不上，这一次拖放跳过");
        return;
      }

      const 文件夹: string[] = [];
      const 图片: string[] = [];
      const 文档: { path: string; markdown: boolean }[] = [];
      const 丢了: string[] = [];

      paths.forEach((路径, i) => {
        const k = 种类[i];
        if (k === "missing") return void 丢了.push(路径);
        if (k === "dir") return void 文件夹.push(路径);
        if (是图片文件(路径)) return void 图片.push(路径);
        // ⚠️ **Markdown 与"别的文本"分开**：它们归两条不同的设置
        //（`drop_markdown` / `drop_importable`），而在"打开"这个动作上
        // 两者是一回事（见下面 `打开` 里那句）。
        文档.push({ path: 路径, markdown: 是Markdown后缀(路径) });
      });

      // ── 不在了的那些：如实说，一次一句 ──────────────────────────────
      if (丢了.length > 0) {
        // ⚠️ 只报**第一个**名字，剩下用个数带过：拖十个文件进来而其中一个
        // 刚好被删了，弹十条提示条等于把界面刷了。名字要说出来——"有个文件
        // 没找到"没有可操作性，用户不知道该去看哪个。
        const 头一条 = 丢了[0];
        // ⚠️ `丢了.length > 0` 在这里不构成"下标一定在"的证明（`noUncheckedIndexedAccess`），
        // 所以取出来判一次——真取不到就整段跳过，下面那句提示宁可不发。
        if (!头一条) return;
        const 名 = 头一条.split("/").pop() ?? 头一条;
        toast(
          丢了.length === 1
            ? t("The dropped “{0}” is gone (moved or deleted?)", 名)
            : t("{0} of the dropped items are gone (starting with “{1}”)", 丢了.length, 名),
          "error",
        );
      }

      // ── ① 图片：只认第一个，归插图那条 ─────────────────────────────
      const 首张 = 图片[0];
      if (首张) {
        if (!hasDoc) {
          toast(t("Open a document first so the picture has somewhere to go"), "info");
        } else {
          // ⚠️ 焦点判据保留（老口径，见文件头）：拖放事件没有"落点"，
          // 插入点只能是当前光标，而焦点不在正文里时那个光标是**上一次**
          // 停的地方——插进去的图会跑到用户没在看的那一段。
          if (!在编辑区里有焦点()) {
            toast(t("Click into the text first, then drop the picture — otherwise there is no place to put it"), "info");
          }
          await 落一张({ kind: "path", path: 首张 }, "");
        }
      }

      // ── ② 文件夹：只认第一个，当工作区打开 ───────────────────────────
      const 首个目录 = 文件夹[0];
      if (首个目录) {
        const 选 = files?.drop_folder ?? "open-in-app";
        if (选 === "open-in-app") {
          if (文件夹.length > 1) {
            toast(
              t("Only one workspace can be open at a time; opened “{0}”", 首个目录.split("/").pop() ?? 首个目录),
              "info",
            );
          }
          await openFolder(首个目录);
        } else if (选 === "open-in-file-manager") {
          await 交给文件管理器(首个目录, t, toast);
        }
        // `ignore` = 什么也不做（设置上写着"什么也不做"，再弹一句就成了噪音）
      }

      // ── ③ 文件：全开，上限一次最多 ──────────────────────────────────
      const 开的 = 文档.slice(0, 一次最多);
      if (文档.length > 一次最多) {
        toast(
          t("At most {0} files are opened at once; {1} were left unopened this time", 一次最多, 文档.length - 一次最多),
          "info",
        );
      }
      // ⚠️ **两个不同的设置把文件分两拨**（`drop_markdown` / `drop_importable`），
      // 所以这里按"是不是 Markdown"再分一次。⚠️ `import-file` 那一档对**文本**
      // 文件就是"打开"——Nota 不做格式转换（§11.2），而"打开一篇 .txt"不需要
      // 任何转换。非文本的**单独说一句**（见下），不静默、也不塞乱码。
      for (const 一份 of 开的) {
        const 选 = 一份.markdown ? (files?.drop_markdown ?? "open-in-app") : (files?.drop_importable ?? "import-file");
        if (选 === "ignore") continue;
        if (选 === "open-in-file-manager") {
          await 交给文件管理器(一份.path, t, toast);
          continue;
        }
        if (!一份.markdown && !是文本文件(一份.path)) {
          // `import-file`（或那一档的默认）落在一个**不是文本**的文件上：
          // 如实说。⚠️ 这句话是**这一格能不能算"做完了"的关键**——不写它的话，
          // 拖一个 .docx 进来会静默无事发生，而 `drop_importable` 那一格在设置页
          // 里明明写着「当普通文件导入（转成 Markdown）」。
          toast(
            t("“{0}” is not a text file, and Nota does not convert formats, so it cannot open it", 一份.path.split("/").pop() ?? 一份.path),
            "info",
          );
          continue;
        }
        await openPath(一份.path);
      }
    };

    let 取消: (() => void) | undefined;
    let 拆了 = false;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type !== "drop") return;
        void 收下一批(e.payload.paths);
      })
      .then((un) => {
        // StrictMode 下 effect 会跑两遍：这一遍如果已经拆了，就得当场退订，
        // 不然会留下一个永远不会被摘掉的监听（拖一次开两份，或者拖一张图插两张）。
        if (拆了) un();
        else 取消 = un;
      })
      .catch((e) => {
        // 订阅不上不该让界面挂掉：拖放这条路边不可用，别处照旧。
        console.warn("[nota] 订阅拖放事件失败：", e);
      });
    return () => {
      拆了 = true;
      取消?.();
    };
  }, [openFolder, openPath, 落一张, files, hasDoc, t, toast]);
}

/** 焦点此刻在编辑区里吗。⚠️ 判据是那个类名，与 `ui/useImageInsert.ts` 同一套。 */
function 在编辑区里有焦点(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el?.closest?.(".editor-pane");
}

/**
 * 「在文件管理器里打开」这一档。
 *
 * ⚠️ 复用**导出那边**的 `nota_export_reveal`（它在 `commands/export.rs` 里，
 * 做的是"在文件管理器里**定位**一个文件"）。不新开一条命令的理由：那条命令
 * 里没有一处和"导出"有关——它只是一次 `reveal_item_in_dir`，而这个动作
 * 全仓只有这一份实现。⚠️ 定位**目录**时它打开的是父目录并选中它，这正是
 * 用户要的（"我要去看这个文件夹"）。
 */
async function 交给文件管理器(
  路径: string,
  t: typeof 翻译,
  toast: (message: string, level?: Toast["level"]) => void,
): Promise<void> {
  try {
    await api.export.reveal(路径);
  } catch (e) {
    toast(t("Could not open “{0}” in the file manager: {1}", 路径.split("/").pop() ?? 路径, String(e)), "error");
  }
}

