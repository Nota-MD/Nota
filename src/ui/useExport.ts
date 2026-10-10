/**
 * 导出与打印的接线（从 `App.tsx` 搬出来的，2026-09-24）。
 *
 * 搬出来的判据：这是一块**自己能讲完**的编排——
 * "取正文 → 取主题 → 生成 HTML → 问用户存哪/交给系统打开 → 说一句结果"，
 * 跟外壳骨架没关系。留在 `App.tsx` 里只会把"取数据、派事件、拼布局"
 * 这三件事淹掉，而那个文件本来就贴着行数上限。
 *
 * # ⚠️ 两个"从哪拿"的判断，错了都不会报错
 *
 * 1. **正文必须从编辑器拿，不是从 `doc.text` 拿**。后者是 300ms 去抖之后的
 *    镜像（backlog 第 32 项那笔账），用户刚敲的那个字会不在里面。屏幕上和
 *    导出里不一致，是最容易被当成"导出坏了"的那种 bug。
 * 2. **主题取不到不算失败**。`settings` 里记着一个 id、而那份 `.css` 被删了，
 *    是很平常的事（换机器、清理磁盘）——为它中断一次导出不值。退回"不带主题"
 *    继续导，只在控制台留一句。
 *
 * # ⚠️ 打印为什么不是"在应用里打印"
 *
 * 写成一份 HTML 交给系统默认程序，用户在那边按 `Ctrl+P`。**如实把两步都说给
 * 用户听**——假装在应用里完成才是撒谎。理由（WebKitGTK 的 `window.print()`
 * 在容器里点不出来、而且它不是同步返回）写在 `commands/export.rs` 文件头。
 *
 * # 借 pandoc 那七种（2026-09-25 加）
 *
 * 那七种（PDF / Word / RTF / EPUB / LaTeX / OpenDocument / OPML）Nota 自己
 * 不转，是**借系统里那个 pandoc**转的（`src-tauri/src/pandoc.rs`）。所以点下去
 * 第一件事是**探测**：没装就先给一个面板，别让用户白等一次失败——探到了就
 * 直接导，只有"没装 / 不确实"才需要用户做选择（装，或者明知如此仍然试）。
 *
 * ⚠️ PDF 有**两条路**：pandoc 优先，不通就用 Nota 自带那套（WebKit 打印）。
 * 所以 PDF 那次导出**总是**先把带样式的 HTML 备好交给后端——它在兜底时才用得上。
 * 返回值里的 `route` 说明这次走的哪条，`note` 会把它说给用户听：同一份文档两次
 * 导出结果不同却不说明白，那是玄学。
 */

