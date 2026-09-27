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
import { Note, Select, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
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
    { value: "none", label: t("无特殊操作") },
    { value: "copy-to-current-dir", label: t("复制到当前目录") },
    { value: "copy-to-assets", label: t("复制到 ./assets") },
    { value: "copy-to-doc-assets", label: t("复制到 ./$(filename).assets") },
    { value: "copy-to-custom", label: t("复制到指定路径") },
  ];

  return (
    <>
      {/*
        ⚠️ 这一段说**整页**的事，所以摆在最外面、最前面（说某一组的注记要放进
        那一组里，见 `primitives.tsx` 里 `Note` 那几条；摆错位置的症状是
        "看着像下一组的标题"）。
      */}
      <Note>
        <strong>{t("这一页的两半存在两个文件里。")}</strong>
        {t("上面那些（插入动作、适用范围、语法偏好）在")}
        {" "}
        <code>settings.toml</code>
        {t("里，「通用 → 恢复出厂默认」会把它们重置；下面那一组上传设置在")}
        {" "}
        <code>~/.config/nota/image-upload.toml</code>
        {" "}
        {t("里（权限 0600，因为它装着令牌），")}
        <strong>{t("不会被重置")}</strong>
        {t("——把令牌一起清掉是那种点了一下才发现的损失。")}
      </Note>

      <SettingsGroup
        title={t("插入图片时")}
        help={t(
          "⚠ 除「无特殊操作」外都会向磁盘额外写入一个文件（原图仍留在原处），因此必须显式选中，默认为「无特殊操作」。",
        )}
      >
        <SettingRow>
          <Select
            value={i.insert_action}
            options={INSERT}
            onChange={(insert_action) => 写({ insert_action })}
          />
        </SettingRow>

        {i.insert_action === "copy-to-custom" && (
          <SettingRow
            label={t("指定路径")}
            help={t(
              "绝对路径照用；相对路径按文档所在的目录算（不是应用的工作目录）。⚠ 目录不存在会建出来。",
            )}
          >
            <TextInput
              value={i.custom_dir}
              width="lg"
              placeholder={t("例如 /home/我/图片，或 ./img")}
              onChange={(custom_dir) => 写({ custom_dir })}
            />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("上面那条规则对哪些图片生效")}>
        <SettingRow label={t("本地位置的图片")}>
          <Toggle
            checked={i.apply_to_local}
            onChange={(apply_to_local) => 写({ apply_to_local })}
          />
        </SettingRow>

        <SettingRow
          label={t("网络位置的图片")}
          help={t(
            "默认不勾选：网络图片通常是有意引用原始地址（换一台机器打开也应当可见）。⚠ 勾上之后，插入网络图片时 Nota 会联网把它下载下来再放到上面那个目录——这是本应用替你去取一个你已经写在文档里的地址，但它是联网动作，所以默认关着。",
          )}
        >
          <Toggle
            checked={i.apply_to_remote}
            onChange={(apply_to_remote) => 写({ apply_to_remote })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("图片语法偏好")}>
        <SettingRow
          label={t("优先写相对路径")}
          help={t(
            "⚠ 只朝一个方向动：你给的是一条绝对路径时，换算成相对文档目录的写法。本来就是相对的地址原样保留；Nota 自己复制/下载出来的那一份总是相对路径，不看这一项。",
          )}
        >
          <Toggle
            checked={i.prefer_relative}
            onChange={(prefer_relative) => 写({ prefer_relative })}
          />
        </SettingRow>

        <SettingRow
          label={t("为相对路径添加 ./")}
          help={t("⚠ 只在最终写出来的是相对路径时才有意义（已经是 ./ 或 ../ 开头的不再加）。")}
        >
          <Toggle checked={i.add_dot_slash} onChange={(add_dot_slash) => 写({ add_dot_slash })} />
        </SettingRow>

        <SettingRow
          label={t("插入时自动转义 URL")}
          help={t(
            "空格变成 %20、`?` 变成 %3F 这类。⚠ 中文等非 ASCII 字符不转（转了地址就没法看了）；网络地址里的 ? # % 也不转（它们是查询串和锚点，而且你贴进来的多半已经编码好了——再转一遍会把 %20 变成 %2520）。只在插入那一刻处理，不会回头去改文档里已经写着的地址。",
          )}
        >
          <Toggle checked={i.escape_url} onChange={(escape_url) => 写({ escape_url })} />
        </SettingRow>
      </SettingsGroup>

      <ImageUploadGroup {...props} />
    </>
  );
}
