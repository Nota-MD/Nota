//! 「上传图片」：**把一张图送到用户自己填的那台服务器上，换回一条地址**。
//!
//! # 为什么单独一块，不并进 `image.rs`
//!
//! `image.rs` 管的是"这张图落到哪、文档里写什么"，它最远处只到**磁盘**。
//! 上传是另一件事：它要**把用户的字节送出这台机器**，还要读一份带密钥的配置。
//! 混进 `image.rs` 的话，那一块就得同时知道「复制到 ./assets」和
//! 「Authorization: Bearer …」，而这两件事的默认值、出错方式、生命周期
//! 全不一样。上传的算式放在下面，网络那一半在 `upload/net.rs`，用例在
//! `upload/tests.rs`。
//!
//! # ⚠️⚠️ 配置在**另一个文件**里，而且必须是 0600
//!
//! ```text
//! ~/.config/nota/image-upload.toml     ← 这一份，0600（`paths::image_upload_file`）
//! ~/.config/nota/settings.toml         ← 设置页那七张表，普通权限
//! ```
//!
//! 「请求头」那一栏里放的是**用户的 token**（`Authorization: Bearer …`）。
//! 为什么不并进 `settings.toml`：那一份走 `Settings::save_to`，是裸的
//! `std::fs::write`——权限跟着 umask 走（通常 0644），而且用户会同步它、备份它、
//! 排查问题时贴给别人。`plugin-settings/nota.ai.toml` 单开一份也是这个理由，
//! 这里照抄同一套：文件 **0600** 建（`OpenOptions::mode`，不是"先建再 chmod"
//! ——那中间有一个窗口）、目录 **0700** 收。
//!
//! ⚠️ **这不是「安全存储」，只是「不给同机器的其他用户看」**。谁能读用户的家
//! 目录，谁就能读到它。与 `lua/api/settings.rs` 文件头那句是同一个意思。
//!
//! # ⚠️ 不预设任何服务商
//!
//! 这一支里**没有** `smms` / `picgo` / `imgur` / `oss` / `cos` 这些名字，一个
//! 都没有，测试里还钉着这件事。地址、方法、字段名、请求头、从响应里取哪一格
//! ——全是用户填的。两条理由：①预设一张服务商表，等于把"这条数据会发给谁"
//! 藏进一次下拉选择里；②那张表得跟着各家的 API 改版维护，而它们改版比 Nota
//! 发版快。
//!
//! # 只做一件事：一次 HTTP 请求 + 从响应里取一条地址
//!
//! | 方法（用户选） | 体 | 适合 |
//! |---|---|---|
//! | `post` | `multipart/form-data`，文件挂在 `field` 那个字段上 | 绝大多数图床 |
//! | `put` | 裸字节，`Content-Type` 按后缀猜（用户自填的优先） | 对象存储那种"PUT 上去就是"的 |
//!
//! 网络图片走 `remote_field`：把**原地址**当一个普通表单字段发出去，让服务器
//! 自己去取。⚠️ Nota **不下载它**——"替你取别人服务器上的图"是 `image.rs` 里
//! 另一件事（`apply_to_remote`），不该在这儿悄悄发生。
//! `remote_field` 留空 = **网络图片不上传**，如实告诉用户，不假装成功。
//!
//! ⚠️ `remote_field` 只在 `post` 下有意义：表单字段是 multipart 才有的东西。
//! `put` + 网络图片会**报错**（`校验` 里挡下），不会退化成"把那条 URL 当文件
//! 内容 PUT 上去"——那传上去的是一段文本，而服务器多半会当成一张坏图收下。
//!
//! # 多部件体是自己拼的，没用 ureq 的 `multipart` feature
//!
//! `ureq` 的 `multipart` 不是默认 feature，打开它会把 `mime_guess` 与
//! `getrandom` 拖进依赖树。而这一支要的东西很少：一个字段、一个文件名、
//! 一段字节（见 `多部件体_文件`）。自己拼的代价是几十行可测的纯函数，
//! 换来的是**不动 `Cargo.toml`**——加依赖不是这里能单方面决定的事。
//!
//! ⚠️ 与 `lua/api/http.rs` 的规矩**故意不同**：那边只放行 https（插件发出去的
//! 东西不能走明文）。这里 `http://` 放行——地址是用户自己填的自家服务器，
//! 内网用明文 http 是常见且正当的（与 `image/plan.rs` 取网络字节同一条口径）。

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;

