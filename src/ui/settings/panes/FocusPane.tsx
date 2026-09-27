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
  ActionButton, Note, NumberInput, SettingRow, SettingsGroup, Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function FocusPane({ settings, onChange }: PaneProps) {
  const t = useT();
  const 写 = paneWriter(settings, onChange, "focus");
  const f = settings.focus;

  return (
    <>
      <SettingsGroup
        title={t("账户")}
        help={t(
          "把它想成一个账户：注意力在编辑器上时往里存，切到别处时从里扣。余额扣到零，警报就响。",
        )}
      >
        <SettingRow
          label={t("专注总时长")}
          description={t("账户余额的上限（分钟）。存满就封顶，不能先攒两小时额度再摸两小时鱼。")}
        >
          <NumberInput
            value={f.total_minutes}
            min={1}
            max={600}
            suffix={t("分钟")}
            onChange={(total_minutes) => 写({ total_minutes })}
          />
        </SettingRow>

        <SettingRow
          label={t("警报时长")}
          description={t(
            "开局给多少余额（分钟）。默认权重下，这就是「一直不写，多久会响」。调到比专注总时长还大，开局就是满的。",
          )}
        >
          <NumberInput
            value={f.alarm_minutes}
            min={1}
            max={600}
            suffix={t("分钟")}
            onChange={(alarm_minutes) => 写({ alarm_minutes })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("权重")}
        help={t("一分钟专注值多少、一分钟走神赔多少。两边都是「分钟」，所以默认的 1 和 1 是等价的；把下面那条调大就是惩罚重于奖励。")}
      >
        <SettingRow
          label={t("专注 1 分钟加多少")}
          description={t("默认 1，即写 1 分钟换 1 分钟额度。")}
        >
          <NumberInput
            value={f.gain_per_minute}
            min={0}
            max={10}
            step={0.5}
            suffix={t("分钟")}
            onChange={(gain_per_minute) => 写({ gain_per_minute })}
          />
        </SettingRow>

        <SettingRow
          label={t("离开 1 分钟扣多少")}
          description={t(
            "默认 1。调成 2 就是「写两分钟才够摸一分钟鱼」——要更狠该拧这一条，不是把警报时长调到很小。",
          )}
        >
          <NumberInput
            value={f.drain_per_minute}
            min={0}
            max={10}
            step={0.5}
            suffix={t("分钟")}
            onChange={(drain_per_minute) => 写({ drain_per_minute })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("宽限")}>
        <SettingRow
          label={t("刚切走多少秒不扣")}
          description={t(
            "默认 10 秒。切出去查个词、复制一行引用都要挨一刀的话，罚得太密就等于没罚。宽限期内不欠账：过了这 10 秒才从第 11 秒开始扣。填 0 就是一失焦就扣。",
          )}
        >
          <NumberInput
            value={f.grace_seconds}
            min={0}
            max={300}
            suffix={t("秒")}
            onChange={(grace_seconds) => 写({ grace_seconds })}
          />
        </SettingRow>

        {/* ⚠️ 这一格**没有 `description`**（别的格都有），是故意的：`description`
            那一栏在别处写的是"怎么用这一项"（"一行一个应用名，比如…"），
            而这一项**没法用**。留着那种说明，用户会去找那个输入框。 */}
        <SettingRow
          label={t("这些应用里不算摸鱼")}
          help={t(
            "这一条要读别的应用的名字（活动窗口的 WM_CLASS），而且只在 X11 上做得成。权衡之后没有做：这个功能的核心是「你离开没有」，不是「你去了哪儿」。",
          )}
        >
          {/* ⚠️⚠️ **灰着的，而且这一格不是"还没做完"——是"决定不做"。**
              用户 2026-09-26 明确砍掉了它（「宽限名单不用开了。把这个功能删掉吧，
              干脆」），字段已经从 `settings/focus.rs` 里删干净了。
              留着而不是藏起来，是**告诉用户"你找不到这条路不是因为你没找到"**
              （同 `ExportPane::选择…`、`FilesPane::恢复草稿`）。
              ⚠️ 但那几处的 `title` 都以「尚未实现」开头，这一格**故意不跟**：
              那三格是会做的，这一格是不做的。写成一样的，用户会一直等它。
              为什么不做，写在 `focus/mod.rs` 模块头「它不做什么」那一段。 */}
          <ActionButton disabled title={t("决定不做：它要读别的应用的活动窗口，为了这个功能不值得越过应用的边界。")}>
            {t("未启用")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("警报")}>
        <SettingRow
          label={t("响警报")}
          description={t("在警报窗弹出的同时放一段尖锐的警报声。关掉它就是「只弹不响」——图书馆里有用。")}
        >
          <Toggle checked={f.sound} onChange={(sound) => 写({ sound })} />
        </SettingRow>
      </SettingsGroup>

      {/* ⚠️ 这一块**不是装饰**，是用户点名要的（2026-09-26）：
          「明确的告诉用户这可能会用到什么系统权限，并且保证不会窃取你的任何数据」。
          首次进入时弹的那一次说明（`ui/useFocusIntro.ts`）说的是同一件事，
          这里是它**事后还能查**的那一份。两处措辞要一致，改一处要改两处。
          ⚠️ 完整的权限清单在**关于**页（用户点名要的另一个位置）。 */}
      <Note>
        <strong>{t("它会用到什么")}</strong>
        <br />
        {t(
          "① 知不知道 Nota 的窗口是不是当前窗口（不然没法判断你有没有走神）；② 弹出一个置顶的红色窗口（不然你已经切走了，看不见）；③ 出声。",
        )}
        <br />
        {t(
          "这三条只在强制专注运行期间发生，只针对 Nota 自己的窗口。Nota 不读键盘、不截屏、不碰别的程序，也不把你的任何数据发到任何地方。",
        )}
        <br />
        {t("你能随时停掉它，也能用系统工具绕开它——但那样一来，你设这个模式也就没有意义了。")}
      </Note>
    </>
  );
}
