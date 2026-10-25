/**
 * 「文件」那一页。
 *
 * 字段全在 `[files]` 表里（`src-tauri/src/settings/files.rs`），
 * **只有两个例外**，它们落在顶层：`autosave_seconds`（「自动保存」）
 * 和 `confirm_unsaved`（「关闭前先问我」）——2026-09-22 就在那儿了，
 * 搬进 `[files]` 会让老设置文件里的值静默丢回默认。
 *
 * ⚠️ 这两项**从「编辑器」页挪到了这一页**：自动保存属于存盘，与文件页同组。
 * 挪的是**界面上的位置**，存的值一个字节没动，所以老设置文件不受影响。
 */

import type { DropAction, FileFilter, ImportAction, StartupAction, TreeSort } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { ActionButton, Select, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function FilesPane({ settings, onChange, onClearRecent }: PaneProps) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  // ⚠️ 下面这几张表**在组件里现建**，不能留在模块级：模块级求值时语言还没定，
  // 而且之后**没有任何东西会通知它重画**（同上）；`tools/i18n-check.sh` 数的
  // 是源码里**字面写出来**的 `t("…")`，表留在模块级这些键就不算被调用。
  // 同一件事的先例见 `PluginDock.tsx::能力名` 那张表。

  /** 自动保存的档位（秒，0 = 关）。⚠️ 值是**秒数**，不是"档位编号"。 */
  const AUTOSAVE: Array<{ value: string; label: string }> = [
    { value: "0", label: t("Close") },
    { value: "30", label: t("30 seconds") },
    { value: "60", label: t("1 minute") },
    { value: "300", label: t("5 minutes") },
  ];

  // ⚠️ 三档是**递进**的（第三档 = 第二档 ＋ 那个文件夹），标签得让人一眼看出
  // 这个关系。第二档那句 2026-09-27 补了「和目录」三个字：写"恢复上次打开的文件"
  // 时，第三档的标签也写着"文件和文件夹"，两条读起来像同一个东西的两种说法。
  // ⚠️ 第三档的 `value` 是 `"last-session"`，**不是** `"folder"`：老名字说的是
  // "只打开文件夹"，而这一档实际连文件一起恢复。改名的理由和 serde 别名在
  // `src-tauri/src/settings/files.rs::StartupAction` 上（老值还读得懂）。
  const STARTUP: Array<{ value: StartupAction; label: string }> = [
    { value: "new-file", label: t("Open a blank document") },
    { value: "last-file", label: t("Restore the last open files") },
    { value: "last-session", label: t("Restore the last files and folder") },
  ];

  const DROP: Array<{ value: DropAction; label: string }> = [
    { value: "open-in-app", label: t("Open in this window") },
    { value: "open-in-file-manager", label: t("Open in the file manager") },
    { value: "ignore", label: t("Do nothing") },
  ];

  // ⚠️ 这一格的标签 2026-09-27 从「导入为 Markdown」改成了「当文本文件打开」：
  // 那个老标签**在描述一件 Nota 不做的事**——格式转换（`.docx` → Markdown）
  // 已在 `docs/10` §11.2 拍板不做。现在的行为是"文本文件照常打开、别的如实
  // 说一句打不开"，标签得说这件事（`ui/useFileDrop.ts`）。
  const IMPORT: Array<{ value: ImportAction; label: string }> = [
    { value: "import-file", label: t("Open as a text file") },
    { value: "open-in-file-manager", label: t("Open in the file manager") },
    { value: "ignore", label: t("Do nothing") },
  ];

  const FILTER: Array<{ value: FileFilter; label: string }> = [
    { value: "supported", label: t("Show only Markdown and plain text") },
    { value: "all", label: t("Show all") },
  ];

  // ⚠️ 三档的**措辞要把"新的在前"写进去**：这一栏的标签如果只写"按修改时间"，
  // 用户排出来是倒的（新的在最上面）时会以为排序坏了。宿主那边的取舍写在
  // `src-tauri/src/settings/files.rs::TreeSort` 上。
  // ⚠️ 「按名字」这一档也要说清是升序，否则三档读起来像同一个方向。
  const SORT: Array<{ value: TreeSort; label: string }> = [
    { value: "name", label: t("Name (A to Z)") },
    { value: "modified", label: t("Recently modified first") },
    { value: "created", label: t("Recently created first") },
  ];

  const write = paneWriter(settings, onChange, "files");
  const f = settings.files;

  return (
    <>
      <SettingsGroup title={t("Startup")}>
        <SettingRow>
          <Select value={f.startup} options={STARTUP} onChange={(startup) => write({ startup })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Outline")}>
        <SettingRow label={t("Allow collapsing and expanding")}>
          <Toggle
            checked={f.outline_collapsible}
            onChange={(outline_collapsible) => write({ outline_collapsible })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Saving & Recovery")}>
        <SettingRow label={t("Auto Save")}>
          <Select
            value={String(settings.autosave_seconds)}
            options={AUTOSAVE}
            onChange={(v) => onChange({ autosave_seconds: Number(v) })}
          />
        </SettingRow>

        <SettingRow label={t("Auto Save when switching files")}>
          <Toggle
            checked={f.autosave_on_switch}
            onChange={(autosave_on_switch) => write({ autosave_on_switch })}
          />
        </SettingRow>

        <SettingRow label={t("Restore unsaved drafts")}>
          <ActionButton
            disabled
            title={t("Not implemented yet: this needs a separate copy made before writing to disk, while Auto Save currently writes straight to the original file — once written there is no draft left. See the note at the end of this group.")}
          >
            {t("Restore drafts")}
          </ActionButton>
        </SettingRow>

        <SettingRow label={t("Clear recent files history")}>
          {/* ⚠️ 2026-09-27 接上：在这之前它是灰的，而那句 `title` 写着
              "目前没有「最近打开」列表"——那份列表现在在（侧栏「文档列表」页、
              文件菜单那一层、主页那一块），记录本身由 `ui/useSession.ts` 管。 */}
          <ActionButton onClick={onClearRecent}>{t("Clear records")}</ActionButton>
        </SettingRow>

        {/* ⚠️ 这段是**缩窄**过的，不是删掉重写的。2026-09-24 那版说的是
            「自动保存这一项还没接上」——三档里三档都没接。2026-09-25 把前两档
            接上了（`ui/useAutosave.ts` ＋ `useDocuments` 的 `切换文档`），
            所以现在只剩下面说到的那两件，**必须照旧留着**：
            一个拨了不生效的开关比没有这个开关更糟——用户会以为自己已经安全了。
            ⚠️ 它必须**留在这一组里面**：`.stg-note` 落在组内容区时才会跨两栏对齐
            （`settings.css` 那条 `.stg-group-body > .stg-note`）；摆到组外面就变成
            整页宽、贴着最左边，看起来像下一组的标题。 */}
      </SettingsGroup>

      <SettingsGroup title={t("File tree / library")}>
        <SettingRow label={t("Show hidden files")}>
          <Toggle checked={f.show_hidden} onChange={(show_hidden) => write({ show_hidden })} />
        </SettingRow>

        <SettingRow label={t("Which files to show")}>
          <Select value={f.tree_filter} options={FILTER} onChange={(tree_filter) => write({ tree_filter })} />
        </SettingRow>

        {/* ⚠️ 2026-09-28 加的这一格是**真的接线**，不是摆样子：口径随每次取树
            的请求一起递给宿主（`ui/tree-options.ts` 顶上写了为什么）。
            同一批还把上面那两个开关接上了线——它们从 2026-09-24 起就在这一组里，
            而宿主那两个判断是写死的，拨了等于没拨。 */}
        <SettingRow label={t("Sort order")}>
          <Select value={f.tree_sort} options={SORT} onChange={(tree_sort) => write({ tree_sort })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Drag and Drop")}>
        <SettingRow label={t("When a folder is dropped")}>
          <Select
            value={f.drop_folder}
            options={DROP}
            onChange={(drop_folder) => write({ drop_folder })}
          />
        </SettingRow>

        <SettingRow label={t("When a Markdown file is dropped")}>
          <Select
            value={f.drop_markdown}
            options={DROP}
            onChange={(drop_markdown) => write({ drop_markdown })}
          />
        </SettingRow>

        <SettingRow label={t("When an importable file is dropped")}>
          <Select
            value={f.drop_importable}
            options={IMPORT}
            onChange={(drop_importable) => write({ drop_importable })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Default extension")}>
        <SettingRow>
          <TextInput
            value={f.default_extension}
            width="sm"
            placeholder="md"
            onChange={(default_extension) => write({ default_extension })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Remember recent files and folders")}>
        <SettingRow>
          <Toggle
            checked={f.remember_recent}
            onChange={(remember_recent) => write({ remember_recent })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Ask me before closing")}>
        <SettingRow>
          <Toggle
            checked={settings.confirm_unsaved}
            onChange={(confirm_unsaved) => onChange({ confirm_unsaved })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