mod net;

#[cfg(test)]
mod tests;

pub use net::{传一次, 传什么};

/// 前件里那个键：**这份文档允许自动上传**。
///
/// ⚠️ 名字带 `nota-` 前缀，而且**必须是完整的一个键**（不带点、不带嵌套）：
/// front matter 是给静态站点生成器（Hugo / Jekyll / VitePress）看的，
/// 一个叫 `auto-upload` 或 `upload` 的裸键迟早会跟某家的字段撞上，
/// 而撞上的症状是"我的站点构建多了一个奇怪的变量"。
///
/// 取值只认 `true` / `yes` / `on`（大小写随意，两侧的引号去掉）。
/// 别的写法（`1`、`是`、`maybe`）一律**当没有**——这一条是**发数据出去**的开关，
/// 判据宁可窄：看不懂就当没开，用户会发现"没生效"，而不是"莫名其妙传上去了"。
pub const 自动上传键: &str = "nota-auto-upload";

/// 用哪种方法把图发出去。
///
/// ⚠️ 两个取值都是 kebab-case（`post` / `put`），与 `settings/image.rs` 的
/// `InsertImageAction` 同一条口径：**这一列是人在 TOML 里直接改的**。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum 上传方法 {
    /// `multipart/form-data`，文件挂在 `field` 那个字段上。
    Post,
    /// 裸字节 PUT，`Content-Type` 按后缀猜。
    Put,
}

impl Default for 上传方法 {
    fn default() -> Self {
        上传方法::Post
    }
}

/// 上传服务的设置。**这一份住在 `image-upload.toml`，不在 `settings.toml` 里**
/// （理由见文件头）。
///
/// ⚠️ 字段名是 snake_case，与设置页那七张表一致：这一份既写进 TOML（用户手改），
/// 也整个过 IPC 给设置页（前端 `ImageUploadSettings`）。两处用同一套名字，
/// 少一层"这边 urlPath、那边 url_path"的翻译——那层翻译写错一个字母**不会编译
/// 不过**，只会在运行时落回默认值（`types.ts` 顶上那段说的就是这件事）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct 上传设置 {
    /// 总开关。**默认关**——关着的时候插入图片一个字节都不往外发。
    pub enabled: bool,
    /// 允许「根据文档 YAML 里的 [`自动上传键`] 自动上传」。
    ///
    /// ⚠️ 它与 `enabled` 是**两级**，不是一回事：`enabled` 是"这台机器上有这么
    /// 一台服务器"，`auto` 是"我允许文档自己说要上传"。两个都开、**而且那份
    /// 文档的 front matter 里写着那个键**，插入本地图片才会自动上传。
    /// 三道闸缺一不可，少一道就是"没传"。
    pub auto: bool,
    /// 服务地址。只认 `http` / `https`。
    pub url: String,
    /// 用哪个方法。
    pub method: 上传方法,
    /// `post` 时文件挂在哪个字段上（**表单字段名**，不是文件名）。
    ///
    /// ⚠️ 各家的叫法不一样（`file` / `smfile` / `image`），所以没有默认值可猜
    /// ——给 `file` 只是"最常见的那一个"，用户得照着自家服务改。
    pub field: String,
    /// 请求头，**一行一条** `名字: 值`。空行与 `#` 开头的行忽略。
    ///
    /// ⚠️ 用户的 token 写在这儿（`Authorization: Bearer sk-…`）。这就是为什么
    /// 这个文件必须是 0600。做成一个"token 输入框"而不是这一栏，看着更友好，
    /// 但那等于**假定**所有服务都把 token 放在 `Authorization` 上——而事实是
    /// 有的要 `X-Api-Key`、有的要放在查询串里。一栏纯文本能表达全部，
    /// 也让人能拿编辑器直接改。
    pub headers: String,
    /// 从响应里取地址的**点路径**，默认 `data.url`。
    ///
    /// 例：`data.url` / `data.links.url` / `result.0.url`（数组下标也认）。
    /// **空串 = 整个响应体本身就是那条地址**（纯文本接口）。
    pub url_path: String,
    /// 网络图片走哪个**表单字段**：把原地址发过去，让服务器自己去取。
    ///
    /// ⚠️ **空串 = 网络图片不上传**（插入照旧，只是不传）。这不是"没配好"，
    /// 是一个正当的选择：很多图床根本不支持"给你个 URL 你去取"。
    pub remote_field: String,
}

