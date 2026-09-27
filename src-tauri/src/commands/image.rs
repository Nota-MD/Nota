//! 「插入图片」那一条命令：把一张图搬到该去的地方，算出该写进文档的地址。
//!
//! ```text
//! 前端（对话框 / 剪贴板 / 拖入）──> nota_image_place ──> { src, 落到, 做了 }
//!                                        └── 算式全在 crate::image
//! ```
//!
//! ⚠️ 这一层**只有接线**（取参数、查文档、取设置、丢进阻塞池），真算式在
//! `crate/image.rs`——那边才有单测。这里唯一值得看的是**它从哪拿事实**：
//!
//! | 事实 | 从哪儿拿 | 为什么不是前端传 |
//! |---|---|---|
//! | 文档在哪个目录、叫什么名 | `DocumentStore`（按 `doc_id` 查） | 相对路径的基准就是文档自己，宿主手里那份是**权威**；前端传的话，还没存盘的文档会被传成"上次的路径" |
//! | 五个动作 + 那几个开关 | `AppState.settings` | 同上：设置页改完的下一毫秒插入就该按新的来 |
//!
//! ⚠️ **异步 + `spawn_blocking`**：复制要读写磁盘、下载要联网（最长 30 秒，
//! 见 `image/plan.rs` 的 `下载超时`）。Tauri 的同步命令跑在主线程上，在那儿等就是冻界面。
//!
//! # 自动上传挂在这个函数的**尾巴**上（2026-09-26 加）
//!
//! 三道闸（总开关 / 允许自动 / 文档前件里那个键）都成立时，落完盘的这张图会被
//! **紧接着传一次**，`src` 换成传回来的 URL。为什么挂在落地之后、而不是之前：
//! ①传的该是**文档里要写的那个文件**（可能是刚复制到 `./assets` 的那一份）；
//! ②传失败时必须还有一条能用的本地地址——落地在前，地址早就有了。
//!
//! ⚠️ 自动上传**永远只对本地来源**发生（`来源::是网络()` 为真就跳过）：
//! 网络图片的原地址不是这台机器上的文件，去取它等于替用户访问一个第三方。
//! 判据与细节见 `commands/image_upload.rs` 文件头。

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::image_upload::{自动传, 文档位置, 文档写着键吗, 读设置};
use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::image::{self, 来源, 规则};
use crate::state::AppState;

/// 剪贴板/粘贴过来的图片数据上限。
///
/// ⚠️ 取的是 `image/plan.rs` 的 `下载上限` 同一个量级（16 MiB）：一张屏幕截图 1～3 MB，
/// 一张手机照片 5～8 MB，16 MiB 够用；再大就不该走"整段塞进 IPC 消息"这条路
/// 了（那是把几千万个字符编成 JSON 再解回来），该让用户先存成文件。
const 粘贴上限: usize = 16 * 1024 * 1024;

/// 一张图从哪来。前端按 `kind` 分派。
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum 图片来源 {
    /// 磁盘上已经有一个文件：用户填的路径、或者拖进来的文件。
    Path { path: String },
    /// 一条 http/https 地址。
    Url { url: String },
    /// 剪贴板里的图片数据。`data` 是 base64（**不带** `data:` 前缀）。
    Base64 { data: String, ext: Option<String> },
}

/// 落地结果。**只说事实，不说句子**——提示语由前端按自己的语言拼
/// （`做了` 是枚举，见 `image::做了`）。
///
/// ⚠️ 字段名**写死英文**（一个字段一条 `rename`）：字段名走 IPC，中文名会让
/// 前端的 `ImagePlaced` 与这里对不上，而那种错在两边各自都编译得过。
#[derive(Debug, Serialize)]
pub struct 落地结果 {
    /// 该写进 Markdown 的地址。
    pub src: String,
    /// 磁盘上多出来（或复用）的那份文件。
    #[serde(rename = "savedTo")]
    pub 落到: Option<String>,
    /// 干了什么。
    #[serde(rename = "did")]
    pub 做了: image::做了,
    /// 用户选的那个动作**实际**生效成了什么。
    ///
    /// ⚠️ 只在一处与设置不同：剪贴板来的图片**必须落盘**（它没有"原处"可指），
    /// 所以动作是「无特殊操作」时会退回「复制到 ./assets」。
    /// 前端据此说一句——**这是唯一一处"设置说的和做的不一样"**，
    /// 不说的话用户会以为设置没生效。
    #[serde(rename = "action")]
    pub 动作: String,
    /// 自动上传的结果。**没开自动上传时是 `None`**（绝大多数情况）。
    ///
    /// ⚠️ 前端按它做两件事：`好` → 说一句"已上传到 …"（`src` 已经换成那条
    /// URL）；`没成` → 报一句错。**两种情况都要说话**——自动上传是"把用户的
    /// 字节发出去"，静默成功比失败更糟：用户不知道该不该担心。
    #[serde(rename = "upload")]
    pub 上传: Option<上传回报>,
}

