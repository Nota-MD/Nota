//! 设置相关命令。

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub fn nota_settings_get(state: State<'_, AppState>) -> Result<Settings> {
    let s = state.settings.lock().unwrap();
    Ok(s.clone())
}

/// 整份替换并落盘。
///
/// 走**整份替换**而不是逐项 patch：设置项还少，patch 语义（"没给的字段不动"
/// 还是"没给的字段恢复默认"）会变成一个新的、没人想要的理解负担。
/// 等设置项多到前端改一项要传一大坨时再改成分项，那时也有真实的理由了。
#[tauri::command]
pub fn nota_settings_set(state: State<'_, AppState>, settings: Settings) -> Result<()> {
    落盘(&state, settings)
}

/// 开机读设置时出的问题。读成功返回 `null`。
///
/// ⚠️ 前端**启动时拉一次**（`App.tsx` 那个 `Promise.all`），非空就弹一条
/// 常驻的 error toast。它不是"再报一次错"，而是让"设置自己变回默认了"
/// 这件事在界面上有个出处——见 `AppState::settings_problem` 那段的由来。
///
/// ⚠️ 不提供"清掉"的命令：它描述的是**开机那一刻**的事实，不是活的状态。
/// 用户按着提示改好设置文件之后，重启一次这条就不出现了。
#[tauri::command]
pub fn nota_settings_problem(state: State<'_, AppState>) -> Option<String> {
    state.settings_problem.clone()
}

/// 界面语言：设置里那一格（`setting`）+ **实际上在用的**（`effective`）。
///
/// ⚠️ 前端只需要 `effective`——它决定界面上用哪份文案、以及插件那一行要不要
/// 显示「此插件不支持您的语言」。`setting` 一起给回去是给设置页用的：
/// 那一页上的下拉显示的是**设定**（可能是 `auto`），而不是解析结果，
/// 否则用户会看到自己选的「自动」变成了「中文」。
///
/// ⚠️ `effective` 取的是**启动时算的那一个**（`AppState::app_lang`），不是
/// 现算的：用户改了设置还没重启的那段时间里，插件用的仍是旧的那份文案，
/// 这里就必须说旧的，否则界面上会说一个插件没在用的语言。
#[tauri::command]
pub fn nota_app_lang(state: State<'_, AppState>) -> AppLang {
    let setting = state
        .settings
        .lock()
        .map(|s| s.general.language.clone())
        .unwrap_or_else(|_| crate::lang::自动.to_owned());
    AppLang {
        setting,
        effective: state.app_lang.clone(),
        // ⚠️ 可选语言**由宿主给**，前端不许自己列一份：那样多一门语言就要改两处，
        // 而漏改的那一处不会报错（下拉里少一项而已）。
        available: crate::lang::支持的语言
            .iter()
            .zip(crate::lang::语言名)
            .map(|(tag, label)| 语言条目 {
                tag: (*tag).to_owned(),
                label: label.to_owned(),
            })
            .collect(),
    }
}

/// [`nota_app_lang`] 的返回值。字段名短，注释在上面那条命令上。
#[derive(serde::Serialize)]
pub struct AppLang {
    pub setting: String,
    pub effective: String,
    /// 界面上下拉里能选的语言（不含「自动」，那条是界面自己加的）。
    pub available: Vec<语言条目>,
}

/// 语言选择器里的一项。`label` 是**那门语言自己写的名字**（`lang::语言名`）。
#[derive(serde::Serialize)]
pub struct 语言条目 {
    pub tag: String,
    pub label: String,
}

