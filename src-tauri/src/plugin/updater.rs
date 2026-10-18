//! 插件仓库检查与更新。
//!
//! 一个插件可以在 `plugin.toml` 的 `[update] manifest` 里指向一份 `latest.json`。
//! 清单格式与官方插件仓库一致：一份文件列多个插件，宿主按 id 取当前插件那一项。
//! 这让任意插件作者可以维护自己的仓库，也可以让多个插件共用一个仓库。
//!
//! 网络读取不在 `plugins` 锁内进行。只有最后的安装动作持锁，并复用原有的
//! `.nota-plugin` 校验、验签与原子替换流程。

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::PluginHost;
use crate::error::{NotaError, Result};
use crate::remote;

const MANIFEST_LIMIT: u64 = 1024 * 1024;
const PACKAGE_LIMIT: u64 = 256 * 1024 * 1024;
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(30);
const PACKAGE_TIMEOUT: Duration = Duration::from_secs(600);

/// 一个已安装插件声明的更新来源快照。
#[derive(Debug, Clone)]
pub struct 更新来源 {
    pub id: String,
    pub name: String,
    pub version: String,
    pub manifest: String,
    /// 当前安装记录里的签名者指纹。更新包若换了签名者，自动替换直接拒绝。
    pub signer: Option<String>,
}

/// 检查结果。一个插件的仓库坏了不会妨碍同一批里别的插件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct 插件更新状态 {
    pub id: String,
    pub name: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub available: bool,
    pub asset_name: Option<String>,
    pub notes: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct 插件更新结果 {
    pub id: String,
    pub from_version: String,
    pub to_version: String,
}

#[derive(Debug, Deserialize)]
struct 仓库 {
    schema: u32,
    #[serde(default)]
    plugins: Vec<仓库项>,
}

#[derive(Debug, Clone, Deserialize)]
struct 仓库项 {
    id: String,
    version: String,
    file: String,
    sha256: String,
    url: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    size: Option<u64>,
}

pub(crate) struct 准备好的更新 {
    source: 更新来源,
    entry: 仓库项,
    path: PathBuf,
}

/// 从宿主内存里的插件清单抄一份更新来源。调用方拿到后应立即释放 `plugins` 锁。
pub fn 来源(host: &PluginHost) -> Vec<更新来源> {
    host.plugins
        .iter()
        .filter_map(|p| {
            let spec = p.manifest.update.as_ref()?;
            Some(更新来源 {
                id: p.manifest.meta.id.clone(),
                name: p.manifest.meta.name.clone(),
                version: p.manifest.meta.version.clone(),
                manifest: spec.manifest.clone(),
                signer: host.installed.record(&p.manifest.meta.id).and_then(|r| r.key_id.clone()),
            })
        })
        .collect()
}

/// 检查全部已声明更新源的插件。
pub fn 检查(sources: &[更新来源]) -> Vec<插件更新状态> {
    let mut 按地址: BTreeMap<String, Result<仓库>> = BTreeMap::new();
    for source in sources {
        按地址
            .entry(source.manifest.clone())
            .or_insert_with(|| 取仓库(&source.manifest));
    }

    sources
        .iter()
        .map(|source| {
            let result = 按地址
                .get(&source.manifest)
                .expect("每个来源都已取过仓库");
            match result {
                Ok(repo) => match 找仓库项(repo, &source.id) {
                    Some(entry) => 状态(source, entry),
                    None => 错误状态(
                        source,
                        format!("仓库 {} 里没有 `{}`", source.manifest, source.id),
                    ),
                },
                Err(e) => 错误状态(source, e.to_string()),
            }
        })
        .collect()
}

