/**
 * 「通用」那一页。
 *
 * ⚠️⚠️ **本页只有两组，另加三段说明。** 逐条说明为什么，
 * 而且这些理由**出现在界面上**（「对话框」「快捷键」两组里各有一段，
 * 页尾还有一段）——不是"偷偷不做"，而是"明说这一条为什么不该有"：
 *
 * | 没做的那一项 | 理由 |
 * |---|---|
 * | 语言（重启后生效） | **做了**（2026-09-25，用户要求）。⚠️ 但要说实话：**英文翻译现在只覆盖插件那一面**（插件栏、面板内容块、编辑区预览），应用其余部分仍是中文。两者一起换才不会出现"界面英文、插件中文"的中间态。 |
 * | 许可证信息 | **改为直接显示许可证**。Nota 是 BSD-2-Clause，没有"激活"这回事。 |
 * | 快捷键 | 有，但不在这页——**独立的「快捷键」页**。 |
 * | 重置全部警告提示对话框 | **不做**。它要的是一份"用户点过不再提示"的记录，而 Nota 目前一个可静音的对话框都没有。留一个按了没反应的按钮更糟。 |
 * | 高级设置 | **做**，落法不同：见下面「高级设置」那一组。 |
 * | 发送匿名使用数据 | **不做**。`docs/10-feature-matrix.md` 的「不做的事与理由」表里写着：无遥测、无许可证校验。 |
 * | 在线服务器设置 | **不适用**。Nota 不发任何网络请求。 |
 *
 * ⚠️ 「高级设置」在别处是**另开一个窗口**编辑一份配置文件。
 * Nota 不做第二个设置界面——设置本身就是一份 TOML，直接打开那个文件夹、
 * 或者一键恢复默认，比再造一个窗口更简单。
 */

import { useEffect, useState } from "react";