/// 自动上传那一步的结果。**只有事实，句子由前端拼**（同 `做了` 那条口径）。
///
/// ⚠️ 变体名用 `#[serde(rename)]` 写死英文，理由与 `做了` 一样（见它的注释）。
#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum 上传回报 {
    /// 传上去了。文档里那条地址**已经换成这个**。
    #[serde(rename = "ok")]
    好 { url: String },
    /// 没传成。**地址没有换**，插入照旧用本地地址完成——图一个字节都没丢。
    #[serde(rename = "failed")]
    没成 { error: String },
}

/// 把一张图放进文档：该复制的复制、该下载的下载，回一条能直接写进 Markdown 的地址。
///
/// `doc_id` 给 `None`（或查不到那份文档）时，四个"复制到…"的动作会**报错**——
/// 那时谁也不知道"文档旁边"是哪儿。见 `image::目标目录`。
#[tauri::command]
pub async fn nota_image_place(
    state: State<'_, AppState>,
    doc_id: Option<DocId>,
    source: 图片来源,
) -> Result<落地结果> {
    // 锁序：documents → settings（`state.rs` 顶上那条），只往一个方向取。
    //
    // ⚠️ 文档目录与文件名**只取一次**，给"落地"和"上传"两处共用：上传要用同一个
    // 基准去定相对路径（`image::定本地文件`），两处各算一遍迟早不一样。
    let (文档目录, 文档名) = 文档位置(&state, doc_id)?;
    let 规则 = {
        let s = state
            .settings
            .lock()
            .map_err(|_| NotaError::other("设置的锁坏了，请重启 Nota"))?;
        规则::从设置(&s.image)
    };

    let 来源 = 解析来源(source)?;
    // 报给前端的那一项**先算出来**：规则本身要移进阻塞闭包，之后就拿不到了。
    let 动作 = 动作名字(&规则.action);

    // ── 自动上传：先把"要不要传"判掉，再去做落地 ──────────────────────────
    // ⚠️ 顺序是刻意的：读那份配置（一次小文件读）与查前件**都在落地之前**，
    // 于是没开上传的机器上，插入图片这条路的开销与以前**一模一样**。
    // 三道闸见 `commands/image_upload.rs` 文件头；网络来源在这里就出局。
    let 上传设置 = 读设置().await?;
    let 要自动 = 上传设置.可用()
        && 上传设置.auto
        && !来源.是网络()
        && 文档写着键吗(&state, doc_id)?;

    // ⚠️ 闭包把 `来源` **原样还回来**（返回元组），不是克隆一份：剪贴板那条路上
    // 它可能是几 MB 的图片字节，而副本在这里没有任何用处。`spawn_blocking` 要
    // `'static`，所以只能进闭包、出闭包——借不出来。
    // （文档目录要留一份给上传那一步，它只是个路径，克隆它不心疼。）
    let 落地用的目录 = 文档目录.clone();
    let (来源, 落好的) = tauri::async_runtime::spawn_blocking(move || {
        let r = image::放置(&来源, &规则, 落地用的目录.as_deref(), 文档名.as_deref());
        (来源, r)
    })
    .await
    .map_err(|e| NotaError::other(format!("插图任务没跑起来：{e}")))?;
    let 结果 = 落好的?;

    // ── 落地之后才传 ──────────────────────────────────────────────────────
    // ⚠️ 传的是 `结果.落到`（刚写下去/复用那一份）：文档里写的将是它，
    // 传上去的也该是同一个文件。没落盘（动作是「无特殊操作」）就传原来那条路径。
    let 上传 = if 要自动 {
        Some(
            自动传(
                上传设置,
                来源,
                文档目录,
                结果.落到.clone(),
            )
            .await,
        )
    } else {
        None
    };

    // ⚠️ **传成功才换地址**；失败保持算好的本地地址不变——这是"上传失败不丢图"
    // 那一条的实现（见 `commands/image_upload.rs` 文件头）。
    let mut src = 结果.src;
    let 上传 = match 上传 {
        Some(回报) => {
            if let 上传回报::好 { url } = &回报 {
                src = url.clone();
            }
            Some(回报)
        }
        None => None,
    };

    Ok(落地结果 {
        src,
        落到: 结果.落到,
        做了: 结果.做了,
        动作,
        上传,
    })
}

