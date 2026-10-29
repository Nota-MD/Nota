/**
 * 「文档主题」那一页：显示现在用的是哪套（换主题去「主题」菜单），外加
 * **正文排版那四个可调项**（2026-09-27 加）。
 *
 * # 为什么和「外观」分开两页
 *
 * 2026-09-23 划的线（原话：「这是文档风格，不是界面风格，不应该影响到
 * UI 主题」）。所以这两件事在界面上也分开摆：**外观**管整个应用，
 * **文档主题**只管编辑区。
 *
 * # ⚠️ 这一页没有**主题选择器**
 *
 * 只显示现在用的是哪套、以及去哪儿换。放一个下拉在这儿就会和「主题」菜单
 * 变成**两个真相源**——菜单换了一套、这一页还显示着旧的，谁都不报错。
 *
 * ⚠️ 唯一的例外是「深色模式下单独用一套」，它在**外观**那一页（那条偏好和
 * 明暗绑在一起，放这边反而要跨页解释）。
 *
 * ⚠️ **「正文排版」那一组不是这条规矩的例外**：那四项里没有一个能换主题，
 * 它们回答的是"主题给的默认值里哪几项我不听它的"——**主题菜单里没有这一档**，
 * 所以不存在两个真相源。而它们住这一页的理由是：它们**只作用于正文**，
 * 一个像素都不出编辑区，和这一页管的是同一块地方（`settings/document.rs`）。
 *
 * # ⚠️ 下面那个「⚠️ 深色下用的是另一套」组**必须带一行 `SettingRow`**
 *
 * `settings.css` 里有一条 `.stg-group:not(:has(.stg-row)) { display: none }`，
 * 它是**搜索**那一套的一部分（一个组的行全被查询过滤掉时，整组收起来）。
 * 它成立的前提是"每个组至少有一行"。
 *
 * 2026-09-25 实测踩中：那个组当时只有一个 `<Note>`，于是**整组被这条规则抹掉**，
 * 界面上什么都不出现、控制台一个字都不报——查了很久才发现。所以那一组现在
 * 挂着一行「浅色下用的是」（那行本身也有用：一眼看到两套各是什么）。
 * **删掉那一行 = 删掉这个组**，不是"少一行说明"。
 */

import { useT } from "@/i18n";
import {
  ActionButton,
  NumberInput,
  Select,
  SettingRow,
  SettingsGroup,
  Toggle,
  Value,
} from "../primitives";
import { useUiMode } from "@/ui/useUiMode";
import { generateEffectOfDocumentTheme, darkDedicatedUseAtGenerateEffect } from "@/ui/useDocTheme";
import { paneWriter, type PaneProps } from "./props";

