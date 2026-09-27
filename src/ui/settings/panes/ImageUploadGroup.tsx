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
    { value: "post", label: t("POST（multipart/form-data）") },
    { value: "put", label: t("PUT（裸字节）") },
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
        <strong>{t("上传设置读不出来：")}</strong>
        {毛病}
      </Note>
    );
  }

  return (
    <SettingsGroup
      title={t("上传服务器")}
      help={t(
        "把图片发到一台你自己的服务器上，正文里写传回来的那条网址。⚠ 默认关着；关着的时候插入图片一个字节都不会往外发。这一组存在 ~/.config/nota/image-upload.toml（权限 0600，因为它装着你的令牌），不在 settings.toml 里——所以「恢复出厂默认」不会动它。",
      )}
    >
      <SettingRow
        label={t("启用上传")}
        description={t("关着的时候：插图框里不出现上传勾选框，文档的 YAML 里写什么都不传。")}
      >
        <Toggle checked={设置.enabled} onChange={(enabled) => 写({ enabled })} />
      </SettingRow>

      {设置.enabled && (
        <>
          <SettingRow
            label={t("服务器地址")}
            description={t(
              "只认 http / https。⚠ 图片的字节会原样发到这条地址上，填之前先确认它是你自己的服务器。",
            )}
          >
            <TextInput
              value={设置.url}
              width="lg"
              placeholder={t("https://图床.example.com/upload")}
              onChange={(url) => 写({ url })}
            />
          </SettingRow>

          <SettingRow
            label={t("上传方式")}
            help={t(
              "POST 把图当表单文件发（大多数图床这样）；PUT 直接把字节当请求体发。⚠ 网络图片只能用 POST（表单里才有地方放那条原地址），所以选了 PUT 时网络图片不会被上传。",
            )}
          >
            <Select value={设置.method} options={方法表} onChange={(method) => 写({ method })} />
          </SettingRow>

          {设置.method === "post" && (
            <SettingRow
              label={t("文件字段名")}
              description={t(
                "图挂在表单的哪个字段上。各家叫法不同（file / smfile / image …），照服务方的文档填。",
              )}
            >
              <TextInput value={设置.field} onChange={(field) => 写({ field })} />
            </SettingRow>
          )}

          <SettingRow
            label={t("请求头")}
            description={
              <>
                {t("一行一条")}
                {" "}
                {/* ⚠️ 这一格是**示例的写法**（一行一条请求头长什么样），不是术语，
                    所以要翻：英文界面上留着「名字: 值」等于给了一个中文的例子。
                    判据是"用户在照着它写自己的东西"——`Authorization: Bearer …`
                    那一格是**真值示例**，所以它不翻（它是原样要抄进配置里的）。 */}
                <code>{t("名字: 值")}</code>
                {t("。令牌写这儿，例如")}
                {" "}
                <code>Authorization: Bearer …</code>
                {t("。空行和")}
                {" "}
                <code>#</code>
                {" "}
                {t("开头的行忽略。")}
              </>
            }
            help={t(
              "⚠ 值只允许 ASCII：出现中文会被 HTTP 客户端整条拒掉，而它报的是一句英文。⚠ Content-Type / Content-Length / User-Agent 这三个 Nota 自己会写，别在这儿重复填——填了会以你的为准，而长度拿不准的那种请求很多服务器不收。",
            )}
          >
            <TextArea
              value={设置.headers}
              mono
              rows={4}
              placeholder={t("Authorization: Bearer 你的令牌")}
              onChange={(headers) => 写({ headers })}
            />
          </SettingRow>

          <SettingRow
            label={t("从回话里取地址")}
            description={t(
              "服务方回的那段 JSON 里，网址在哪条路径上。留空 = 整段回话本身就是网址（纯文本接口）。",
            )}
            help={t(
              "点路径，例：data.url / data.links.url / result.0.url（数组下标也认）。默认 data.url 是多数图床的形状。",
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
            label={t("网络图片的字段名")}
            description={t(
              "插入一条网络图片时，把那条原地址当普通表单字段发过去，让服务器自己去取。留空 = 网络图片不上传（插入照旧，只是不传）。",
            )}
            help={t(
              "⚠ 默认空着，而且建议先空着：填了之后，勾一下「插入后上传」就等于替你去访问那个第三方，而你此刻的动作只是「往文档里写一条地址」。",
            )}
          >
            <TextInput
              value={设置.remote_field}
              placeholder="src"
              onChange={(remote_field) => 写({ remote_field })}
            />
          </SettingRow>

          <SettingRow
            label={t("允许根据 YAML 自动上传")}
            description={
              <>
                {t("文档自己的 front matter 里写着")}
                {" "}
                <code>nota-auto-upload: true</code>
                {" "}
                {t("时，插入的本地图片直接传上去，正文里写传回来的网址。")}
              </>
            }
            help={t(
              "⚠ 这是第二道闸，不是总开关：上面「启用上传」关着时它没有作用。⚠ 网络图片永远不自动上传（那等于替你去访问一个第三方），这一条没有开关。⚠ 每次自动上传都会弹一条提示，成功了也说——因为那是把字节送出去的动作。",
            )}
          >
            <Toggle checked={设置.auto} onChange={(auto) => 写({ auto })} />
          </SettingRow>
        </>
      )}

      {毛病 !== null && (
        <Note>
          <strong>{t("刚才那次没存成：")}</strong>
          {毛病}
        </Note>
      )}

      <Note>
        {设置.enabled ? (
          <>
            {t("这一组存在")}
            {" "}
            <code>~/.config/nota/image-upload.toml</code>
            {" "}
            {t(
              "（权限 0600，因为它装着你的令牌），也可以直接拿编辑器改那个文件——Nota 每次上传前都会重新读一遍，改完立刻生效。",
            )}
          </>
        ) : (
          <>
            {t(
              "上传默认是关着的。打开它之前先确认你要把图片发到哪台服务器上：从那一刻起，插入图片就可能把字节送出这台机器。",
            )}
          </>
        )}
      </Note>

      {/* ⚠️ 这个按钮不存任何值，是"做一件事"（`ActionButton`）。给它的用途是：
          这一组里有一栏是"一行一条"，手改那个文件往往比在这个框里改省事。 */}
      <SettingRow label={t("打开设置文件所在的目录")}>
        <ActionButton onClick={onOpenConfigDir}>{t("在文件管理器里打开")}</ActionButton>
      </SettingRow>
    </SettingsGroup>
  );
}
