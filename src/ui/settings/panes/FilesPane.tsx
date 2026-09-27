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

import type { DropAction, FileFilter, ImportAction, StartupAction } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { ActionButton, Note, Select, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
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
    { value: "0", label: t("关闭") },
    { value: "30", label: t("30 秒") },
    { value: "60", label: t("1 分钟") },
    { value: "300", label: t("5 分钟") },
  ];

  // ⚠️ 三档是**递进**的（第三档 = 第二档 ＋ 那个文件夹），标签得让人一眼看出
  // 这个关系。第二档那句 2026-09-27 补了「和目录」三个字：写"恢复上次打开的文件"
  // 时，第三档的标签也写着"文件和文件夹"，两条读起来像同一个东西的两种说法。
  // ⚠️ 第三档的 `value` 是 `"last-session"`，**不是** `"folder"`：老名字说的是
  // "只打开文件夹"，而这一档实际连文件一起恢复。改名的理由和 serde 别名在
  // `src-tauri/src/settings/files.rs::StartupAction` 上（老值还读得懂）。
  const STARTUP: Array<{ value: StartupAction; label: string }> = [
    { value: "new-file", label: t("打开空白文档") },
    { value: "last-file", label: t("恢复上次打开的文件") },
    { value: "last-session", label: t("恢复上次的文件和文件夹") },
  ];

  const DROP: Array<{ value: DropAction; label: string }> = [
    { value: "open-in-app", label: t("在窗口里打开") },
    { value: "open-in-file-manager", label: t("在文件管理器里打开") },
    { value: "ignore", label: t("什么也不做") },
  ];

  // ⚠️ 这一格的标签 2026-09-27 从「导入为 Markdown」改成了「当文本文件打开」：
  // 那个老标签**在描述一件 Nota 不做的事**——格式转换（`.docx` → Markdown）
  // 已在 `docs/10` §11.2 拍板不做。现在的行为是"文本文件照常打开、别的如实
  // 说一句打不开"，标签得说这件事（`ui/useFileDrop.ts`）。
  const IMPORT: Array<{ value: ImportAction; label: string }> = [
    { value: "import-file", label: t("当文本文件打开") },
    { value: "open-in-file-manager", label: t("在文件管理器里打开") },
    { value: "ignore", label: t("什么也不做") },
  ];

  const FILTER: Array<{ value: FileFilter; label: string }> = [
    { value: "supported", label: t("只显示 Markdown 和纯文本") },
    { value: "all", label: t("全部显示") },
  ];

  const 写 = paneWriter(settings, onChange, "files");
  const f = settings.files;

  return (
    <>
      <SettingsGroup
        title={t("启动选项")}
        help={t("启动 Nota 时先做什么。三档是递进的：「文件夹」指的是左侧栏那棵文件树。")}
      >
        <SettingRow>
          <Select value={f.startup} options={STARTUP} onChange={(startup) => 写({ startup })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("大纲")}>
        <SettingRow
          label={t("允许折叠和展开")}
          help={t("侧栏大纲树中的标题能否折叠、展开。关闭后大纲树始终完全展开，条目较多时需连续滚动才能找到目标。")}
        >
          <Toggle
            checked={f.outline_collapsible}
            onChange={(outline_collapsible) => 写({ outline_collapsible })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("保存 & 恢复")}
        help={t("「自动保存」只对存过盘的文档生效；没存过的新文档没有可写回去的地方，不在此列。")}
      >
        <SettingRow
          label={t("自动保存")}
          help={t("停止输入这么久之后，把改动写回原文件。⚠️ 落盘走的是和 Ctrl+S 同一条路（含「存盘前先强制同步一次编辑器」那一步），所以自动存出来的字节和手动存完全一样；写盘失败会照常弹提示条，只是成功那一下不弹（不然每半分钟打断一次）。")}
        >
          <Select
            value={String(settings.autosave_seconds)}
            options={AUTOSAVE}
            onChange={(v) => onChange({ autosave_seconds: Number(v) })}
          />
        </SettingRow>

        <SettingRow
          label={t("切换文件时自动保存")}
          help={t("切到另一个标签页之前，先把这个文件的改动写盘。⚠️ 点标签、开文件、新建文档都算「切页」；关文档不算——那一条自己有「保存并关闭」，而且用户选的若是「丢弃并关闭」，这里再去存一次就是把他的选择反着做。")}
        >
          <Toggle
            checked={f.autosave_on_switch}
            onChange={(autosave_on_switch) => 写({ autosave_on_switch })}
          />
        </SettingRow>

        <SettingRow
          label={t("恢复未保存的草稿")}
          help={t("把上一次异常退出时留下的、还没写盘的内容找回来。")}
        >
          <ActionButton
            disabled
            title={t("尚未实现：这一项要在写盘之前**另外留一份底**，而现在的自动保存是直接往原文件写——写成了就没有草稿可言了。现状见本组末尾的说明。")}
          >
            {t("恢复草稿")}
          </ActionButton>
        </SettingRow>

        <SettingRow
          label={t("清除历史文件记录")}
          help={t("清掉「最近打开」那一份列表。只清记录，不碰文件本身。")}
        >
          {/* ⚠️ 2026-09-27 接上：在这之前它是灰的，而那句 `title` 写着
              "目前没有「最近打开」列表"——那份列表现在在（侧栏「文档列表」页、
              文件菜单那一层、主页那一块），记录本身由 `ui/useSession.ts` 管。 */}
          <ActionButton onClick={onClearRecent}>{t("清除记录")}</ActionButton>
        </SettingRow>

        {/* ⚠️ 这段是**缩窄**过的，不是删掉重写的。2026-09-24 那版说的是
            「自动保存这一项还没接上」——三档里三档都没接。2026-09-25 把前两档
            接上了（`ui/useAutosave.ts` ＋ `useDocuments` 的 `切换文档`），
            所以现在只剩下面说到的那两件，**必须照旧留着**：
            一个拨了不生效的开关比没有这个开关更糟——用户会以为自己已经安全了。
            ⚠️ 它必须**留在这一组里面**：`.stg-note` 落在组内容区时才会跨两栏对齐
            （`settings.css` 那条 `.stg-group-body > .stg-note`）；摆到组外面就变成
            整页宽、贴着最左边，看起来像下一组的标题。 */}
        <Note>
          {t("上面两档自动保存")}
          <strong>{t("是能用的")}</strong>
          {t("：到点真的写盘（`Ctrl+S` 那条路）， 写不进去会报出来。")}
          {t("「最近打开」那份列表也已经建起来了（侧栏「文档列表」页、文件菜单那一层、主页那一块都读它），所以「清除历史文件记录」现在真的清得掉。")}
          <br />
          {t("还欠着的只剩这一条：")}
          <strong>{t("「恢复未保存的草稿」")}</strong>
          {t("要先有一份\"写盘之前留的底\" ——现在的自动保存是直接往原文件写，写成了就没有草稿可恢复。")}
        </Note>
      </SettingsGroup>

      <SettingsGroup
        title={t("文件树 / 文件库")}
        help={t("只管侧栏那棵树显示什么，不改磁盘上的任何东西。")}
      >
        <SettingRow label={t("显示隐藏文件")}>
          <Toggle checked={f.show_hidden} onChange={(show_hidden) => 写({ show_hidden })} />
        </SettingRow>

        <SettingRow
          label={t("显示哪些文件")}
          help={t("选「全部显示」时，一个 node_modules 目录即可让树中充满无关条目，因此默认只显示 Markdown 和纯文本。")}
        >
          <Select value={f.tree_filter} options={FILTER} onChange={(tree_filter) => 写({ tree_filter })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("拖放")}
        help={t(
          "把一个文件或文件夹拖到 Nota 窗口上时怎么办。⚠️ 图片不受这三档影响：拖一张图进来永远是插到正文的光标处。",
        )}
      >
        <SettingRow label={t("当拖入文件夹时")}>
          <Select
            value={f.drop_folder}
            options={DROP}
            onChange={(drop_folder) => 写({ drop_folder })}
          />
        </SettingRow>

        <SettingRow label={t("当拖入 Markdown 文件时")}>
          <Select
            value={f.drop_markdown}
            options={DROP}
            onChange={(drop_markdown) => 写({ drop_markdown })}
          />
        </SettingRow>

        <SettingRow
          label={t("当拖入可导入的文件时")}
          help={t(
            "既不是 Markdown、也不是文本的文件（.docx / .epub / .pdf 这类）。⚠️ Nota 不做格式转换——这一档只决定文本文件要不要打开、别的文件要不要说一句。",
          )}
        >
          <Select
            value={f.drop_importable}
            options={IMPORT}
            onChange={(drop_importable) => 写({ drop_importable })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("默认扩展名")}
        help={t("新建文档存盘时使用的扩展名。⚠ 只影响新建的文档——已有文件名的文件保持其原有扩展名。")}
      >
        <SettingRow>
          <TextInput
            value={f.default_extension}
            width="sm"
            placeholder="md"
            onChange={(default_extension) => 写({ default_extension })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("记录历史文件和文件夹")}>
        <SettingRow>
          <Toggle
            checked={f.remember_recent}
            onChange={(remember_recent) => 写({ remember_recent })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("关闭前先问我")}>
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