impl Default for 上传设置 {
    fn default() -> Self {
        Self {
            // ⚠️ 两个开关**默认都是关的**。这一整块是"把用户的字节送出这台
            // 机器"的功能，默认值给 `true` 就等于"装完就开始往外发"。
            enabled: false,
            auto: false,
            url: String::new(),
            method: 上传方法::Post,
            field: "file".to_string(),
            headers: String::new(),
            url_path: "data.url".to_string(),
            remote_field: String::new(),
        }
    }
}

impl 上传设置 {
    /// 配好了没有：开着、有地址，而且是条 http/https 地址。
    ///
    /// ⚠️ 与 [`校验`] 不是一回事：这一个**宽容**，只回答"界面上该不该画上传
    /// 那一段"。真正的校验在 [`校验`] 里，它会把每一条毛病都说清楚。
    pub fn 可用(&self) -> bool {
        self.enabled && crate::image::是网络地址(&self.url)
    }
}

/// 文件头。用户手改时先看到它，知道这是什么、权限为什么是这样。
const 文件头: &str = "\
# 这个文件是 Nota 的「上传服务」设置（设置 → 图像 → 上传服务设置）。
# 可以直接用编辑器改，改完存盘即生效。
# ⚠️ 「请求头」那一栏里会有你的 token / 密钥，**是明文**。文件权限是 0600
#    （只有你自己读得到），别把它提交进任何仓库、也别贴给别人。
# ⚠️ 每一项怎么填写在设置页那一组里，每一项的解释也在那儿。
";

/// 读一份上传设置。**文件不在 / 读不出来 / 语法错 → 回默认值，不报错。**
///
/// ⚠️ 与 `lua/api/settings.rs` 的 `读` 同一条口径：一份被手改坏的配置该表现为
/// "回到默认值"（这里是"关着、什么都不传"），而不是"应用起不来"。而且默认值
/// 恰好是**最保守的那一个**，所以坏配置的后果是"不传"，不是"乱传"。
pub fn 读() -> 上传设置 {
    match paths::image_upload_file() {
        Ok(路径) => 读文件(&路径),
        // 连家目录都探不到：默认值。
        Err(e) => {
            crate::日志!("[nota] upload settings path unavailable; using empty settings: {e}");
            上传设置::default()
        }
    }
}

/// 从一个具体路径读。测试用它，`读` 只是把路径算出来的那一层。
pub fn 读文件(路径: &std::path::Path) -> 上传设置 {
    let Ok(text) = std::fs::read_to_string(路径) else {
        return 上传设置::default();
    };
    match toml::from_str::<上传设置>(&text) {
        Ok(s) => s,
        Err(e) => {
            crate::日志!(
                "[nota] upload settings unreadable; using unconfigured state: {}: {e}",
                路径.display()
            );
            上传设置::default()
        }
    }
}