/// 把前端给的来源解成 `image::来源`。**这里只做形状检查**（base64 解得开吗、
/// 字节超没超上限），不做任何落地判断——那是 `image` 的事。
///
/// ⚠️ `commands/image_upload.rs` 那条手动上传的命令**也调它**：base64 怎么解、
/// 上限多少、什么样的地址算网络地址，三件事只该有一处答案。
pub(crate) fn 解析来源(s: 图片来源) -> Result<来源> {
    match s {
        图片来源::Path { path } => {
            let p = std::path::PathBuf::from(&path);
            if p.as_os_str().is_empty() {
                return Err(NotaError::other("没有给出图片路径"));
            }
            Ok(来源::本地文件(p))
        }
        图片来源::Url { url } => {
            if !image::是网络地址(&url) {
                return Err(NotaError::other(format!(
                    "「{url}」不是一条 http/https 地址"
                )));
            }
            Ok(来源::网络地址(url))
        }
        图片来源::Base64 { data, ext } => {
            let 字节 = base64::engine::general_purpose::STANDARD
                .decode(data.as_bytes())
                .map_err(|e| NotaError::other(format!("剪贴板里的图片数据读不出来：{e}")))?;
            if 字节.is_empty() {
                return Err(NotaError::other("剪贴板里的图片是空的"));
            }
            if 字节.len() > 粘贴上限 {
                return Err(NotaError::other(format!(
                    "这张图 {:.1} MB，超过 {:.0} MB 的上限——先把它存成文件再插进来",
                    字节.len() as f64 / 1048576.0,
                    粘贴上限 as f64 / 1048576.0
                )));
            }
            Ok(来源::剪贴板 {
                字节,
                后缀: ext.unwrap_or_else(|| "png".to_string()),
            })
        }
    }
}

/// 动作的 kebab-case 名字。⚠️ 与 `settings/image.rs` 里 `serde` 写出去的那一套
/// **是同一套字符串**（`none` / `copy-to-assets` / …），前端拿它跟设置值比对，
/// 就能知道"这次是按哪个动作落的"。
fn 动作名字(a: &crate::settings::image::InsertImageAction) -> String {
    use crate::settings::image::InsertImageAction as A;
    match a {
        A::None => "none",
        A::CopyToCurrentDir => "copy-to-current-dir",
        A::CopyToAssets => "copy-to-assets",
        A::CopyToDocAssets => "copy-to-doc-assets",
        A::CopyToCustom => "copy-to-custom",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 解(s: 图片来源) -> Result<来源> {
        解析来源(s)
    }

    #[test]
    fn 地址要真的是网络地址() {
        // ⚠️ 这条挡的是"把本地路径当 URL 传进来"：那样下载会失败得莫名其妙
        // （`ureq` 报一句关于 scheme 的英文），而真正的问题是前端分错了类。
        assert!(解(图片来源::Url {
            url: "https://a/b.png".into()
        })
        .is_ok());
        assert!(解(图片来源::Url {
            url: "/home/u/x.png".into()
        })
        .is_err());
        assert!(解(图片来源::Url { url: "".into() }).is_err());
    }

    #[test]
    fn 空路径不是路径() {
        assert!(解(图片来源::Path { path: "".into() }).is_err());
        assert!(解(图片来源::Path {
            path: "/home/u/x.png".into()
        })
        .is_ok());
    }

    #[test]
    fn 剪贴板的字节要解得开且不是空的() {
        let 好的 = base64::engine::general_purpose::STANDARD.encode([1u8, 2, 3]);
        let r = 解(图片来源::Base64 {
            data: 好的.clone(),
            ext: Some("png".into()),
        })
        .unwrap();
        match r {
            来源::剪贴板 { 字节, 后缀 } => {
                assert_eq!(字节, vec![1, 2, 3]);
                assert_eq!(后缀, "png");
            }
            other => panic!("应该是剪贴板：{other:?}"),
        }

        // 不是 base64（用户手改过的 IPC 参数、或者别的东西发过来的）。
        assert!(解(图片来源::Base64 {
            data: "这不是 base64！！".into(),
            ext: None,
        })
        .is_err());
        // 解得开但是空的——不写一个 0 字节的文件到用户文件夹里。
        assert!(解(图片来源::Base64 {
            data: "".into(),
            ext: None,
        })
        .is_err());
    }

    #[test]
    fn 动作名字与设置里写出去的那一套一致() {
        // ⚠️ 这两处字符串**必须一样**：前端拿 `动作` 与设置页上那个下拉的值比对，
        // 判断"这次是不是按我选的那个动作落的"。改一处不改另一处，
        // 症状是"设置里选了复制到 assets，插入后提示说动作是「无特殊操作」"。
        use crate::settings::image::Image;
        let 表 = [
            ("none", crate::settings::image::InsertImageAction::None),
            (
                "copy-to-current-dir",
                crate::settings::image::InsertImageAction::CopyToCurrentDir,
            ),
            (
                "copy-to-assets",
                crate::settings::image::InsertImageAction::CopyToAssets,
            ),
            (
                "copy-to-doc-assets",
                crate::settings::image::InsertImageAction::CopyToDocAssets,
            ),
            (
                "copy-to-custom",
                crate::settings::image::InsertImageAction::CopyToCustom,
            ),
        ];
        for (名字, 值) in 表 {
            assert_eq!(动作名字(&值), 名字);
            let 文本 = toml::to_string_pretty(&Image {
                insert_action: 值,
                ..Default::default()
            })
            .unwrap();
            assert!(
                文本.contains(&format!("insert_action = \"{名字}\"")),
                "设置里写出去的与命令里报的不是一套：{名字}\n{文本}"
            );
        }
    }
}
