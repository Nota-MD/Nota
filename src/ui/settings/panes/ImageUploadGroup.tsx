/**
 * 「上传服务器」那一组（住在「图像」页里，2026-09-26 加）。
 *
 * ```text
 * 这一组 ──> api.image.uploadGet()   ──> image-upload.toml（0600）
 *        └─> api.image.uploadSet(整份) ──> 每改一项立刻写一次
 * ```
 *
 * # ⚠️ 它**不走 `paneWriter`**，这是本仓唯一一组这样做的
 *
 * 其余七页的设置都在 `settings.toml` 里（`nota_settings_set` 整份替换，
 * 内存里那份由 `AppState` 热更新）。这一组**在另一个文件里**
 * （`~/.config/nota/image-upload.toml`，0600）：它装着用户的令牌，
 * 而 `settings.toml` 是 0644 的普通写盘——同一个文件里放不下两种权限。
 * 所以这一组**自己读、自己写、自己存一份 state**：
 *
 * - `settings` / `onChange`（`PaneProps` 那两个）在这一组里用不上，
 *   改这一组也不会顺手多写一次 `settings.toml`；
 * - 于是「恢复出厂默认」（那把整份 `Settings` 换掉的按钮）**不碰这一组**，
 *   这是**故意的**：把用户的令牌一起清掉，是那种"点了一下才发现"的损失。
 *   `docs/06` 那条口径（重置只重置 `settings.toml`）在这儿仍然成立。
 *
 * # 每改一项就写一次盘，没有「确定」
 *
 * 与其余七页同一条口径（`SettingsDialog` 顶上那段：改动已经写盘了，一个
 * 「取消」撤销不了它）。⚠️ 每次写都是**整份替换**，界面上先改、写失败就
 * **退回上一个值**并说一句——不退回的话，屏幕上显示的是一个从没落过盘的值，
 * 用户下次打开设置会发现自己的改动没了，而且不知道是什么时候没的。
 *
 * # ⚠️ 这里是"发令牌"的那一页，所以每一栏都写清楚字节往哪儿走
 *
 * 一栏 `headers` 里坐着令牌，而它**同时**要写进磁盘（0600）和发到一个用户填的
 * 地址上。这两件事都不适合"聪明一点"：不做服务商预设（没有 smms / picgo /
 * imgur 那种名字）、不做"自动探测接口"、不把令牌拆成一个密码框——拆成密码框
 * 就得**假定**所有服务都把它放在 `Authorization` 上。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type ImageUploadSettings, type ImageUploadMethod } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  ActionButton,
  Note,
  Select,
  SettingRow,
  SettingsGroup,
  TextArea,
  TextInput,
  Toggle,
} from "../primitives";
import type { PaneProps } from "./props";

export function ImageUploadGroup({ onOpenConfigDir }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  /**
   * 上传方式那一格的下拉。
   *
   * ⚠️ **必须写在组件里现建**，不能提到模块级当常量——理由与
   * `PluginDock.tsx::能力名` 那三张表相同：模块级求值时 `t` 还是**没订阅**的
   * 那个版本（首帧画的是兜底语言，之后也没人通知它重画）；另外
   * `tools/i18n-check.sh` 数的是**源码里字面写出来的 `t("…")`**，写成模块级的
   * `t(表[i])` 就不算调用，`en.ts` 里那几条会算"废键"→ 闸门 FAIL。
   */
  const 方法表: Array<{ value: ImageUploadMethod; label: string }> = [
    // ⚠️ 这一条也包了：句子里那个括号是**全角**的，英文界面上不该原样露出来。
    { value: "post", label: t("POST (multipart/form-data)") },
    { value: "put", label: t("PUT (raw bytes)") },
  ];

  // ⚠️ `null` = 还没读回来。读之前**什么都不画**：先画一份默认值再被真值替换，
  // 用户会看见"地址栏里的字闪了一下就没了"。
  const [设置, set设置] = useState<ImageUploadSettings | null>(null);
  const [毛病, set毛病] = useState<string | null>(null);
  /** 与 `设置` 同一份值，但**读得到最新的**——写失败时要退回的是它。
   *  （不能靠 state 的闭包：`写` 是个稳定的 callback，闭包里的 `设置` 是旧的。） */
  const 当前 = useRef<ImageUploadSettings | null>(null);

  useEffect(() => {
    let 拆了 = false;
    // ⚠️ `docId` 给 `null`：这一页**不知道当前是哪份文档**（设置框不收 docId），
    // 而它要的只是配置本身。返回值里那个 `willAutoUpload` 是"这份文档要不要
    // 自动传"，在这一页上没有意义（那张勾选框在插图框里，见 `ImageDialog`）。
    api.image
      .uploadGet(null)
      .then((s) => {
        if (拆了) return;
        当前.current = s.settings;
        set设置(s.settings);
      })
      .catch((e) => {
        if (!拆了) set毛病(String(e));
      });
    return () => {
      拆了 = true;
    };
  }, []);

  /**
   * 改一项：先改界面，再落盘；落盘失败就退回上一个值并说一句。
   *
   * ⚠️ **写盘不放进 `set设置` 的那个函数里**。那个函数是 React 的更新函数，
   * 要求是纯的：`StrictMode` 下它会跑两遍（开发模式），于是每一次改动会发两次
   * `uploadSet`——一次成功一次的报错看起来像"保存偶尔失败"。
   * 所以值从 `当前` 那个 ref 上取，更新函数只负责算出新的一份。
   */
  const 写 = useCallback((补丁: Partial<ImageUploadSettings>) => {
    const 旧 = 当前.current;
    if (!旧) return;
    const 新 = { ...旧, ...补丁 };
    当前.current = 新;
    set设置(新);
    api.image
      .uploadSet(新)
      .then(() => set毛病(null))
      .catch((e) => {
        // 退回**上一个值**（不是默认值）：写失败只说明这一次没成，
        // 前面那几次改动还在盘上。
        当前.current = 旧;
        set设置(旧);
        set毛病(String(e));
      });
  }, []);

  if (!设置) {
    // 读失败时说一句。**不画**一组灰控件：那些控件按下去也是往一个读不出来的
    // 路径里写。读成功但还没回来时什么都不画（见上面那条注释）。
    return 毛病 === null ? null : (
      <Note>
        <strong>{t("Could not read the upload settings: ")}</strong>
        {毛病}
      </Note>
    );
  }

  return (
    <SettingsGroup
      title={t("Upload server")}
      help={t(
        "Send images to a server of your own and put the returned URL in the document. ⚠ Off by default; while it is off, inserting an image sends nothing out. This group lives in ~/.config/nota/image-upload.toml (mode 0600, because it holds your token), not in settings.toml — so “Reset to Defaults” leaves it alone.",
      )}
    >
      <SettingRow
        label={t("Enable upload")}
        description={t("While off: no upload checkbox appears in the image dialog, and whatever the document's YAML says is ignored.")}
      >
        <Toggle checked={设置.enabled} onChange={(enabled) => 写({ enabled })} />
      </SettingRow>

      {设置.enabled && (
        <>
          <SettingRow
            label={t("Server URL")}
            description={t(
              "Only http / https. ⚠ The image's bytes are sent to this address as-is — make sure it is your own server before filling it in.",
            )}
          >
            <TextInput
              value={设置.url}
              width="lg"
              placeholder={t("https://images.example.com/upload")}
              onChange={(url) => 写({ url })}
            />
          </SettingRow>

          <SettingRow
            label={t("Upload method")}
            help={t(
              "POST sends the image as a form file (what most image hosts expect); PUT sends the raw bytes as the request body. ⚠ Remote images can only use POST (only a form has a place for the original URL), so with PUT selected they are not uploaded.",
            )}
          >
            <Select value={设置.method} options={方法表} onChange={(method) => 写({ method })} />
          </SettingRow>

          {设置.method === "post" && (
            <SettingRow
              label={t("File field name")}
              description={t(
                "Which form field the image goes into. Hosts differ (file / smfile / image …) — check your provider's docs.",
              )}
            >
              <TextInput value={设置.field} onChange={(field) => 写({ field })} />
            </SettingRow>
          )}

          <SettingRow
            label={t("Request headers")}
            description={
              <>
                {t("One per line")}
                {" "}
                {/* ⚠️ 这一格是**示例的写法**（一行一条请求头长什么样），不是术语，
                    所以要翻：英文界面上留着「名字: 值」等于给了一个中文的例子。
                    判据是"用户在照着它写自己的东西"——`Authorization: Bearer …`
                    那一格是**真值示例**，所以它不翻（它是原样要抄进配置里的）。 */}
                <code>{t("name: value")}</code>
                {t(". Put the token here, for example")}
                {" "}
                <code>Authorization: Bearer …</code>
                {t(". Blank lines and lines starting with")}
                {" "}
                <code>#</code>
                {" "}
                {t(" are ignored.")}
              </>
            }
            help={t(
              "⚠ Values must be ASCII: a non-ASCII character makes the HTTP client reject the whole request, and the error it reports is in English. ⚠ Nota writes Content-Type / Content-Length / User-Agent itself — do not repeat them here. Anything you put in wins, and many servers reject requests whose length is uncertain.",
            )}
          >
            <TextArea
              value={设置.headers}
              mono
              rows={4}
              placeholder={t("Authorization: Bearer your-token")}
              onChange={(headers) => 写({ headers })}
            />
          </SettingRow>

          <SettingRow
            label={t("Read the URL from the response")}
            description={t(
              "Where the URL sits in the JSON the server returns. Empty = the whole response is the URL (a plain-text endpoint).",
            )}
            help={t(
              "Dot path, e.g. data.url / data.links.url / result.0.url (array indices work too). The default data.url matches most image hosts.",
            )}
          >
            <TextInput
              value={设置.url_path}
              width="lg"
              placeholder="data.url"
              onChange={(url_path) => 写({ url_path })}
            />
          </SettingRow>

          <SettingRow
            label={t("Field name for remote images")}
            description={t(
              "When a remote image is inserted, send its original URL as an ordinary form field and let the server fetch it. Empty = remote images are not uploaded (they are still inserted, just not sent).",
            )}
            help={t(
              "⚠ Empty by default, and better left empty at first: once it is filled in, ticking “Upload after inserting” means visiting that third party on your behalf, when all you did was write an address into a document.",
            )}
          >
            <TextInput
              value={设置.remote_field}
              placeholder="src"
              onChange={(remote_field) => 写({ remote_field })}
            />
          </SettingRow>

          <SettingRow
            label={t("Allow automatic upload via YAML")}
            description={
              <>
                {t("the document's own front matter contains")}
                {" "}
                <code>nota-auto-upload: true</code>
                {" "}
                {t(", local images are uploaded as soon as they are inserted and the document gets the returned URL.")}
              </>
            }
            help={t(
              "⚠ This is a second gate, not the master switch: it does nothing while Enable upload above is off. ⚠ Remote images are never uploaded automatically (that would mean visiting a third party on your behalf) — there is no switch for it. ⚠ Every automatic upload shows a toast, successful ones included — it is the action that sends bytes out.",
            )}
          >
            <Toggle checked={设置.auto} onChange={(auto) => 写({ auto })} />
          </SettingRow>
        </>
      )}

      {毛病 !== null && (
        <Note>
          <strong>{t("That last save did not work: ")}</strong>
          {毛病}
        </Note>
      )}

      <Note>
        {设置.enabled ? (
          <>
            {t("This group lives in")}
            {" "}
            <code>~/.config/nota/image-upload.toml</code>
            {" "}
            {t(
              " (mode 0600, because it holds your token). You can also edit that file in any editor — Nota re-reads it before every upload, so changes take effect immediately.",
            )}
          </>
        ) : (
          <>
            {t(
              "Upload is off by default. Before turning it on, be sure which server you are sending images to: from that moment on, inserting an image can send bytes off this machine.",
            )}
          </>
        )}
      </Note>

      {/* ⚠️ 这个按钮不存任何值，是"做一件事"（`ActionButton`）。给它的用途是：
          这一组里有一栏是"一行一条"，手改那个文件往往比在这个框里改省事。 */}
      <SettingRow label={t("Open the folder holding the settings file")}>
        <ActionButton onClick={onOpenConfigDir}>{t("Open in the file manager")}</ActionButton>
      </SettingRow>
    </SettingsGroup>
  );
}
