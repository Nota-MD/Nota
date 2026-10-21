/**
 * 「导出」那一页。
 *
 * ⚠️⚠️ **本页三条设置**，而且是**所有导出格式都共用的那三条**（默认目录、
 * 导完之后开不开文件夹、2026-10-10 加的「pandoc 额外参数」）——所以它一个格式
 * 一档都不列：格式本身在「文件 → 导出」那张菜单上（`ui/commands.ts`），
 * 不在这儿重复一遍。
 *
 * ⚠️ **本页也没有「Pandoc 路径」那一格**，这是**刻意的**：Nota **不自带、
 * 也不下载** pandoc，只用系统里那个（七种格式全靠它转，见
 * `src-tauri/src/pandoc.rs` 文件头）。留一个路径框而包不带 pandoc，
 * 就是一个不起作用的控件。⚠️ 探测结果**不在这页上**——装没装是导出那一刻
 * 由 `ui/PandocPanel.tsx` 现探现说的。
 *
 * ⚠️ 自定义导出器（增删改导出器那一排按钮）**不做**：它要的是一个导出器插件
 * 接口，而 Nota 的插件系统是 Lua 的、面向文档操作的，两者不是一回事。
 *
 * # ⚠️ 2026-10-10 那第三条（`pandoc_args`）
 *
 * 用户原话：「**我的文档主题没有影响到 Pandoc 的导出。你可以参考 Markra。**」
 *
 * 文档主题是一份 CSS，而借 pandoc 导的那七种里**只有 EPUB 吃 CSS**（Nota 自己
 * 会给它带上主题，见 `src-tauri/src/pandoc.rs::能带_CSS` 那张表）：DOCX 的排版
 * 由 **Word 模板**定（`--reference-doc=`）、LaTeX / PDF 由 `-V` 变量与 `-H`
 * 头文件定、ODT / RTF / OPML 各有一套模板——**它们都不认 CSS**，不是"没接上"。
 * 所以这一格是那几种的出口：把 `--reference-doc=我的模板.docx`、`-V mainfont=…`
 * 这类东西自己写进来（Markra 那边同一件事的办法就是这一格，它叫 `pandocArgs`）。
 *
 * ⚠️ **解析只有后端一处**（`pandoc.rs::分词`，走 `shlex` 认引号）：这一页只搬
 * 字符串，所以下面那句说明里写的是"空格分开、带引号的整段算一个"。
 *
 * ⚠️ **2026-10-04**：这一页底下原有一段说明（讲"能导出哪两种"），
 * 按用户那一轮「全删」的口径删掉了。它**当时就已经说过期了**——
 * 2026-09-25 借 pandoc 导出七种格式之后，"只有 HTML / PDF 两种"这句话
 * 就不再成立（见上面那条与 `docs/10` §6）。
 */

import { useT } from "@/i18n";
import { chooseDirectory } from "@/ui/file-picker";
import { ActionButton, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function ExportPane({ settings, onChange }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "export");
  const e = settings.export;

  return (
    <>
      <SettingsGroup title={t("Default export folder")}>
        <SettingRow>
          <div className="stg-inline">
            <TextInput
              value={e.default_folder}
              width="lg"
              placeholder={t("Automatic (the current document's folder)")}
              onChange={(default_folder) => 写({ default_folder })}
            />
            <ActionButton
              onClick={() => {
                void chooseDirectory({
                  title: t("Default export folder"),
                  defaultPath: e.default_folder || undefined,
                }).then((path) => {
                  if (path) 写({ default_folder: path });
                });
              }}
            >
              {t("Choose…")}
            </ActionButton>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("After exporting")}>
        <SettingRow label={t("Open the folder the exported file goes into")}>
          <Toggle
            checked={e.open_after_export}
            onChange={(open_after_export) => 写({ open_after_export })}
          />
        </SettingRow>
      </SettingsGroup>

      {/* ⚠️ 这一格**不分格式**：它是"每次借 pandoc 都捎上"的东西（同一格里可以写
          只对某一种格式有意义的参数，pandoc 自己会忽略无关的那些）。 */}
      <SettingsGroup title={t("Pandoc extra arguments")}>
        <SettingRow
          label={t("Passed to pandoc when exporting with it")}
          help={t(
            "Applies to PDF, Word, OpenOffice, RTF, and LaTeX. Separate arguments with spaces and quote values that contain spaces. The document theme is applied to EPUB automatically. For Word output, use --reference-doc to specify a .docx template.",
          )}
        >
          <TextInput
            value={e.pandoc_args}
            width="lg"
            // ⚠️ 占位符**只写 ASCII**：它是给用户看的例子，而本仓那条闸
            //（`tools/i18n-check.sh` 第 ③ 段）要求**界面上的中文必须先包 `t()`**
            // ——一个中文例子写在 `placeholder=` 里会被它当成漏翻的一条报出来。
            // （例子本身在 `help` 那句中文说明里写着，用户看得到。）
            placeholder="--reference-doc=reference.docx"
            onChange={(pandoc_args) => 写({ pandoc_args })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