/// 写一份上传设置到 `image-upload.toml`。
///
/// ⚠️⚠️ **这是唯一一处会碰到用户真实配置目录的写入口。用例一律走
/// [`写文件`]**——一个忘了改的测试会把 `~/.config/nota/image-upload.toml`
/// 覆盖成默认值（用户的 token 就没了），而且它不会报错。
pub fn 写(设置: &上传设置) -> Result<()> {
    写文件(&paths::image_upload_file()?, 设置)
}

/// 写到一个具体路径。目录 0700、文件 0600——与 `lua/api/settings.rs` 的 `写`
/// 是同一套做法，理由见文件头。
///
/// ⚠️ 这里是**整份替换**：设置页改一项时前端会把完整的八项一起送上来
/// （与 `nota_settings_set` 同一条口径）。所以没有"只改一格"的入口，
/// 也就不存在"两次改动互相覆盖"。
pub fn 写文件(路径: &std::path::Path, 设置: &上传设置) -> Result<()> {
    if let Some(dir) = 路径.parent() {
        paths::ensure_dir(dir)?;
        收紧目录权限(dir);
    }

    let body = toml::to_string(设置)
        .map_err(|e| NotaError::other(format!("上传设置序列化失败：{e}")))?;
    let text = format!("{文件头}{body}");

    // ⚠️ 用 `OpenOptions` 带上创建时的 mode，**不是**"写完了再 chmod"——
    // 那中间有一个窗口，此刻任何进程都能读到刚写下去的 token。
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(路径)
            .map_err(|source| NotaError::Write {
                path: 路径.to_path_buf(),
                source,
            })?;
        f.write_all(text.as_bytes())
            .map_err(|source| NotaError::Write {
                path: 路径.to_path_buf(),
                source,
            })?;
        return Ok(());
    }

    #[cfg(not(unix))]
    std::fs::write(路径, text).map_err(|source| NotaError::Write {
        path: 路径.to_path_buf(),
        source,
    })
}

