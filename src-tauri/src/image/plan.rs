//! 计划与落地：**先算出要做什么，再真的做**。
//!
//! 2026-09-26 从 `image.rs` 拆出来。[`算计划`] 是纯函数（不碰磁盘、不联网，
//! 所以能逐条测）；[`落地`] 执行它，其中"下载"是**注进来**的一个函数
//! （`取网络`）——这样"下载"那一支也能离线测。只有 [`放置`] 才把它接成真网络。
//!
//! ⚠️ 本文件是 `image` 这一块里**唯一碰网络的地方**（[`取网络字节`]）。
//! 它与 `lua/api/http.rs` 的规矩故意不同，理由写在那个函数的注释里。

use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};
use crate::settings::image::InsertImageAction;

use super::address::{加点点斜杠, 相对路径, 规则适用, 转义地址};
use super::target::{从地址猜名字, 内容短名, 定名, 目标目录};
use super::{认得的后缀, 来源, 做了, 规则, 计划, 结果};

/// 一次下载最多收多少字节。超了**报错**（不是截断）——半张图片写进磁盘
/// 比没有更糟：它看起来是张图，打开才知道坏了。
const 下载上限: u64 = 16 * 1024 * 1024;

/// 下载超时。
const 下载超时: std::time::Duration = std::time::Duration::from_secs(30);

/// 算计划。
///
/// `文档目录` / `文档名` 取当前文档：还没存过盘时是 `None`（那时四个复制动作
/// 会报错，见 [`目标目录`]）。
pub fn 算计划(
    来源: &来源,
    规则: &规则,
    文档目录: Option<&Path>,
    文档名: Option<&str>,
) -> Result<计划> {
    let 网络 = 来源.是网络();
    let 适用 = 规则适用(网络, 规则.apply_to_local, 规则.apply_to_remote);

    // 剪贴板没有"原处"，所以它**必须**落盘：动作是「无特殊操作」时退回
    // 「复制到 ./assets」。⚠️ 这是唯一一处"设置说的和做的不一样"，所以它不是
    // 偷偷发生的——`做了::写盘` 会回到界面上，前端会说明一句（见 `useImageInsert`）。
    let 动作 = if 来源.必须落盘() && 规则.action == InsertImageAction::None {
        InsertImageAction::CopyToAssets
    } else if 适用 {
        规则.action
    } else {
        InsertImageAction::None
    };

    let 目标 = 目标目录(动作, 文档目录, 文档名, &规则.custom_dir)?;

    let Some(目录) = 目标 else {
        // 不动：写用户给的那条地址（网络原样，本地按三条规则）。
        let 地址 = match 来源 {
            来源::网络地址(u) => 也许转义(u, true, 规则),
            来源::本地文件(p) => 写用户给的路径(p, 文档目录, 规则)?,
            来源::剪贴板 { .. } => unreachable!("剪贴板一定会落盘，走不到不动那一支"),
        };
        return Ok(计划::不动 { 地址 });
    };

    Ok(match 来源 {
        来源::本地文件(p) => 计划::复制 {
            从: p.clone(),
            到: 目录,
        },
        来源::网络地址(u) => 计划::下载 {
            地址: u.clone(),
            到: 目录,
        },
        来源::剪贴板 { 字节, 后缀 } => {
            let 后缀 = if 认得的后缀.contains(&后缀.to_ascii_lowercase().as_str()) {
                后缀.to_ascii_lowercase()
            } else {
                "png".to_string()
            };
            计划::写盘 {
                字节: 字节.clone(),
                到: 目录,
                名字: format!("image-{}.{后缀}", 内容短名(字节)),
            }
        }
    })
}

/// 用户给的那条本地路径该写成什么。
fn 写用户给的路径(给的: &Path, 文档目录: Option<&Path>, 规则: &规则) -> Result<String> {
    let 原文 = 给的.to_string_lossy().to_string();
    // 用户写的是相对路径（或文档没路径可比）→ 原样，只转义。
    if !给的.is_absolute() {
        return Ok(也许转义(&原文, false, 规则));
    }
    let 相对 = match (规则.prefer_relative, 文档目录) {
        (true, Some(目录)) => 相对路径(目录, 给的),
        _ => None,
    };
    Ok(match 相对 {
        Some(r) => {
            let r = if 规则.add_dot_slash { 加点点斜杠(&r) } else { r };
            也许转义(&r, false, 规则)
        }
        None => 也许转义(&原文, false, 规则),
    })
}

fn 也许转义(s: &str, 网络: bool, 规则: &规则) -> String {
    if 规则.escape_url {
        转义地址(s, 网络)
    } else {
        s.to_string()
    }
}

