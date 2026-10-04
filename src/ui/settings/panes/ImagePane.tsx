/**
 * 「图像」那一页。**它是两半拼起来的**（2026-09-26 起）。
 *
 * ```text
 * 上半（本文件）        插入图片时 / 对哪些图片生效 / 图片语法偏好
 *                       └─ settings.toml 的 [image]，走 paneWriter
 * 下半（ImageUploadGroup）上传服务器
 *                       └─ image-upload.toml（0600），自己读自己写
 * ```
 *
 * ⚠️ 上半那些项**都真的在用**：算式在 `src-tauri/src/image.rs`，对话框、
 * 剪贴板、拖入三条路都走它。⚠️ 2026-09-26 之前不是这样——那时这六个字段
 * **一个消费者都没有**（`grep` 只命中定义、测试和这一页自己，见 `docs/07`
 * 第 62 项），页面上写着「复制到资源文件夹」，插进去的却还是原地址。
 * 改上半时请连着 `image.rs` 的用例一起看。
 *
 * # 为什么下半要拆一个文件（也为什么它在另一个盘上）
 *
 * 那一组是**把用户的字节送出这台机器**的功能：默认全关、没有服务商预设、
 * 令牌单独一个 0600 的文件。整组放在 `panes/ImageUploadGroup.tsx` 里，
 * 那儿的文件头写了它为什么不走 `paneWriter`、为什么「恢复出厂默认」不碰它。
 * 一页里两半的**存盘口径不同**，所以页首那段注记专门说这件事。
 */

import type { InsertImageAction } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Select, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { ImageUploadGroup } from "./ImageUploadGroup";
import { paneWriter, type PaneProps } from "./props";

export function ImagePane(props: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { settings, onChange } = props;
  const 写 = paneWriter(settings, onChange, "image");
  const i = settings.image;

  /**
   * 插入动作那一格的下拉。
   *
   * ⚠️ **必须写在组件里现建**，不能提到模块级当常量——理由与
   * `PluginDock.tsx::能力名` 那三张表相同：模块级求值时 `t` 还是**没订阅**的
   * 那个版本（首帧画的是兜底语言，之后也没人通知它重画）；另外
   * `tools/i18n-check.sh` 数的是**源码里字面写出来的 `t("…")`**，写成模块级的
   * `t(表[i])` 就不算调用，`en.ts` 里那几条会算"废键"→ 闸门 FAIL。
   */
  const INSERT: Array<{ value: InsertImageAction; label: string }> = [
    { value: "none", label: t("Nothing special") },
    { value: "copy-to-current-dir", label: t("Copy to the current folder") },
    { value: "copy-to-assets", label: t("Copy to ./assets") },
    { value: "copy-to-doc-assets", label: t("Copy to ./$(filename).assets") },
    { value: "copy-to-custom", label: t("Copy to a custom path") },
  ];

  return (
    <>
      {/*
        ⚠️ **2026-10-04：这里原本有一段说"整页"的 `<Note>`**（讲的是"上面那三个
        开关只管插进来的那一下、不会回头改已经写进文档的地址"）。按用户那一轮
        「删掉各种菜单下面大段大段的无用ai味描述」、尺度选「全删」的口径删掉了。
        那一页现在只有设置名 ＋ 控件，`docs/06` §5.44 那组截图是这一条的证据。

        ⚠️ 摆位置的那条规矩**没变**：说整页的注记摆在最外面、最前面，说某一组的
        注记要放进那一组里（见 `primitives.tsx` 里 `Note` 那几条；摆错位置的
        症状是"看着像下一组的标题"）。
      */}
      <SettingsGroup title={t("When inserting an image")}>
        <SettingRow>
          <Select
            value={i.insert_action}
            options={INSERT}
            onChange={(insert_action) => 写({ insert_action })}
          />
        </SettingRow>

        {i.insert_action === "copy-to-custom" && (
          <SettingRow label={t("Custom path")}>
            <TextInput
              value={i.custom_dir}
              width="lg"
              placeholder={t("e.g. /home/me/Pictures, or ./img")}
              onChange={(custom_dir) => 写({ custom_dir })}
            />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("Which images the rule above applies to")}>
        <SettingRow label={t("Images from local paths")}>
          <Toggle
            checked={i.apply_to_local}
            onChange={(apply_to_local) => 写({ apply_to_local })}
          />
        </SettingRow>

        <SettingRow label={t("Images from web URLs")}>
          <Toggle
            checked={i.apply_to_remote}
            onChange={(apply_to_remote) => 写({ apply_to_remote })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Image syntax preferences")}>
        <SettingRow label={t("Prefer relative paths")}>
          <Toggle
            checked={i.prefer_relative}
            onChange={(prefer_relative) => 写({ prefer_relative })}
          />
        </SettingRow>

        <SettingRow label={t("Add ./ to relative paths")}>
          <Toggle checked={i.add_dot_slash} onChange={(add_dot_slash) => 写({ add_dot_slash })} />
        </SettingRow>

        <SettingRow label={t("Escape URLs when inserting")}>
          <Toggle checked={i.escape_url} onChange={(escape_url) => 写({ escape_url })} />
        </SettingRow>
      </SettingsGroup>

      <ImageUploadGroup {...props} />
    </>
  );
}