/// 目录权限收到 0700。收不上就算了——**这不是一条能让保存失败的错**。
#[cfg(unix)]
fn 收紧目录权限(dir: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn 收紧目录权限(_dir: &std::path::Path) {}

/* ── 校验 ──────────────────────────────────────────────────────────────── */

/// 本应用自己必须控制的请求头。用户再写一遍会**报错**（不是静默丢掉）。
///
/// ⚠️ 为什么是报错而不是忽略：这三个头写错了，请求会以**另一种**方式失败
/// （服务器收到一个长度不对的体、或者一个对不上的 host），而错误现场离
/// "你在设置里多写了一行"很远。当场说出来最省事。
///
/// ⚠️ `content-type` **不在**这一列：它是有正当用途的（PUT 一份
/// `application/octet-stream` 之类的）。它在下面按情况处理，见 `传一次`。
const 自带头: [&str; 3] = ["content-length", "host", "transfer-encoding"];

/// 检查一遍设置，外加"这次要传的是一张网络图吗"。
///
/// `是网络图` 只影响一条：`put` 没法把原地址当表单字段发出去。
pub fn 校验(s: &上传设置, 是网络图: bool) -> Result<()> {
    if !s.enabled {
        return Err(NotaError::other(
            "上传服务没打开（设置 → 图像 → 上传服务设置里那个开关）",
        ));
    }
    if s.url.trim().is_empty() {
        return Err(NotaError::other(
            "上传服务没填地址（设置 → 图像 → 上传服务设置 → 服务地址）",
        ));
    }
    if !crate::image::是网络地址(&s.url) {
        return Err(NotaError::other(format!(
            "上传服务地址「{}」不是一条 http/https 地址",
            s.url.trim()
        )));
    }
    if s.method == 上传方法::Post && s.field.trim().is_empty() {
        return Err(NotaError::other(
            "POST 要有一个字段名（设置 → 图像 → 上传服务设置 → 文件字段）：\
             文件是挂在这个名字上的，各家叫法不一样",
        ));
    }
    if 是网络图 {
        if s.method == 上传方法::Put {
            return Err(网络图不能用_put());
        }
        if s.remote_field.trim().is_empty() {
            return Err(NotaError::other(
                "这条设置里网络图片不上传（设置 → 图像 → 上传服务设置 → \
                 「网络图片字段」是空的），所以这张图没有被上传",
            ));
        }
    }
    for (名, 值) in 解析请求头(&s.headers)? {
        if 自带头.contains(&名.to_ascii_lowercase().as_str()) {
            return Err(NotaError::other(format!(
                "请求头里不许写「{名}」：它由 Nota 按实际发出去的字节算，\
                 手写的那份会让请求坏掉。请把这一行删掉"
            )));
        }
        if !是合法头名(&名) {
            return Err(NotaError::other(format!(
                "「{名}」不是一个合法的请求头名字：只能用 ASCII 字母、数字和 \
                 `-` `_` 这几个符号（各家文档里那个名字照抄即可）"
            )));
        }
        // ⚠️ 头的值**必须是 ASCII**，这一条要说清楚（写出来才发现的两个坑）：
        // HTTP 头的值按规矩只有可见 ASCII，而 ureq 遇到一个带中文的值会直接
        // 拒掉，报的是英文 `protocol: authorization header is not a string`
        // ——用户看到那句话，完全想不到问题出在自己填的那一栏里。
        // 中文只能出现在**图床返回的地址**里，不能出现在请求头里。
        if !值.is_ascii() {
            return Err(NotaError::other(format!(
                "请求头「{名}」的值里出现了非 ASCII 字符（中文等）：\
                 HTTP 头的值只能是 ASCII。token 请照服务商给的那串原样填"
            )));
        }
        if 值.chars().any(|c| c.is_control()) {
            return Err(NotaError::other(format!(
                "请求头「{名}」的值里有控制字符，发出去会把请求弄坏"
            )));
        }
    }
    Ok(())
}

/// 是不是一个合法的 HTTP 头名字（RFC 9110 的 `token`）。
///
/// ⚠️ 判据与 `http` crate 的 `HeaderName` 一致，是为了**在 Nota 这一层先报错**：
/// 让它去 `Request::body()` 上炸的话，用户拿到的是一句英文的
/// "invalid header name"，而真正的问题在设置页那一栏里。
fn 是合法头名(名: &str) -> bool {
    !名.is_empty()
        && 名.bytes().all(|b| {
            b.is_ascii_alphanumeric()
                || matches!(
                    b,
                    b'!' | b'#' | b'$' | b'%' | b'&' | b'\'' | b'*' | b'+' | b'-' | b'.' | b'^'
                        | b'_' | b'`' | b'|' | b'~'
                )
        })
}

/// 「网络图片 + PUT」那条错误。**只有一份文案**：`校验` 与 `net::传一次` 里那个
/// 兜底分支都要报同一句话，写两遍迟早改一处漏一处（症状是同一个毛病两种说法，
/// 用户以为遇上了两回事）。
pub fn 网络图不能用_put() -> NotaError {
    NotaError::other(
        "网络图片没法用 PUT 上传：那种接口要把原地址当一个表单字段发出去，\
         而 PUT 的体是裸字节。要么把方法改成 POST，要么把「网络图片字段」留空\
         （留空 = 网络图片不上传）",
    )
}

/* ── 存盘前的那道形状闸 ────────────────────────────────────────────────── */

/// 一项不填时的合法上限。
///
/// ⚠️ 这一道闸**只管形状**（长度），不管"配得对不对"——地址通不通、token 对不对，
/// 只有真发一次才知道。设置页是**即时生效**的（改一个字母就落盘一次），
/// 所以这里也不能校验格式：用户打了一半的 `https://` 不该被拒绝。
/// 但"这个字段有 3 MB"必须当场挡住——那是一个坏掉的输入，不是半成品。
fn 长度行吗(名: &str, 值: &str, 上限: usize) -> Result<()> {
    if 值.chars().count() > 上限 {
        return Err(NotaError::other(format!(
            "「{名}」太长了（{} 个字符，上限 {上限}）——多半是粘错东西了",
            值.chars().count()
        )));
    }
    Ok(())
}

/// 存盘前的形状检查（长度）。**不是** [`校验`]：那一个在真发请求时跑。
pub fn 形状行吗(s: &上传设置) -> Result<()> {
    长度行吗("服务地址", &s.url, 2048)?;
    长度行吗("请求头", &s.headers, 32 * 1024)?;
    长度行吗("文件字段", &s.field, 200)?;
    长度行吗("从响应里取", &s.url_path, 500)?;
    长度行吗("网络图片字段", &s.remote_field, 200)
}

/// 解析「一行一条 `名字: 值`」的请求头。
///
/// 空行与 `#` 开头的行忽略（注释）。值里可以有冒号（`Authorization: Bearer a:b`
/// ——按**第一个**冒号切）；名字前后与值前后的空白去掉。
pub fn 解析请求头(文本: &str) -> Result<Vec<(String, String)>> {
    let mut out = Vec::new();
    for (i, 行) in 文本.lines().enumerate() {
        let 行 = 行.trim();
        if 行.is_empty() || 行.starts_with('#') {
            continue;
        }
        let Some(冒号) = 行.find(':') else {
            return Err(NotaError::other(format!(
                "请求头第 {} 行不是「名字: 值」的写法：{行}",
                i + 1
            )));
        };
        let 名 = 行[..冒号].trim();
        let 值 = 行[冒号 + 1..].trim();
        if 名.is_empty() {
            return Err(NotaError::other(format!(
                "请求头第 {} 行没有名字（冒号前面是空的）：{行}",
                i + 1
            )));
        }
        if 值.is_empty() {
            return Err(NotaError::other(format!(
                "请求头第 {} 行的值是空的：{行}",
                i + 1
            )));
        }
        out.push((名.to_string(), 值.to_string()));
    }
    Ok(out)
}

/// 按后缀猜内容类型。认不出的给 `application/octet-stream`。
///
/// ⚠️ 只影响 PUT（裸字节那一路）。POST 的文件部分也用它，但服务器多半只认
/// 字节，不认这个头。
pub fn 内容类型(名: &str) -> &'static str {
    let 后缀 = 名
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match 后缀.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

/* ── 拼多部件体 ────────────────────────────────────────────────────────── */

/// 一个边界字符串：**不能出现在体里**，所以由进程号 + 纳秒数拼出来。
///
/// ⚠️ 没有用随机数库（那要动 `Cargo.toml`）。够不够？撞上要求用户那张图里
/// 逐字节出现 `----NotaBoundary<pid><nanos>` 这一整串——不是"可能重复"，
/// 是"不可能重复"。
pub fn 新边界() -> String {
    let 纳秒 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("----NotaBoundary{:x}{:x}", std::process::id(), 纳秒)
}

/// 一段多部件体的开头：`--边界\r\n名字与内容类型\r\n\r\n`。
fn 部件头(out: &mut Vec<u8>, 边界: &str, 处置: &str, 内容类型: Option<&str>) {
    out.extend_from_slice(format!("--{边界}\r\n").as_bytes());
    out.extend_from_slice(format!("Content-Disposition: {处置}\r\n").as_bytes());
    if let Some(t) = 内容类型 {
        out.extend_from_slice(format!("Content-Type: {t}\r\n").as_bytes());
    }
    out.extend_from_slice(b"\r\n");
}

/// 把一个文件拼成一条完整的 multipart 体（**恰好一个字段**）。
///
/// ⚠️ 换行一律 `\r\n`（RFC 2046 规定的就是它，用 `\n` 的话 PHP 那一系会把
/// 整个体当成一个字段）。
pub fn 多部件体_文件(边界: &str, 字段名: &str, 文件名: &str, 内容类型: &str, 字节: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(字节.len() + 512);
    部件头(
        &mut out,
        边界,
        &format!("form-data; name=\"{}\"; {}", 转义引号(字段名), 处置文件名(文件名)),
        Some(内容类型),
    );
    out.extend_from_slice(字节);
    out.extend_from_slice(format!("\r\n--{边界}--\r\n").as_bytes());
    out
}

/// 把若干**文本**字段拼成一条 multipart 体（网络图片那条路只用一个字段）。
pub fn 多部件体_表单(边界: &str, 字段们: &[(String, String)]) -> Vec<u8> {
    let mut out = Vec::with_capacity(512);
    for (名, 值) in 字段们 {
        部件头(
            &mut out,
            边界,
            &format!("form-data; name=\"{}\"", 转义引号(名)),
            None,
        );
        out.extend_from_slice(值.as_bytes());
        out.extend_from_slice(b"\r\n");
    }
    out.extend_from_slice(format!("--{边界}--\r\n").as_bytes());
    out
}

/// 名字里能破坏 `name="…"` 这个引号的字符换掉。**含换行**——换行进去能让
/// 服务器读到一行伪头部。
fn 转义引号(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '"' | '\\' | '\r' | '\n' => '_',
            _ => c,
        })
        .collect()
}

