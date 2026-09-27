//! 落点与文件名：**这份副本写进哪个目录、叫什么名字**。
//!
//! 2026-09-26 从 `image.rs` 拆出来。回答的是两个独立的问题：
//! [`目标目录`] 看的是用户选的插入动作与文档位置（**一个字节都不写**，只算路径），
//! [`定名`] 看的是目标目录里已经有什么。
//!
//! ⚠️ 「同内容不重复写」这条口径写在 `image.rs` 的文件头，这里只实现它。
//!
//! ⚠️ [`从地址猜名字`] 是 `pub(super)` 而不是私有：`image/tests.rs` 直接测它
//! （`从地址猜名字取末段或摘要`）。[`内容短名`] 同样是 `pub(super)`，但理由不同
//! ——它是给 `image/plan.rs` 的算计划用的（剪贴板图片的默认名字：`image-<摘要>.png`），
//! 而 `target.rs` 之外的这一支也要用它。除此之外没有第三个调用方。

use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};
use crate::settings::image::InsertImageAction;

use super::认得的后缀;

/// 文件名最长多少个字符（按字符不是字节数，中文名一个算一个）。
/// 太长的名字在有的文件系统上直接 `ENAMETOOLONG`，而那个报错对用户毫无意义。
const 名字上限: usize = 80;

/// 目标目录。`Ok(None)` = 这张图不用复制。
///
/// ⚠️ 四个复制动作**都要文档已经存过盘**（`doc_dir` 是 `None` 就是没存过）：
/// 「复制到文档旁边」里的"文档旁边"在文档还没有路径时不存在。
/// 那时**报错**，不猜一个目录——猜出来的目录（比如"当前工作目录"或"主目录"）
/// 会在用户下次存盘时变成一个谁也想不到的地方多出一堆图片。
pub fn 目标目录(
    action: InsertImageAction,
    doc_dir: Option<&Path>,
    doc_stem: Option<&str>,
    custom_dir: &str,
) -> Result<Option<PathBuf>> {
    let 要文档旁边 = |做什么: &str| -> Result<PathBuf> {
        let d = doc_dir.ok_or_else(|| {
            NotaError::other(format!(
                "「{做什么}」要知道文档在哪个目录，而这份文档还没存过盘——\
                 先保存一次（Ctrl+S）再插入图片"
            ))
        })?;
        Ok(d.to_path_buf())
    };
    match action {
        InsertImageAction::None => Ok(None),
        InsertImageAction::CopyToCurrentDir => Ok(Some(要文档旁边("复制到当前目录")?)),
        InsertImageAction::CopyToAssets => Ok(Some(要文档旁边("复制到 ./assets")?.join("assets"))),
        InsertImageAction::CopyToDocAssets => {
            let 目录 = 要文档旁边("复制到 ./$(filename).assets")?;
            let 名 = doc_stem.filter(|s| !s.is_empty()).ok_or_else(|| {
                NotaError::other("这份文档没有文件名，定不出 `$(filename).assets` 这个名字")
            })?;
            Ok(Some(目录.join(format!("{名}.assets"))))
        }
        InsertImageAction::CopyToCustom => {
            let 要 = custom_dir.trim();
            if 要.is_empty() {
                return Err(NotaError::other(
                    "「复制到指定路径」还没填路径——去「设置 → 图像」把它填上，\
                     或者换一个插入动作",
                ));
            }
            let p = PathBuf::from(要);
            if p.is_absolute() {
                Ok(Some(p))
            } else {
                // 相对路径按**文档目录**算，不按"进程当前目录"算：后者是应用的
                // 工作目录，跟用户看着的那个文件夹没有关系，写出来会莫名其妙。
                Ok(Some(要文档旁边("复制到指定路径")?.join(p)))
            }
        }
    }
}

/// 把想用的文件名收拾成一个能落盘的名字。
///
/// 去掉路径分隔符与控制字符（**不报错**，直接剔除）：这个名字可能来自一条 URL
/// 的末段，也可能来自剪贴板，里面出现 `../` 的场合是真实存在的，而那时
/// "报错让用户改个 URL"毫无意义。
fn 收拾名字(想要: &str) -> String {
    let 末段 = 想要
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(想要)
        .trim()
        .trim_start_matches('.');
    let 清过: String = 末段
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .take(名字上限)
        .collect();
    let 清过 = 清过.trim().to_string();
    if 清过.is_empty() {
        "image.png".to_string()
    } else {
        清过
    }
}

/// 后缀（小写，不带点）。认不出给 `None`。
fn 取后缀(名字: &str) -> Option<String> {
    let 段 = 名字.rsplit_once('.')?;
    let 尾 = 段.1.to_ascii_lowercase();
    if 认得的后缀.contains(&尾.as_str()) {
        Some(尾)
    } else {
        None
    }
}

/// 内容摘要的前 8 位十六进制——给"没有名字的图"（剪贴板）起名用。
///
/// 用它而不是时间戳，是为了**同一张图永远得到同一个名字**：连粘两次同一张截图
/// 得到的是一条地址、一份文件（配合"同内容不重复写"），而不是两份一模一样的图。
pub(super) fn 内容短名(字节: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(字节);
    let d = h.finalize();
    d.iter().take(4).map(|b| format!("{b:02x}")).collect()
}

/// 名字去掉后缀（`a.png` → `a`）。
fn 去后缀(名字: &str) -> &str {
    match 名字.rsplit_once('.') {
        Some((前, _)) => 前,
        None => 名字,
    }
}

/// 定一个**可以写**的完整路径：目录里已经有一份相同内容就用它，名字被占且内容
/// 不同就加 `-1`、`-2`……
///
/// 返回的第一项是要写的路径；第二项 `false` 表示**不用写**（复用了已有的那份）。
pub fn 定名(目录: &Path, 想要的名字: &str, 内容: Option<&[u8]>) -> (PathBuf, bool) {
    let 名字 = 收拾名字(想要的名字);
    let 主干 = 去后缀(&名字).to_string();
    let 后缀 = 取后缀(&名字).map(|e| format!(".{e}")).unwrap_or_default();
    for i in 0..1000u32 {
        let 候选 = if i == 0 {
            目录.join(&名字)
        } else {
            目录.join(format!("{主干}-{i}{后缀}"))
        };
        if !候选.exists() {
            return (候选, true);
        }
        if let Some(内容) = 内容 {
            // 同内容 = 就是它，别再写一份。读失败（权限、正好被删）时当作
            // "内容不同"继续找下一个名字——这里不该因为读不到就整条失败。
            if std::fs::read(&候选).is_ok_and(|旧| 旧 == 内容) {
                return (候选, false);
            }
        }
    }
    (目录.join(format!("{主干}-999{后缀}")), true)
}

/// 从一条 URL 猜个文件名（末段；没有就用内容摘要）。
pub(super) fn 从地址猜名字(地址: &str) -> String {
    let 末段 = 地址
        .split(['?', '#'])
        .next()
        .unwrap_or(地址)
        .rsplit('/')
        .next()
        .unwrap_or("");
    let 名字 = 收拾名字(末段);
    if 取后缀(&名字).is_some() {
        名字
    } else {
        // 认不出后缀（`/img/12345` 这种），补一个 `.png`：
        // 没有后缀的图片文件在文件管理器里双击打不开，而这里是"用户的图片"。
        format!("image-{}.png", 内容短名(地址.as_bytes()))
    }
}