import { useCallback, useMemo, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
// ⚠️ 是 `openUrl` 不是 `openPath`：要交给系统浏览器的是个 **http 地址**，权限
// 也分开管（`capabilities/default.json` 里开的是 `opener:allow-open-url`）。
// 本文件里它只服务一处：下面那条 `PANDOC_GUIDE`——给用户一份安装指南。
import { openUrl } from "@tauri-apps/plugin-opener";

import {
  api,
  type DocId,
  type Document,
  type ExportSettings,
  type PandocFormatInfo,
  type PandocProbe,
} from "@/bridge/ipc";
import { 导出HTML, 默认导出名 } from "@/editor/export";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

/** 探测不通时那个闸门面板要的东西。 */
export interface PandocGate {
  /** `null` = 正在重新检测。 */
  probe: PandocProbe | null;
  /** 用户点的是哪一种格式（面板标题与按钮文案要用）。 */
  format: PandocFormatInfo | null;
}

export interface 导出接线 {
  /** 当前活动文档的 id。 */
  activeId: DocId | null;
  /** 全部文档。用来把 id 换成对象（拿标题与路径）。 */
  docs: Document[];
  /** 编辑器句柄里那个"取当前 markdown"的方法。取不到文档时返回 `undefined`。 */
  getMarkdown: () => string | undefined;
  /** 文档主题 id（空串 = 无主题）。 */
  themeId: string;
  /** 导出那一页的设置（默认文件夹、导出后是否定位到文件）。 */
  exportSettings: ExportSettings;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface 导出出口 {
  /** 导出 HTML。`styled` 决定含不含样式。 */
  导出: (styled: boolean) => Promise<void>;
  /** 打印（= 导出含样式的那份 + 交给系统默认程序）。 */
  打印: () => Promise<void>;
  /** 借系统里的 pandoc 导出七种格式之一（`pdf` / `docx` / `rtf` / …）。 */
  导出为: (format: string) => Promise<void>;
  /** 装没装的闸门。`null` = 没在问。 */
  pandocGate: PandocGate | null;
  /**
   * 面板上那几颗按钮。⚠️ 这套键名是**这份编排自己的约定**：`App.tsx` 那边是
   * `{...pandocGateActions}` 直接摊开给面板的，改名要连着那边一起改。
   */
  pandocGateActions: {
    /** 照导（`unknown` 的"仍然试一次"，或走了自带 PDF 那条路）。 */
    onExport: () => void;
    onRecheck: () => void;
    onGuide: () => void;
    onClose: () => void;
  };
}

/**
 * pandoc 的安装指南。⚠️ 是**核过的**那一页，不是首页——用户点"去官网"是
 * 要照着装的，落到首页等于让他自己再找一遍。
 */
const PANDOC_GUIDE = "https://pandoc.org/installing.html";

/**
 * 一个路径所在的那一层目录。`null` = 它本来就没有目录那一段（光秃秃一个文件名）。
 *
 * ⚠️ `cut <= 0` 里那个 `0` 是必需的，不是笔误：`/a.md` 的最后一个分隔符在第 0 位，
 * 切出来会是**空串**，而空串当目录用等于"往根目录旁边导"，不如老实说没有目录。
 * Windows 的 `C:\a.md` 同理（`cut === 2`，能过）。
 */
export function 所在目录(path: string): string | null {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut <= 0 ? null : path.slice(0, cut);
}

/**
 * 把「一层目录」和「一个文件名」拼成一个路径。
 *
 * ⚠️ **为什么在 `useExport.ts` 里导出、而不是各写一份**：这个函数和 `所在目录`
 * 是一对（一个拆、一个拼），`useDocuments.ts` 的「另存为」现在也要用它
 *（2026-09-27，用户点名「另存为」的落点要跟「上次用过的目录」走）。
 * 抄第二份的话，`sep` 那条判据（下面）迟早有一边忘了改。
 *
 * ⚠️ 自己拼而不是引 `@tauri-apps/api/path` 的 `join`/`dirname`：那两个函数
 * 要先问一次平台才知道分隔符，为拼一个字符串多一跳 IPC 不值。判据是"这个
 * 路径长什么样"——含反斜杠且不含斜杠的就是 Windows 路径。
 */
export function 拼路径(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function useExport(w: 导出接线): 导出出口 {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { activeId, docs, getMarkdown, themeId, exportSettings, toast } = w;
  const [pandocGate, setPandocGate] = useState<PandocGate | null>(null);

  /** 主题 CSS 的**原始**文本。限域在 `editor/export.ts` 里做，那边统一。 */
  const 取主题CSS = useCallback(async (): Promise<string | undefined> => {
    if (!themeId) return undefined;
    try {
      return await api.theme.css(themeId);
    } catch (e) {
      console.warn("[nota] 导出时取文档主题失败，这一份不带主题：", e);
      return undefined;
    }
  }, [themeId]);

  /**
   * 导出后按设置**定位**到那个文件。
   *
   * ⚠️ 失败只落一句警告、**不抛**：文件已经导出成功了，这时候弹一个红条
   * 会把"导好了"这件事盖掉。但也不能咽掉——用户会以为设置没生效。
   */
  const 可能要定位 = useCallback(
    async (path: string) => {
      if (!exportSettings.open_after_export) return;
      try {
        await api.export.reveal(path);
      } catch (e) {
        toast(t("The file was exported, but could not be revealed in the file manager: {0}", String(e)), "warn");
      }
    },
    [exportSettings.open_after_export, toast],
  );

  /**
   * 默认落点，**三档**（⚠️ 别和「另存为」的落点混为一谈，见下）：
   *
   * 1. 设置里那个 `default_folder` 非空 → 用它（用户显式说过的，最大）。
   * 2. 否则这份文档**已存过盘** → 用它自己那一层目录（导出到文档旁边）。
   * 3. 都没 → 只有一个文件名，交给对话框用它自己记着的目录。
   *
   * ⚠️ **「导出」和「另存为」的落点是两回事，但不再是"一边有设置一边没有"**：
   * 另存为换的是*这份文档自己*的路径，所以它必然以 `doc.path` 为准；导出产出的
   * 是一份**别的文件**，落点只能算"猜一个用户多半想要的地方"。
   * ⚠️ 2026-09-27 用户点了「另存为」那一侧（原话："改成上次用过的目录或文档
   * 目录"）——那一侧现在也有两档，但**记的不是设置而是一次进程内记住的
   * 「上次另存到哪儿」**，见 `useDocuments.ts::另存落点`。两者别混。
   *
   * ⚠️ 第 2 档是**开窗量出来**的：不给的话对话框落在**进程的当前目录**里
   * （实测是 `src-tauri/`）——那是"从哪儿启动的"，不是"用户在编辑什么"。
   */
  const 默认落点 = useCallback(
    (name: string, docPath: string | null): string => {
      const dir = exportSettings.default_folder || (docPath ? 所在目录(docPath) : null);
      return dir ? 拼路径(dir, name) : name;
    },
    [exportSettings.default_folder],
  );

  /**
   * 导出 HTML。两档只差一个布尔，**故意合成一条路**——分成两个函数的话，
   * "另一种也一并改一下"迟早会漏一次。
   */
  const 导出 = useCallback(
    async (styled: boolean) => {
      const doc = docs.find((d) => d.id === activeId);
      const text = getMarkdown();
      if (!doc || text === undefined) return;

      try {
        const picked = await saveDialog({
          title: styled ? t("Export HTML (With Styles)") : t("Export HTML (No Styles)"),
          // ⚠️ 默认名**保留原文件名、只换后缀**：用户认得自己那份文档叫什么。
          defaultPath: 默认落点(默认导出名(doc.title, "html"), doc.path),
          filters: [{ name: "HTML", extensions: ["html", "htm"] }],
        });
        if (!picked) return; // 用户取消了，不是错误

        const html = await 导出HTML(text, {
          styled,
          themeCss: styled ? await 取主题CSS() : undefined,
          title: doc.title,
        });
        const written = await api.export.write(picked, html);
        // 报**真实写出去的路径**：对话框可能改了它（补后缀、换目录）。
        toast(t("Exported to {0}", written), "success");
        await 可能要定位(written);
      } catch (e) {
        toast(t("Could not export: {0}", String(e)), "error");
      }
    },
    [activeId, docs, getMarkdown, 取主题CSS, toast, 默认落点, 可能要定位],
  );

  const 打印 = useCallback(async () => {
    const doc = docs.find((d) => d.id === activeId);
    const text = getMarkdown();
    if (!doc || text === undefined) return;

    try {
      const html = await 导出HTML(text, {
        styled: true,
        themeCss: await 取主题CSS(),
        title: doc.title,
      });
      // ⚠️ 落点由后端按 `doc.path` 的**父目录**决定，不是随便找个临时目录：
      // 正文里 `![](./img.png)` 是相对路径，换个目录图片就全没了。
      const path = await api.export.print(doc.path, doc.title, html);
      toast(t("Opened in the system default app — press Ctrl+P there to print (the file is at {0})", path), "info");
    } catch (e) {
      toast(t("Could not print: {0}", String(e)), "error");
    }
  }, [activeId, docs, getMarkdown, 取主题CSS, toast]);

  /**
   * 真的导一次（闸门放行之后走这条）。`format` 来自探测报告那张表。
   *
   * ⚠️ 正文、主题 CSS 都在**这一刻**取：面板可能开了一会儿，中途用户改了正文。
   */
  const 真导出 = useCallback(
    async (doc: Document, format: PandocFormatInfo) => {
      const text = getMarkdown();
      if (text === undefined) return;
      try {
        const picked = await saveDialog({
          title: t("Export {0}", format.name),
          defaultPath: 默认落点(默认导出名(doc.title, format.extension), doc.path),
          filters: [{ name: format.name, extensions: [format.extension] }],
        });
        if (!picked) return;

        // ⚠️ PDF **总是**备一份带样式的 HTML：pandoc 那条路不通时后端拿它
        // 走 Nota 自带的排版（`pdf_print.rs`）。不备的话，"pandoc 装了但没有
        // 排版引擎"这种情况就只剩一句报错，而它本来有救。
        const html =
          format.id === "pdf"
            ? await 导出HTML(text, {
                styled: true,
                themeCss: await 取主题CSS(),
                title: doc.title,
              })
            : null;

        const 结果 = await api.pandoc.export({
          format: format.id,
          markdown: text,
          target: picked,
          docPath: doc.path,
          html,
          // ⚠️ 文档主题**总是**取一份给后端（2026-10-10，`docs/07` 第 112 项）：
          // 由后端的 `pandoc.rs::能带_CSS` 判"这一种格式吃不吃 CSS"，前端不判
          // ——判据放两处就一定会有一天两边不一样，而症状是"这一种格式带主题、
          // 那一种不带"，没人能说清为什么。
          themeCss: (await 取主题CSS()) ?? "",
          // 用户在「设置 → 导出」里写的那串额外参数（原样搬，前端不解析）。
          pandocArgs: exportSettings.pandoc_args,
        });
        // ⚠️ 把后端的 `note` 一起说出来：走的是 pandoc 还是 Nota 自己那套，
        // 用户必须有办法知道（同一份文档两次结果不同才不至于是玄学）。
        toast(t("Exported to {0}. {1}", 结果.path, 结果.note), "success");
        await 可能要定位(结果.path);
      } catch (e) {
        toast(t("Could not export: {0}", String(e)), "error");
      }
    },
    [getMarkdown, 取主题CSS, exportSettings.pandoc_args, toast, 默认落点, 可能要定位],
  );

  /**
   * 借 pandoc 导那七种之一：**先探测，再决定是直接导还是先出面板**。
   *
   * `ready` 时**不弹面板**（那种情形面板上只有一个"开始导出"按钮，白点一下），
   * 直接进保存对话框；`missing` / `unknown` 才出面板——那种时候需要用户做选择
   *（装、或者明知如此仍然试）。
   */
  const 导出为 = useCallback(
    async (format: string) => {
      const doc = docs.find((d) => d.id === activeId);
      if (!doc || getMarkdown() === undefined) return;

      let probe: PandocProbe;
      try {
        probe = await api.pandoc.probe();
      } catch (e) {
        toast(t("Could not probe for pandoc: {0}", String(e)), "error");
        return;
      }
      // ⚠️ 表是后端给的：认不出的 id 要吭声，不要静默——静默会表现成"点了没反应"。
      const info = probe.formats.find((f) => f.id === format) ?? null;
      if (info === null) {
        toast(t("Unrecognised export format: {0}", format), "error");
        return;
      }

      if (probe.state === "ready") {
        await 真导出(doc, info);
        return;
      }
      setPandocGate({ probe, format: info });
    },
    [activeId, docs, getMarkdown, 真导出, toast],
  );

  /** 闸门面板上那几颗按钮。 */
  const pandocGateActions = useMemo(
    () => ({
      onExport: () => {
        const gate = pandocGate;
        if (gate === null || gate.format === null) return;
        const doc = docs.find((d) => d.id === activeId);
        setPandocGate(null);
        if (doc === undefined) return;
        // 照导：pandoc 通了就走它，不通就由后端退到 Nota 自带那套（PDF 才有）。
        void 真导出(doc, gate.format);
      },
      onRecheck: () => {
        setPandocGate((g) => (g === null ? g : { ...g, probe: null }));
        void (async () => {
          try {
            const probe = await api.pandoc.probe();
            setPandocGate((g) => (g === null ? g : { ...g, probe }));
          } catch (e) {
            toast(t("Could not probe for pandoc: {0}", String(e)), "error");
            setPandocGate(null);
          }
        })();
      },
      onGuide: () => {
        // ⚠️ 失败要吭声：点"去官网"没反应会让人以为按钮坏了。
        void openUrl(PANDOC_GUIDE).catch((e: unknown) =>
          toast(t("Could not open the browser: {0}", String(e)), "error"),
        );
      },
      onClose: () => setPandocGate(null),
    }),
    [pandocGate, docs, activeId, 真导出, toast],
  );

  return { 导出, 打印, 导出为, pandocGate, pandocGateActions };
}
