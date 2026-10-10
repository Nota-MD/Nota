/**
 * 「拓展」那一页 —— 插件的**管理面板**（2026-09-27 加）。
 *
 * 用户 2026-09-27：「完全没有拓展管理面板。做一个。可以**导入，导出和卸载**拓展」。
 * 2026-10-04 又加了一件事：**插件声明给宿主画的设置**就在这一页上
 * （用户那天要的是一根"打字速度按几秒算"的滑杆，原话：「这个德尔塔t可以在拓展的
 * 设置页面更改，默认为5秒。应该是一个托条，从1秒到1分钟可选」）。
 * 形状由清单里的 `[[settings]]` 声明，这里**照着画**、不认插件 id
 * （加这一块时一个 `if (p.id === "nota.stats")` 都不许有）。
 *
 * # 与右侧「插件」栏的分工
 *
 * 右侧那一栏（`PluginDock.tsx` 的「插件」页）是**诊断用的**：哪个插件加载失败了、
 * 申请了哪些能力，出问题时第一眼看那里。它的位置也决定了它只能"顺手看一眼"——
 * 栏宽 260px，插件一多就得滚着读。
 *
 * 这一页是**管理用的**：装 / 导出 / 卸载三件事摆在一条行上，宽度够、能对着读完
 * 再决定。两边用的是**同一份数据、同一批动作**（`usePlugins` 的 `plugins` 与
 * `动作`），所以不会出现"这一栏说装好了、那一页还没有"这种两份真相源。
 *
 * ⚠️ **设置那几行只在这一页**（不在右侧那一栏）：栏宽 260px 放不下一根滑杆加
 * 一句说明，而且那一栏是"看"的、这一页是"改"的——见上面那张分工。
 *
 * # ⚠️ 导入 / 导出 / 卸载三件事里，只有**导出**是这一轮新做的
 *
 * 装（`nota_plugin_install`）与卸（`nota_plugin_uninstall`）早就在，右侧那一栏
 * 一直在用。缺的是导出——它原来**根本不存在**：宿主那边写着「包是只读的」
 * （`plugin/package.rs` 文件头），打包那半在作者侧的 `tools/pack-plugin.py` 里
 * （要拿私钥签名，私钥绝不能进宿主）。
 *
 * 现在补的这一半是**把用户磁盘上已经躺着的那份收成一个包**（`plugin/export.rs`），
 * 一个字节都不签。⚠️ 所以「导出」不是"另存为一份可以发给别人的插件"那么直白：
 * 用户改过插件文件的话，作者原来那个签名会被**摘掉**——带着一个对不上的签名，
 * 收到的人根本装不上（那是硬拒路径），而报的还是"这个包被改过"，
 * 看起来像发的人做了手脚。这件事只有导出完的那句提示能告诉他。
 *
 * ⚠️ 本页**不吃 `{...props}`**（同「快捷键」那一页）：它要的东西（插件清单、
 * 信任表、那几颗按钮）与设置项一点关系都没有，整包铺过来只会让人以为
 * 它也读设置。
 */

import type { PluginInfo, 信任记录 } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { 来源说明, 能力名, 语言对不上, 语言提示, 语言标签名 } from "@/ui/pluginText";
import type { 插件动作 } from "@/ui/usePlugins";
import {
  ActionButton,
  Note,
  Range,
  SettingRow,
  SettingsGroup,
  TextInput,
  Toggle,
  Value,
} from "../primitives";

/**
 * 这一页要的三样。
 *
 * ⚠️ 单独一个接口而不是 `PaneProps`（理由见文件头最后一段）。三样都是
 * `usePlugins` 那一份（`App.tsx` 里同一个 hook 同时喂给这一页和右侧插件栏）。
 */
export interface 拓展页入参 {
  /** 已装插件清单（含停用与加载失败的）。 */
  plugins: PluginInfo[];
  /** 信任库里那几把钥匙。⚠️ 要**摆出来**：信任按指纹判，看不见的表等于没有表。 */
  信任: 信任记录[];
  /** 装 / 导出 / 卸 / 启停 / 信任那几颗按钮的实现。见 `ui/usePlugins.ts`。 */
  动作: 插件动作;
}