/// `filename=` 那一段。
///
/// ⚠️ 文件名**可能是中文**（本项目里很常见）。纯 ASCII 时只给 `filename="…"`；
/// 含非 ASCII 时**两个都给**：老的 `filename="…"`（会被写成乱码，但字段本身
/// 还在）＋ RFC 5987 的 `filename*=UTF-8''%E4%B8%AD.png`（新服务器认得）。
/// 只给后者的话，还按 RFC 2616 读的服务器会拿到一个**没有文件名**的部件。
fn 处置文件名(名: &str) -> String {
    let 干净 = 转义引号(名);
    if 名.is_ascii() {
        format!("filename=\"{干净}\"")
    } else {
        format!("filename=\"{干净}\"; filename*=UTF-8''{}", 百分号编码(&干净))
    }
}

/// RFC 5987 的 `attr-char` 之外一律百分号编码。
fn 百分号编码(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        let 保留 = b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'!' | b'#' | b'$' | b'&' | b'+' | b'-' | b'.' | b'^' | b'_' | b'`' | b'|' | b'~'
            );
        if 保留 {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/* ── 从响应里取地址 ────────────────────────────────────────────────────── */

/// 按点路径从 JSON 里取一个值，转成字符串。取不到给 `None`。
///
/// 路径按 `.` 切。中间遇到数组时那一段当**下标**读（`result.0.url`）——
/// 这不是装饰：`{"result":[{"url":"…"}]}` 这种回法在真实的图床里很常见。
pub fn 点路径取值(root: &serde_json::Value, 路径: &str) -> Option<String> {
    let mut 当前 = root;
    for 段 in 路径.split('.') {
        if 段.is_empty() {
            return None; // `data..url` 这种，当没写对
        }
        当前 = match 当前 {
            serde_json::Value::Object(表) => 表.get(段)?,
            serde_json::Value::Array(列) => 列.get(段.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    match 当前 {
        serde_json::Value::String(s) => Some(s.clone()),
        // ⚠️ `null` 是"这儿什么都没有"，不是字符串 `"null"`。
        serde_json::Value::Null => None,
        // 数字 / 布尔：`{"id": 42}` 取出来是 `42`。留着，最后由
        // `从响应取地址` 那一道 http/https 的闸判它能不能进文档。
        other => Some(other.to_string()),
    }
}

/// 从响应体里取那条地址。
///
/// `url_path` 空串 = 整个体本身就是地址（纯文本接口）。
/// 取出来的东西**必须是一条 http/https 地址**才会被接受——不然后面那一步
/// 就是"把一段服务器回的话写进用户的文档"。
pub fn 从响应取地址(体: &str, url_path: &str) -> Result<String> {
    let 体 = 体.trim();
    let 路径 = url_path.trim();
    let 值 = if 路径.is_empty() {
        // 纯文本接口。⚠️ 有的服务回的是一个 **JSON 字符串**（`"https://…"`，
        // 带引号的原样一条）——那种没有"路径"可填，所以在这儿认一下：
        // 先试着当 JSON 读，读出来是个字符串就用它；不是就原样当文本。
        match serde_json::from_str::<serde_json::Value>(体) {
            Ok(serde_json::Value::String(s)) => s,
            _ => 体.to_string(),
        }
    } else {
        let json: serde_json::Value = serde_json::from_str(体).map_err(|e| {
            NotaError::other(format!(
                "上传服务器回的不是 JSON，而「从响应里取」填的是「{路径}」\
                 （只有留空时才按纯文本读）：{e}。它回的是：{}",
                短(体)
            ))
        })?;
        match 点路径取值(&json, 路径) {
            Some(v) => v,
            None => {
                return Err(NotaError::other(format!(
                    "上传服务器回的 JSON 里没有「{路径}」这条路径。它回的是：{}",
                    短(体)
                )))
            }
        }
    };
    let 值 = 值.trim();
    if !crate::image::是网络地址(值) {
        return Err(NotaError::other(format!(
            "从响应里取出来的不是一条 http/https 地址，Nota 不把它写进文档：{}",
            短(值)
        )));
    }
    Ok(值.to_string())
}

/// 把一段可能是服务器回话的文本压成一行、限长，给错误提示用。
///
/// ⚠️ 两条都要：**压行**（否则 `toml` 式的多行报错会把提示条撑成六行）与
/// **限长**（服务器完全可能回一整页 HTML）。这不是"脱敏"——回话是服务器写的，
/// 里面不该有用户的 token；但**请求头绝不会被拼进任何一句话里**（见
/// `net.rs` 里那几处错误文案），那条才是会漏密钥的地方。
fn 短(s: &str) -> String {
    const 上限: usize = 200;
    let 一行: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if 一行.chars().count() <= 上限 {
        return 一行;
    }
    let mut out: String = 一行.chars().take(上限).collect();
    out.push('…');
    out
}

/* ── 文档前件里那个键 ──────────────────────────────────────────────────── */

/// 这份文档的 front matter 里写着允许自动上传吗。
///
/// 规则与 `document::title::front_matter_title` **逐条一致**（两处不能各有一套）：
/// front matter 必须在**文件最开头**，首行是 `---`，到下一个 `---` 或 `...`
/// 结束。区别只有一个：那边找 `title:`，这里找 [`自动上传键`]。
pub fn 前件开着吗(正文: &str) -> bool {
    let mut 行们 = 正文.lines();
    if 行们.next().map(str::trim_end) != Some("---") {
        return false;
    }
    for 行 in 行们 {
        let 行 = 行.trim_end();
        if 行 == "---" || 行 == "..." {
            return false; // 前件结束，里面没写这个键
        }
        // ⚠️ 只认**顶格**的那个键（允许前面有空格缩进）。嵌套在别的键下面的
        // `nota-auto-upload` 不算——那种写法（`nota:` 底下再缩一层）是另一个
        // 意思，而"缩进两格也算"会让一个跟上传无关的嵌套键变成上传开关。
        let Some(值) = 行.trim().strip_prefix(自动上传键) else {
            continue;
        };
        let Some(值) = 值.strip_prefix(':') else {
            continue; // `nota-auto-upload-extra:` 这种前缀更长的键，不算
        };
        let 值 = 值.trim().trim_matches(|c| c == '"' || c == '\'');
        return matches!(值.to_ascii_lowercase().as_str(), "true" | "yes" | "on");
    }
    false
}