/// 准备一个插件更新：重新读取仓库、验证地址与 SHA-256，并写到临时文件。
///
/// 返回后调用方应持 `plugins` 锁执行 `PluginHost::装`，再删除临时文件。
pub(crate) fn 准备(source: &更新来源) -> Result<准备好的更新> {
    let repo = 取仓库(&source.manifest)?;
    let entry = 找仓库项(&repo, &source.id).cloned().ok_or_else(|| {
        NotaError::other(format!("仓库 {} 里没有 `{}`", source.manifest, source.id))
    })?;
    if !crate::update::版本大于(&entry.version, &source.version) {
        return Err(NotaError::other(format!(
            "{} 已经是当前版本或没有更新",
            source.name
        )));
    }
    if !remote::地址可信(&entry.url) {
        return Err(NotaError::other("插件包地址必须是 HTTPS"));
    }
    if entry.size.is_some_and(|size| size > PACKAGE_LIMIT) {
        return Err(NotaError::other("插件包超过 256 MiB 上限"));
    }
    let bytes = remote::取(&entry.url, PACKAGE_LIMIT, PACKAGE_TIMEOUT)?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if digest != entry.sha256.to_ascii_lowercase() {
        return Err(NotaError::other(format!(
            "插件包校验失败：期望 {}，实际 {digest}",
            entry.sha256
        )));
    }
    if let Some(expected) = &source.signer {
        let package = super::package::包::从zip(&bytes)?;
        let actual = package
            .签名
            .as_ref()
            .map(|sig| super::installed::公钥指纹(&sig.public_key));
        if actual.as_deref() != Some(expected.as_str()) {
            return Err(NotaError::other(format!(
                "{} 的更新包签名者与原安装不一致，已拒绝自动替换",
                source.name
            )));
        }
    }

    let dir = std::env::temp_dir().join("nota-plugin-update");
    fs::create_dir_all(&dir)
        .map_err(|e| NotaError::other(format!("插件更新临时目录建不出来：{e}")))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let path = dir.join(format!(
        "{}-{}-{}-{nonce}.nota-plugin",
        crate::paths::安全文件名(&source.id),
        crate::paths::安全文件名(&entry.version),
        std::process::id(),
    ));
    fs::write(&path, bytes)
        .map_err(|e| NotaError::other(format!("插件更新包写不进去：{e}")))?;
    Ok(准备好的更新 {
        source: source.clone(),
        entry,
        path,
    })
}

/// 安装已经准备好的更新，并给出实际版本变化。
pub(crate) fn 安装(host: &mut PluginHost, prepared: 准备好的更新) -> Result<插件更新结果> {
    let result = host.装(&prepared.path);
    let _ = fs::remove_file(&prepared.path);
    let installed = result?;
    if installed != prepared.source.id {
        return Err(NotaError::other(format!(
            "更新包装成了另一个插件 `{installed}`，期望 `{}`",
            prepared.source.id
        )));
    }
    Ok(插件更新结果 {
        id: installed,
        from_version: prepared.source.version,
        to_version: prepared.entry.version,
    })
}

fn 取仓库(url: &str) -> Result<仓库> {
    if !remote::地址可信(url) {
        return Err(NotaError::other("插件更新清单地址必须是 HTTPS"));
    }
    let bytes = remote::取(url, MANIFEST_LIMIT, MANIFEST_TIMEOUT)?;
    let repo: 仓库 = serde_json::from_slice(&bytes)
        .map_err(|e| NotaError::other(format!("插件更新清单解析失败：{e}")))?;
    if repo.schema != 1 {
        return Err(NotaError::other(format!(
            "插件更新清单版本 {} 不受支持",
            repo.schema
        )));
    }
    Ok(repo)
}

fn 找仓库项<'a>(repo: &'a 仓库, id: &str) -> Option<&'a 仓库项> {
    repo.plugins.iter().find(|entry| entry.id == id)
}

fn 状态(source: &更新来源, entry: &仓库项) -> 插件更新状态 {
    插件更新状态 {
        id: source.id.clone(),
        name: source.name.clone(),
        current_version: source.version.clone(),
        latest_version: Some(entry.version.clone()),
        available: crate::update::版本大于(&entry.version, &source.version),
        asset_name: Some(entry.file.clone()),
        notes: entry.notes.clone(),
        error: None,
    }
}

fn 错误状态(source: &更新来源, error: String) -> 插件更新状态 {
    插件更新状态 {
        id: source.id.clone(),
        name: source.name.clone(),
        current_version: source.version.clone(),
        latest_version: None,
        available: false,
        asset_name: None,
        notes: String::new(),
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 同一份仓库能按_id_分清多个插件() {
        let repo: 仓库 = serde_json::from_str(
            r#"{
              "schema": 1,
              "plugins": [
                {"id":"nota.ai","version":"0.2.0","file":"ai.nota-plugin",
                 "sha256":"aa","url":"https://example.com/ai"},
                {"id":"nota.git","version":"0.3.0","file":"git.nota-plugin",
                 "sha256":"bb","url":"https://example.com/git"}
              ]
            }"#,
        )
        .unwrap();
        assert_eq!(找仓库项(&repo, "nota.ai").unwrap().file, "ai.nota-plugin");
        assert_eq!(找仓库项(&repo, "nota.git").unwrap().file, "git.nota-plugin");
    }

}