export function ExtensionsPane({ plugins, 信任, 动作 }: 拓展页入参) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  // 正忙的那一个（插件 id 或 `"装"` / `"目录"`）。忙的时候**所有**按钮都灰掉：
  // 装的途中再点一次卸载，那两件事会撞在宿主那把 `plugins` 锁上，用户看到的是
  // "点了没反应，过一会儿又好了"。
  const 忙 = 动作.忙;
  const 灰 = 忙 !== null;

  return (
    <>
      <SettingsGroup title={t("Extensions")}>
        <SettingRow label={t("Install from file…")}>
          <ActionButton disabled={灰} onClick={() => void 动作.装()}>
            {忙 === "装" ? t("Installing…") : t("Choose an extension package…")}
          </ActionButton>
        </SettingRow>

        <SettingRow label={t("Extension folder")}>
          <ActionButton disabled={灰} onClick={() => void 动作.打开目录()}>
            {t("Open Folder…")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>

      {/* ⚠️ 空态**不能**放进 `SettingsGroup` 里：`settings.css` 有一条
          `.stg-group:not(:has(.stg-row))` 会把"一行都没有的组"整个收掉——
          放进去的话，一个插件都没装时这一整段会**消失**，用户看不到任何解释。 */}
      {plugins.length === 0 ? (
        <Note>
          {t("No extensions installed yet. Use ")}
          <strong>{t("“Choose an extension package…”")}</strong>
          {t(" above to install one — a package carries its own plugin.toml and entry file, and it works as soon as it is installed.")}
        </Note>
      ) : (
        <SettingsGroup title={t("Installed extensions")}>
          {plugins.flatMap((p) => [
            <SettingRow
              key={p.id}
              label={p.name}
              // 搜索要能搜到 id 与版本：用户常常是拿着报错信息里的 id 来找的，
              // 而 id 画在下面那段小字里，**那段小字是 JSX**（`description` 是
              // 字符串才会自动进搜索）。所以这里显式补一遍。
              searchText={`${p.id} ${p.version}`}
              description={<拓展说明 p={p} />}
            >
              <div className="stg-inline">
                <ActionButton
                  disabled={灰}
                  onClick={() => void 动作.启停(p.id, p.state === "disabled")}
                >
                  {忙 === p.id ? t("Working…") : p.state === "disabled" ? t("Enable") : t("Disable")}
                </ActionButton>
                <ActionButton
                  disabled={灰}
                  title={t("Save as a .nota-plugin package — to hand to someone else to install, or as a backup.")}
                  onClick={() => void 动作.导出(p.id)}
                >
                  {t("Export…")}
                </ActionButton>
                {/* ⚠️ 内置插件**不给**「卸载」：它在安装包里（那个目录通常还是
                    只读的），删了下次启动又回来——后端也会拒。给一颗点了报错的
                    按钮，比不给更坏。要让它不起作用，用「停用」。
                    ⚠️ 导出对内置插件**照给**：想把它拷出去改一改，这是唯一的路。 */}
                {p.removable && (
                  <ActionButton
                    danger
                    disabled={灰}
                    title={t("Delete this extension from disk. Its settings file is kept.")}
                    onClick={() => void 动作.卸(p.id)}
                  >
                    {t("Uninstall")}
                  </ActionButton>
                )}
                {/* 只在"签名对上了但签名者没见过"时出现——正是用户该做决定的时候。 */}
                {p.signature === "unknown" && (
                  <ActionButton
                    disabled={灰}
                    title={t("Trust {0}", p.key_id ?? t("this signer"))}
                    onClick={() => void 动作.信任(p.id, p.key_id)}
                  >
                    {t("Trust")}
                  </ActionButton>
                )}
              </div>
            </SettingRow>,
            // ── 这个插件声明给宿主画的设置（2026-10-04 加）────────────────
            //
            // ⚠️ **跟在这个插件那一行的后面**（而不是各占一段）：来回切两段读，
            // 用户得自己把"这一格是谁的"接上。挨着放，加上小字里那句插件名，
            // 一眼就是"上面那个拓展的设置"。
            //
            // ⚠️ **停用 / 加载失败的插件照样能改**：值在磁盘上（
            // `plugin-settings/<id>.toml`），插件下次启用时读的就是它。
            // 这里没有灰的理由——灰了用户只会在"先启用还是先设置"上卡一下。
            ...p.settings.map((s) => (
              <SettingRow
                key={`${p.id}:${s.key}`}
                label={s.label}
                // 搜插件名、id 和设置键都能搜到这一行（同上面那行的理由）。
                searchText={`${p.id} ${p.name} ${s.key}`}
                description={
                  <>
                    {/* 这句插件名就是"这一格是谁的"那句话。穿 `.plugin-desc`
                        是**有意的**：它是这一页里已经有的那一段小字（见
                        `拓展说明` 顶上那段，同一条"别再造一套类名"）。 */}
                    <span className="plugin-desc">{p.name}</span>
                    {s.help && <span className="plugin-desc">{s.help}</span>}
                  </>
                }
              >
                {/* ⚠️ **照 `kind` 分派的位置就是这里**（三种：滑杆／文本／开关，
                    2026-10-10 从一种加到三种——AI 插件那几格设置要搬进这个窗口）。
                    每一种都直接读宿主收好的那个字段，**前端不夹值、不判形状**：
                    "什么值合法"只有清单那边一处判据（`SettingDecl::收值`）。 */}
                {s.kind === "range" ? (
                  <Range
                    value={s.value}
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    suffix={s.unit}
                    title={s.help || undefined}
                    onChange={(v) => void 动作.设置(p.id, s.key, v)}
                  />
                ) : s.kind === "toggle" ? (
                  <Toggle
                    checked={s.on}
                    onChange={(v) => void 动作.设置(p.id, s.key, v)}
                  />
                ) : (
                  <TextInput
                    value={s.text}
                    secret={s.secret}
                    width="lg"
                    placeholder={s.placeholder || undefined}
                    title={s.help || undefined}
                    onChange={(v) => void 动作.设置(p.id, s.key, v)}
                  />
                )}
              </SettingRow>
            )),
          ])}
        </SettingsGroup>
      )}

      {/* 信任表**必须露出来**（右侧那一栏也有一份，同一份数据）：指纹是给人
          核对的，藏在配置文件里的指纹等于没记。⚠️ 这里只有列、没有删——
          撤销信任是改 `trusted-keys.toml` 的事，摆一颗"删除"在这儿会被当成
          "卸载这个插件"（右侧那一栏的同一条注释里写着同样的理由）。 */}
      {信任.length > 0 && (
        <SettingsGroup title={t("Trusted signers")}>
          {信任.map((k) => (
            <SettingRow key={k.key_id} label={k.name}>
              {/* ⚠️ 指纹用 `<code>`：它是一串十六进制，等宽才**对得齐**——
                  用户是拿着作者公布的那一份**逐位核**的，比例字体下核起来很累。 */}
              <Value>
                <code>{k.key_id}</code>
              </Value>
            </SettingRow>
          ))}
        </SettingsGroup>
      )}
    </>
  );
}