/// 落盘那一份该写成什么地址：**一律相对路径**（见文件头）。
fn 写落地的那一份(文件: &Path, 文档目录: Option<&Path>, 规则: &规则) -> String {
    let 相对 = 文档目录.and_then(|d| 相对路径(d, 文件));
    let s = match 相对 {
        Some(r) => {
            if 规则.add_dot_slash {
                加点点斜杠(&r)
            } else {
                r
            }
        }
        // 文档还没存盘时走不到这里（四个复制动作都要求文档目录），
        // 但真走到就退成绝对路径，别写个空地址。
        None => 文件.to_string_lossy().to_string(),
    };
    也许转义(&s, false, 规则)
}

/// 执行计划。`取网络` 是下载的实现——**注进来**，这样这个函数本身可以离线测。
pub fn 落地(
    计划: &计划,
    文档目录: Option<&Path>,
    规则: &规则,
    取网络: &dyn Fn(&str) -> Result<Vec<u8>>,
) -> Result<结果> {
    match 计划 {
        // ⚠️ 不落盘时**不碰磁盘**，一个字节都不读。
        计划::不动 { 地址 } => Ok(结果 {
            src: 地址.clone(),
            落到: None,
            做了: 做了::留在原处,
        }),
        计划::复制 { 从, 到 } => {
            let 字节 = std::fs::read(从).map_err(|e| NotaError::Read {
                path: 从.clone(),
                source: e,
            })?;
            let 名 = 从
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "image.png".to_string());
            let (路径, 要写) = 写一份(到, &名, &字节)?;
            let src = 写落地的那一份(&路径, 文档目录, 规则);
            Ok(结果 {
                src,
                落到: Some(路径.to_string_lossy().to_string()),
                做了: if 要写 { 做了::复制 } else { 做了::已有 },
            })
        }
        计划::下载 { 地址, 到 } => {
            let 字节 = 取网络(地址)?;
            let 名 = 从地址猜名字(地址);
            let (路径, 要写) = 写一份(到, &名, &字节)?;
            let src = 写落地的那一份(&路径, 文档目录, 规则);
            Ok(结果 {
                src,
                落到: Some(路径.to_string_lossy().to_string()),
                做了: if 要写 { 做了::下载 } else { 做了::已有 },
            })
        }
        计划::写盘 { 字节, 到, 名字 } => {
            let (路径, 要写) = 写一份(到, 名字, 字节)?;
            let src = 写落地的那一份(&路径, 文档目录, 规则);
            Ok(结果 {
                src,
                落到: Some(路径.to_string_lossy().to_string()),
                做了: if 要写 { 做了::写盘 } else { 做了::已有 },
            })
        }
    }
}

/// 建目录、定名、写。返回（路径，**写了没有**）。
fn 写一份(目录: &Path, 名字: &str, 字节: &[u8]) -> Result<(PathBuf, bool)> {
    std::fs::create_dir_all(目录).map_err(|e| NotaError::Write {
        path: 目录.to_path_buf(),
        source: e,
    })?;
    let (路径, 要写) = 定名(目录, 名字, Some(字节));
    if 要写 {
        std::fs::write(&路径, 字节).map_err(|e| NotaError::Write {
            path: 路径.clone(),
            source: e,
        })?;
    }
    Ok((路径, 要写))
}

/// 真的去下载。**这是本文件唯一碰网络的地方。**
///
/// ⚠️ 与 `lua/api/http.rs` 的规矩**故意不同**：那边只放行 https（插件发出去的
/// 东西不能走明文），这里 `http://` 放行——文档里的图片地址是**用户自己写的**，
/// 网上大量老图就是明文 http，把它挡掉等于"这个功能对一半的文档不可用"。
/// 相同的是：有上限、有超时、不跟认证头。
fn 取网络字节(地址: &str) -> Result<Vec<u8>> {
    let 配置 = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(下载超时))
        .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .build();
    let 请求 = ureq::http::Request::builder()
        .method("GET")
        .uri(地址)
        .header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .body(Vec::new())
        .map_err(|e| NotaError::other(format!("拼请求失败：{e}")))?;

    let mut resp = ureq::Agent::new_with_config(配置)
        .run(请求)
        .map_err(|e| NotaError::other(format!("下载失败（{地址}）：{e}")))?;

    let code = resp.status().as_u16();
    if !(200..300).contains(&code) {
        return Err(NotaError::other(format!(
            "下载失败（{地址}）：服务器回了 {code}"
        )));
    }
    let 字节 = resp
        .body_mut()
        .with_config()
        .limit(下载上限)
        .read_to_vec()
        .map_err(|e| {
            NotaError::other(format!(
                "下载失败（{地址}）：读响应出错（上限 {下载上限} 字节，超了也算失败）：{e}"
            ))
        })?;
    Ok(字节)
}

/// 命令层用的入口：算计划 + 执行（下载走真的网络）。
pub fn 放置(
    来源: &来源,
    规则: &规则,
    文档目录: Option<&Path>,
    文档名: Option<&str>,
) -> Result<结果> {
    let 计划 = 算计划(来源, 规则, 文档目录, 文档名)?;
    落地(&计划, 文档目录, 规则, &取网络字节)
}