import { api, type AppLang } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { ActionButton, Note, SettingRow, SettingsGroup, Select, Toggle, Value } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function GeneralPane({ settings, onChange, onOpenConfigDir, onResetSettings }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "general");

  // 可选的语言**由宿主给**（`nota_app_lang.available`），前端不列第二份。
  // 拉不到就只画「自动」——下拉少几项比画错标签好。
  const [语言表, set语言表] = useState<AppLang | null>(null);
  useEffect(() => {
    let 还活着 = true;
    void api
      .appLang()
      .then((r) => {
        if (还活着) set语言表(r);
      })
      .catch(() => {
        // 拉不到不算错误：这一页其余部分照常能用，下拉里就只剩「自动」。
      });
    return () => {
      还活着 = false;
    };
  }, []);

  return (
    <>
      <SettingsGroup
        title={t("界面语言")}
        help={t(
          "⚠️ 重启后生效。理由：拓展在启动时按这个语言读好了自己的文案表（lang/<tag>.toml），运行中换语言就得把所有拓展重新装一遍（跑 on_unload / on_load，里面有 git、有 HTTP）。改完这里，重启一次。",
        )}
      >
        <SettingRow
          label={t("语言")}
          help={t(
            "「自动」= 跟系统走（看 LC_ALL / LC_MESSAGES / LANG）。⚠ 系统语言不在支持列表里时落到英语。",
          )}
          description={
            语言表
              ? t("现在实际在用：{0}（这一格存的是设定，可能是「自动」）", 语言表.effective)
              : t("正在读可选语言…")
          }
        >
          <Select
            value={settings.general.language}
            onChange={(language) => 写({ language })}
            options={[
              { value: "auto", label: t("自动（跟系统走）") },
              // ⚠️ `l.label` **不包 `t()`**：那是宿主送来的数据（`nota_app_lang`
              // 的 `available`），语言名要用**它自己那门语言**写，见
              // `src-tauri/src/lang.rs::语言名`。
              ...(语言表?.available ?? []).map((l) => ({ value: l.tag, label: l.label })),
            ]}
          />
        </SettingRow>

        {/* ⚠️ 2026-09-26 改的：这一段原来写的是「英文翻译**现在还只覆盖插件那一面**」。
            英文表当天铺到了整个界面，那句话就成了**界面在撒谎**——用户读完会以为
            菜单、设置那些地方还是中文，于是根本不去试。这类"曾经为真"的说明句
            没有东西会提醒它过期，只能靠改语言这件事**同批**改掉。 */}
        <Note>
          {t("英文翻译")}
          <strong>{t("现在覆盖整个界面")}</strong>
          {t("：菜单栏、设置、状态栏、侧边栏、对话框、拓展栏都在里面。两半是同一套规矩、同一批切换的，所以宁可两边一起换。")}
        </Note>
      </SettingsGroup>

      <SettingsGroup
        title={t("调试模式")}
        help={t(
          "把内部的诊断信息也输出到控制台（开发者工具的 Console）。⚠ 它只增加日志、不改变行为——任何「开着调试模式就换一套代码路径」的设计，都会让「我这里没问题」这类反馈失去可信度。默认关闭：绝大多数用户看不到控制台，只会觉得程序变卡。",
        )}
      >
        <SettingRow>
          <Toggle checked={settings.general.debug_mode} onChange={(debug_mode) => 写({ debug_mode })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("高级设置")}
        help={t(
          "Nota 的设置就是一份纯文本的 TOML，没有第二套界面。要改界面上没有的项，直接编辑那个文件；改坏之后用下面那颗按钮恢复出厂状态。",
        )}
      >
        <SettingRow
          label={t("设置文件")}
          help={t(
            "改完存盘、重启 Nota 生效。⚠ 手动编辑时要注意：标量要写在所有 [表] 之前，写在表后面会被悄悄忽略（那一项照旧用默认值，不报错）。",
          )}
        >
          <ActionButton onClick={onOpenConfigDir}>{t("打开文件夹…")}</ActionButton>
        </SettingRow>

        <SettingRow
          label={t("恢复出厂设置")}
          help={t(
            "把所有设置项一次性恢复为默认值。⚠ 只修改设置，不改动文档——正文、文件、主题 CSS 都不受影响。",
          )}
        >
          <ActionButton onClick={onResetSettings}>{t("恢复默认")}</ActionButton>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("许可证")}>
        <SettingRow label="Nota">
          <Value>BSD-2-Clause</Value>
        </SettingRow>
        <SettingRow label={t("界面图标")}>
          <Value>{t("BSD-2-Clause（Folio，同一作者）")}</Value>
        </SettingRow>

        <Note>
          {t("完整的第三方组件清单、各自的版本与许可证在仓库根目录的")}
          {" "}
          <code>THIRD-PARTY.md</code>
          {" "}
          {t("里。Nota")}
          {" "}
          <strong>{t("不发任何网络请求")}</strong>
          {t("，没有遥测，也没有激活。")}
        </Note>
      </SettingsGroup>

      <SettingsGroup title={t("对话框")}>
        <Note>
          {t(
            "这里没有「重置全部警告提示对话框」：那需要有「点过不再提示」的记录，而 Nota 目前还没有一个可静音的对话框。等真的出现可静音对话框之后再补，现在放一颗按了没反应的按钮，比没有更糟。",
          )}
        </Note>
      </SettingsGroup>

      <SettingsGroup title={t("快捷键")}>
        <Note>
          {t("键位一览在左边的")}
          <strong>{t("「快捷键」")}</strong>
          {t("那一页——它是从菜单里读出来的，所以不会和菜单上写的对不上。")}
        </Note>
      </SettingsGroup>

      <Note>
        {t("这一页")}
        <strong>{t("有意")}</strong>
        {t("少了三项：许可证信息（见上面「许可证」那一组）、匿名使用数据（不做遥测）、在线服务器设置（Nota 不发任何网络请求）——理由逐条写在")}
        {" "}
        <code>docs/10-feature-matrix.md</code>
        {t("和")}
        <code>settings/general.rs</code>
        {t("顶上。")}
      </Note>
    </>
  );
}
