/**
 * 「强制专注」那一页。
 *
 * ⚠️⚠️ **这是一个核心功能的设置页，不是插件的。** 用户 2026-09-26 的原话是
 * 「注意啊，这不是插件。这是核心功能」——它要窗口焦点、要开一个置顶窗、要出声，
 * 三样都在插件沙箱之外（`docs/12` §4.7a）。
 *
 * # 这一页要解释的是"账户"
 *
 * 用户定的模型（原话在 `src-tauri/src/settings/focus.rs` 文件头）是：
 * 一个账户，专注往里存、走神从里扣、扣光就响。四个旋钮**各自的话都要说清楚**，
 * 因为"专注总时长"和"警报时长"这两个名字自己会骗人——
 *
 * - 「专注总时长」不是"这一轮要坐多久"，是**账户的上限**；
 * - 「警报时长」不是"每隔多久响一次"，是**开局给多少**，也就是
 *   **默认权重下"一直不写，多久会响"**。
 *
 * ⚠️ 所以这一页上每一条的 `description` 都不是装饰。改文案时先把那两句
 * 读一遍——把它们说成"计时器"，就等于把这个功能的设计讲反了。
 *
 * # ⚠️ 会话状态不在这里
 *
 * 此刻余额还剩多少、已经响过几次，**这一页一个字都不显示**——那是会话状态
 * （只在内存里、每秒都在变），它的出口是状态栏那一格
 * （`ui/FocusMeter.tsx`）。设置页显示一个每秒跳动的数会让整页都在重画，
 * 而用户来这一页是为了**改参数**，不是为了看表。
 */

import { useT } from "@/i18n";
import {
  ActionButton, NumberInput, SettingRow, SettingsGroup, Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function FocusPane({ settings, onChange }: PaneProps) {
  const t = useT();
  const write = paneWriter(settings, onChange, "focus");
  const f = settings.focus;

  return (
    <>
      <SettingsGroup title={t("Account")}>
        <SettingRow label={t("Total focus time")}>
          <NumberInput
            value={f.total_minutes}
            min={1}
            max={600}
            suffix={t("min")}
            onChange={(total_minutes) => write({ total_minutes })}
          />
        </SettingRow>

        <SettingRow label={t("Alarm time")}>
          <NumberInput
            value={f.alarm_minutes}
            min={1}
            max={600}
            suffix={t("min")}
            onChange={(alarm_minutes) => write({ alarm_minutes })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Weights")}>
        <SettingRow label={t("Focus credit per minute")}>
          <NumberInput
            value={f.gain_per_minute}
            min={0}
            max={10}
            step={0.5}
            suffix={t("min")}
            onChange={(gain_per_minute) => write({ gain_per_minute })}
          />
        </SettingRow>

        <SettingRow label={t("Charge per minute away")}>
          <NumberInput
            value={f.drain_per_minute}
            min={0}
            max={10}
            step={0.5}
            suffix={t("min")}
            onChange={(drain_per_minute) => write({ drain_per_minute })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Grace period")}>
        <SettingRow label={t("Grace before charging")}>
          <NumberInput
            value={f.grace_seconds}
            min={0}
            max={300}
            suffix={t("sec")}
            onChange={(grace_seconds) => write({ grace_seconds })}
          />
        </SettingRow>

        {/* ⚠️ 这一格**没有 `description`**（别的格都有），是故意的：`description`
            那一栏在别处写的是"怎么用这一项"（"一行一个应用名，比如…"），
            而这一项**没法用**。留着那种说明，用户会去找那个输入框。 */}
        <SettingRow label={t("These apps do not count as slacking")}>
          {/* ⚠️⚠️ **灰着的，而且这一格不是"还没做完"——是"决定不做"。**
              用户 2026-09-26 明确砍掉了它（「宽限名单不用开了。把这个功能删掉吧，
              干脆」），字段已经从 `settings/focus.rs` 里删干净了。
              留着而不是藏起来，是**告诉用户"你找不到这条路不是因为你没找到"**
              （同 `ExportPane::选择…`、`FilesPane::恢复草稿`）。
              ⚠️ 但那几处的 `title` 都以「尚未实现」开头，这一格**故意不跟**：
              那三格是会做的，这一格是不做的。写成一样的，用户会一直等它。
              为什么不做，写在 `focus/mod.rs` 模块头「它不做什么」那一段。 */}
          <ActionButton disabled title={t("Decided against: it would have to read other applications' active window, and this feature is not worth crossing the application boundary for.")}>
            {t("Not enabled")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Alarm")}>
        <SettingRow label={t("Play the alarm")}>
          <Toggle checked={f.sound} onChange={(sound) => write({ sound })} />
        </SettingRow>
      </SettingsGroup>

      {/* ⚠️ 这一块**不是装饰**，是用户点名要的（2026-09-26）：
          「明确的告诉用户这可能会用到什么系统权限，并且保证不会窃取你的任何数据」。
          首次进入时弹的那一次说明（`ui/useFocusIntro.ts`）说的是同一件事，
          这里是它**事后还能查**的那一份。两处措辞要一致，改一处要改两处。
          ⚠️ 完整的权限清单在**关于**页（用户点名要的另一个位置）。 */}
    </>
  );
}