/**
 * 一个插件那行下面那段小字：id、版本、来路与签名，外加语言提示、加载错误、能力。
 *
 * ⚠️ **分成组件**（而不是在 `map` 里摊一段 JSX）是为了让这段读起来还是一句话
 * 一件事；它一个状态都不碰，props 进 JSX 出。
 *
 * # ⚠️ 这里穿的是**插件栏那套类名**（`dock.css` 的 `.plugin-*`）
 *
 * 这几行与右侧插件栏里那一段是**同一个东西在两处的两种摆法**——同一份数据、
 * 同一批判断（来路、签名、语言、能力），连 `来源说明` / 语言提示那几个函数都是
 * 同一个（`ui/pluginText.ts`）。分成两套类名的话，`dock.css` 里改一次字号，
 * 这一页就悄悄跟不上了，而**不报错**。
 *
 * 代价是它们**只写了一遍 `display: block`**（在 `settings.css` 里，作用域是
 * `.stg-row-desc >`）：`dock.css` 那几条是按 `<div>` / `<p>` 写的（天然块级），
 * 而这里落在 `SettingRow` 的 `description` 槽里，那是个 `<span>`。
 * ⚠️ **别再抄一份 `.stg-ext-*` 出来**：`settings.css` 那天离 1000 行只剩几十行，
 * 而这两处要的本来就是同一种样子。
 */
function 拓展说明({ p }: { p: PluginInfo }) {
  const t = useT();
  return (
    <>
      <span className="plugin-id">
        {p.id} {p.version}
        {/* ⚠️ 来路与签名结论来自 `来源说明`，与插件栏**同一个函数**——
            两边说法不一致的话，用户只会觉得自己看错了。 */}
        <span className="plugin-origin">{来源说明(p)}</span>
      </span>

      {p.description && <span className="plugin-desc">{p.description}</span>}

      {/* 语言对不上那句。⚠️ 判据是宿主算好的两格，不在前端猜（见 `pluginText.ts`），
          摆法与插件栏那一段逐字一致（连"用哪一份文案"那个小标签也照搬）。 */}
      {语言对不上(p) && (
        <span className="plugin-lang">
          {语言提示()}
          <span className="plugin-lang-now">
            {语言标签名(p.lang ?? "en") ?? (p.lang ?? "en")}
          </span>
        </span>
      )}

      {/* ⚠️ 加载失败的**原因**必须看得见：这是用户唯一能拿去报告的东西。
          里面可能是 Lua 的报错原文（含行号），所以允许它换行。 */}
      {p.error && <span className="plugin-error">{p.error}</span>}

      {p.capabilities.length > 0 ? (
        <span className="plugin-caps">
          {p.capabilities.map((c) => (
            // ⚠️ `title` 留着**原始 id**：中文名是给用户看的，id 是给写清单的人
            // 对照 `docs/11` 那张能力表用的，两个都要在。
            <span key={c} className="cap" title={c}>
              {能力名(c) ?? c}
            </span>
          ))}
        </span>
      ) : (
        // 「不信这个插件」这件事的落点：它开了哪些口子，就写在这一行上。
        // ⚠️ 穿 `.plugin-desc` 是**有意的**：它占的就是描述那一格
        //（插件没写描述、也没申请能力，这一行说的就是"它什么都没要"）。
        <span className="plugin-desc">{t("It asks for no capabilities.")}</span>
      )}
    </>
  );
}