/// 在系统的文件管理器里打开设置文件所在的那个目录（一般是 `~/.config/nota`），
/// 返回打开的是哪个路径。
///
/// ⚠️ 路径**在命令里现取**，不让前端拼。`paths.rs` 的文件头写着理由：
/// 散落各处的路径拼接是将来"换存法"时最先烂掉的地方。
///
/// ⚠️ 与 `nota_doc_themes_open_dir` 的差别：那个要先把目录**建出来**（用户主题
/// 目录首次使用时不存在，而文件管理器打不开一个不存在的路径）；
/// 这个不用——`settings.toml` 就住在里面，能读到设置就说明它存在。
///
/// # 为什么"打开"这一步在宿主、而不是前端拿路径自己开（BUG-27）
///
/// 前端那条路是 `@tauri-apps/plugin-opener` 的 `openPath`，它要过 Tauri 的
/// ACL：`capabilities/default.json` 里得加 `opener:allow-open-path`，而且
/// **必须配 path scope**（不给 scope 的 `allow-open-path` 等于全禁）。那个
/// scope 是按 Tauri 自己的 `$APPCONFIG` 一类变量展开的，而本仓的目录口径
/// 在 `paths.rs`（XDG），两份不一定指同一个地方——测试里 `XDG_CONFIG_HOME`
/// 一换就更不是。**"命令自己取路径自己开"则没有这个错位**：前端连"打开哪个
/// 目录"都说不出来，和 `nota_doc_theme_css` 收 id 不收路径是同一个取舍。
/// ⚠️ 这道 ACL 拒绝**不是容器特有**，真机上一样犯（2026-09-25 记成 BUG-27）。
#[tauri::command]
pub fn nota_settings_open_dir(app: tauri::AppHandle) -> Result<String> {
    let dir = crate::paths::config_dir()?;
    let shown = crate::paths::path_to_string(&dir)?;
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|e| NotaError::other(format!("调用系统打开器失败：{e}——目录是 {shown}")))?;
    Ok(shown)
}

/// 把设置恢复成出厂默认，**并返回新的那一份**。
///
/// ⚠️ 这是「偏好设置 → 通用 → 高级设置」里那颗按钮的落点，见
/// `settings/general.rs` 顶上那段：这里不做第二个设置界面，改成
/// "打开这份 TOML / 一键恢复默认"两颗按钮。
///
/// ⚠️ 返回**整份新设置**而不是 `()`：前端照着它重画界面。只返回 `()` 的话
/// 调用方得再 `nota_settings_get` 一次，中间那一小段窗口里界面还是旧的
/// ——而"恢复默认之后有几行没跟着变回去"是最让人不信任设置的东西。
#[tauri::command]
pub fn nota_settings_reset(state: State<'_, AppState>) -> Result<Settings> {
    let next = Settings::default();
    落盘(&state, next.clone())?;
    Ok(next)
}

/// `set` 与 `reset` 共用的写入口。
///
/// ⚠️ **两处都必须走这里**：各写一遍就会漏掉下面那段锁序（先 `settings`、
/// 放掉、再 `documents`），而它是**承重**的，漏掉一半就是死锁。
fn 落盘(state: &AppState, next: Settings) -> Result<()> {
    let strict = next.strict_markdown;
    let debug_mode = next.general.debug_mode;

    // ⚠️ 这一对花括号不是装饰：`documents` 在锁序里**排在 `settings` 前面**
    // （`plugins → documents → settings`，见 `state.rs` 顶上），所以下面那段
    // 必须**等 `settings` 的锁放掉之后**再跑。握着 `settings` 去拿 `documents`
    // 是反方向，两边同时来一次就是死锁。
    {
        let mut current = state.settings.lock().unwrap();
        let previous = current.clone();
        *current = next;

        // 先落盘，落盘失败就把内存里的改回去——否则会出现"界面上是新的、
        // 重开又变回去"这种最难解释的状态。
        if let Err(e) = current.save() {
            *current = previous;
            return Err(e);
        }
    }

    crate::log::设置调试模式(debug_mode);

    // 「严格模式」改了要**立刻重算已打开文档的标题**：标题是从正文猜的，
    // 而两种模式对"这一行算不算标题"看法不同（`#标签`）。不重算的话，
    // 用户改完设置盯着标签页看，会以为设置没生效。
    state.documents.lock().unwrap().set_strict_markdown(strict);
    Ok(())
}
