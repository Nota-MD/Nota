/**
 * 「导出」那一页。
 *
 * ⚠️⚠️ **本页只有两条设置，也就是 HTML / PDF 两种导出能共用的那两条。**
 * Nota 能导出的格式就是这两种，没有 PDF / HTML / Image / Word (.docx) /
 * OpenOffice / RTF / Epub / LaTeX / Media Wiki / reStructuredText / Textile /
 * OPML 那样一排子页面——那需要一整套可插拔的导出器框架，不是一个页面。
 *
 * ⚠️ 而且 `docs/10-feature-matrix.md` 的「不做的事与理由」表里已经写明：**不做 Pandoc**。
 * Word / OpenOffice / RTF / Epub / LaTeX / OPML 这些格式**全靠 Pandoc 转**，
 * 留一个「Pandoc 路径」选择框而不带 Pandoc，是个不起作用的控件。
 *
 * ⚠️ 自定义导出器（增删改导出器那一排按钮）**也不做**：它要的是一个导出器插件
 * 接口，而 Nota 的插件系统是 Lua 的、面向文档操作的，两者不是一回事。
 */

import { useT } from "@/i18n";
import { ActionButton, Note, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function ExportPane({ settings, onChange }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "export");
  const e = settings.export;

  return (
    <>
      <SettingsGroup
        title={t("默认导出文件夹")}
        help={t("留空表示自动，使用当前文档所在的目录。填入路径后，每次导出都写入该目录。")}
      >
        <SettingRow>
          <div className="stg-inline">
            <TextInput
              value={e.default_folder}
              width="lg"
              placeholder={t("自动（跟当前文档所在的目录）")}
              onChange={(default_folder) => 写({ default_folder })}
            />
            {/* ⚠️ 灰着而不是藏起来：藏起来用户会以为是自己没找到。
                `title` 里写明为什么——这是 Nota 对"没做完的东西"的一贯做法。 */}
            <ActionButton
              disabled
              title={t("尚未实现：目录选择器未接通，暂时需在左侧手动填写路径。")}
            >
              {t("选择…")}
            </ActionButton>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("导出之后")}>
        <SettingRow
          label={t("打开导出文件所在的目录")}
          help={t("导出完成后，用系统文件管理器打开该目录。")}
        >
          <Toggle
            checked={e.open_after_export}
            onChange={(open_after_export) => 写({ open_after_export })}
          />
        </SettingRow>
      </SettingsGroup>

      <Note>
        {/* ⚠️ **这里只能说 HTML**（2026-09-25 改，用户体验评估抓出来的）。
            原来写的是"能导出 HTML 和 PDF 两种"，而「文件 → 导出」里的
            「PDF…」是**灰的**（`App.tsx` 没接那一条，打印才是 PDF 的实际出路）。
            如实变灰是个好习惯，但设置页这条 Note 把它说反了——用户会以为
            自己没找到路，而不是"这条路还没修"。*/}
        {t("Nota 目前能导出")}
        {" "}
        <strong>HTML</strong>
        {t("（带样式和不带样式两种），上面这两条对它俩都生效。PDF 走「文件 → 打印」另存，")}
        <strong>{t("不")}</strong>
        {t("在导出这一支里。这里没有 Word / Epub / LaTeX 那些格式，也")}
        <strong>{t("不会")}</strong>
        {t(
          "内置 Pandoc——一个背后没有 Pandoc 的「Pandoc 路径」输入框，只会让人以为该功能可用，而实际不起作用。",
        )}
      </Note>
    </>
  );
}