export function DocThemePane({ settings, docThemes, onOpenThemesDir, onChange }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  // 改本页里的一项（`document` 那张表）。⚠️ 走 `paneWriter` 而不是自己展开
  // `settings.document`：漏展开一次就是"改了这一项、别的四项全落回默认"。
  const d = settings.document;
  const write = paneWriter(settings, onChange, "document");
  // ⚠️ **显示的必须是"现在生效的那一套"**，而不是 `settings.document_theme`。
  // 2026-09-25 起「外观 → 深色模式」里那两档真的会换主题：深色下如果指定了
  // 独立的一套，生效的是它——照 `document_theme` 显示的话，这一页会当着面
  // 报一个错的主题名（而这一页唯一的作用就是回答"现在是哪套"）。
  //
  // ⚠️ 判据走 `useDocTheme` 里那两个**导出的纯函数**，不在本文件里再写一遍：
  // 同一个问题两处各答一次，迟早会出现"这一页说 A、菜单换的是 B"。
  const mode = useUiMode(settings.ui_mode);
  const generateEffectid = generateEffectOfDocumentTheme(settings, mode);
  const darkThatValueSetAtGenerateEffect = darkDedicatedUseAtGenerateEffect(settings, mode);

  /** 主题 id → 给人看的名字。**一处口径**：空串是「无主题（内置）」，
   *  清单里没有的 id（比如主题文件被删了）就照原样显示 id，不假装它没名字。 */
  const showName = (id: string) => {
    if (!id) return t("No Theme (Built-in)");
    const has = docThemes.find((t) => t.id === id);
    if (has) return has.name;
    // ⚠️ 认不出的 id **照原样显示**（原始 id 是线索），但后面要**说清它此刻没生效**。
    //
    // 2026-09-26 内置主题换过一批（用户要求「删掉所有默认主题」），老机器上
    // `settings.toml` 里那些旧 id 就这么悬空了；那时应用**安静地退回无主题**
    // （`useDocTheme.ts` 里那段写着为什么不弹错）。只显示一个 `paper` 会让人
    // 以为主题还在——编辑区其实是中性样式，这一页唯一的作用就是回答"现在是哪套"。
    //
    // ⚠️ 但**不能**把它当成"没有主题"一笔抹掉：`.css` 是用户自己往
    // 「主题文件夹」里放的，文件一放回来这个 id 立刻就生效了。
    return t("{0} (theme not found — showing No Theme instead)", id);
  };

  return (
    <>
    <SettingsGroup title={t("Document Themes")}>
      <SettingRow label={t("Current theme")}>
        <Value>{showName(generateEffectid)}</Value>
      </SettingRow>

      <SettingRow label={t("Document themes folder")}>
        {/* ⚠️ 这一行故意**没有** `htmlFor`：`<button>` 不是可标注控件，
            点标签文字会意外触发一次「打开文件夹」（见 `primitives.tsx`）。 */}
        <ActionButton onClick={onOpenThemesDir}>{t("Document themes folder…")}</ActionButton>
      </SettingRow>
    </SettingsGroup>

    {/* ── 正文排版（四个可调项）────────────────────────────────────────────
        ⚠️ 四项**各自独立**，而且**默认全关**（跟随主题）：主题给一套默认值，
        用户在这儿逐项盖掉。开关关着时那个值**不算数**——所以数字框一律
        `disabled={!d.custom_xxx}`，让"这项现在听谁的"一眼看得出来。
        ⚠️ 四项各自成组（而不是挤成一组八行）：组标题就是那一项的名字，
        与「段首缩进」那一组的写法一致，搜索也能按组名搜到。
        ⚠️ **2026-10-04**：这里原本还有一条 `<Note>`，讲"改这里的东西看着像
        改了文档、实际一个字节都不写盘"。按用户那一轮「全删」的口径删掉了。
        那件事现在由底下「四项作用范围」那一组回答（一行 `Value`，
        用户点名「全删」时我按"一行事实、不是一段话"留了下来）。 */}
    <SettingsGroup title={t("Line height")}>
      <SettingRow>
        <Toggle
          checked={d.custom_line_height}
          onChange={(custom_line_height) => write({ custom_line_height })}
        />
      </SettingRow>
      <SettingRow label={t("Line-height multiple")}>
        <NumberInput
          value={d.line_height}
          min={100}
          max={300}
          step={5}
          suffix="%"
          disabled={!d.custom_line_height}
          onChange={(line_height) => write({ line_height })}
        />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup title={t("Paragraph spacing")}>
      <SettingRow>
        <Toggle
          checked={d.custom_paragraph_gap}
          onChange={(custom_paragraph_gap) => write({ custom_paragraph_gap })}
        />
      </SettingRow>
      <SettingRow label={t("Spacing size")}>
        <NumberInput
          value={d.paragraph_gap}
          min={0}
          max={300}
          step={5}
          suffix="%"
          disabled={!d.custom_paragraph_gap}
          onChange={(paragraph_gap) => write({ paragraph_gap })}
        />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup title={t("Body font")}>
      <SettingRow>
        <Toggle checked={d.custom_font} onChange={(custom_font) => write({ custom_font })} />
      </SettingRow>
      <SettingRow label={t("Font family")}>
        <Select
          value={d.font}
          options={[
            { value: "sans", label: t("Sans-serif") },
            { value: "serif", label: t("Serif") },
            { value: "mono", label: t("Monospace") },
          ]}
          disabled={!d.custom_font}
          onChange={(font) => write({ font })}
        />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup title={t("Body font size")}>
      <SettingRow>
        <Toggle
          checked={d.custom_font_size}
          onChange={(custom_font_size) => write({ custom_font_size })}
        />
      </SettingRow>
      <SettingRow label={t("Size multiple")}>
        <NumberInput
          value={d.font_size}
          min={80}
          max={200}
          step={2}
          suffix="%"
          disabled={!d.custom_font_size}
          onChange={(font_size) => write({ font_size })}
        />
      </SettingRow>
    </SettingsGroup>

    {/* ⚠️ 这一组**没有任何控件**，它不是设置项，是上面四项**共用的那句实话**。
        单独成组（而不是挂进某一项的 `help`）是因为它同时管四项；而它必须挂
        一行 `.stg-row`/`Value`（就是本页「当前主题」那一行的写法），
        理由见本文件顶上那条 `:not(:has(.stg-row))` 的规矩。
        ⚠️ **2026-10-04 它没跟着那批 `<Note>` 一起删**：它只有一行、说的是
        "改这儿不动文件"这件后果最大的事（不是描述、不是推荐），所以留下。
        本页的 `help` / `<Note>` 都已经没有了，这是唯一还在的一句。 */}
    <SettingsGroup title={t("Scope of the four items above")}>
      <SettingRow label={t("Scope")}>
        <Value>{t("Display only — the file is untouched")}</Value>
      </SettingRow>
    </SettingsGroup>

    {darkThatValueSetAtGenerateEffect && (
      <SettingsGroup title={t("Dark mode uses a separate set of settings")}>
        {/* ⚠️ 这一行是这个组**画得出来的前提**，不是装饰：组里一行 `.stg-row`
            都没有时 `settings.css` 会把整组 `display: none` 掉（搜索那一套规则的
            副作用）。理由和实测经过见本文件顶上的文件头。 */}
        <SettingRow label={t("Light mode uses")}>
          <Value>{showName(settings.document_theme)}</Value>
        </SettingRow>
      </SettingsGroup>
    )}
    </>
  );
}
