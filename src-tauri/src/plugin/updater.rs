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

#[derive(Debug, Clone)]
pub struct UpdateSource {
    pub id: String,
    pub name: String,
    pub version: String,
    pub manifest: String,

    pub signer: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdateStatus {
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
pub struct PluginUpdateResult {
    pub id: String,
    pub from_version: String,
    pub to_version: String,
}

#[derive(Debug, Deserialize)]
struct UpdateRepository {
    schema: u32,
    #[serde(default)]
    plugins: Vec<RepositoryEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct RepositoryEntry {
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

pub(crate) struct PreparedUpdate {
    source: UpdateSource,
    entry: RepositoryEntry,
    path: PathBuf,
}

pub fn sources(host: &PluginHost) -> Vec<UpdateSource> {
    host.plugins
        .iter()
        .filter_map(|p| {
            let spec = p.manifest.update.as_ref()?;
            Some(UpdateSource {
                id: p.manifest.meta.id.clone(),
                name: p.manifest.meta.name.clone(),
                version: p.manifest.meta.version.clone(),
                manifest: spec.manifest.clone(),
                signer: host
                    .installed
                    .record(&p.manifest.meta.id)
                    .and_then(|r| r.key_id.clone()),
            })
        })
        .collect()
}

pub fn check_updates(sources: &[UpdateSource], replacements: &str) -> Vec<PluginUpdateStatus> {
    let mut by_url: BTreeMap<String, Result<UpdateRepository>> = BTreeMap::new();
    for source in sources {
        by_url
            .entry(source.manifest.clone())
            .or_insert_with(|| fetch_repository(&source.manifest, replacements));
    }

    sources
        .iter()
        .map(|source| {
            let result = by_url
                .get(&source.manifest)
                .expect("every source has fetched a repository");
            match result {
                Ok(repo) => match find_entry(repo, &source.id) {
                    Some(entry) => status_from_entry(source, entry),
                    None => error_status(
                        source,
                        format!(
                            "Repository {} does not contain plugin {}",
                            source.manifest, source.id
                        ),
                    ),
                },
                Err(error) => error_status(source, error.to_string()),
            }
        })
        .collect()
}

pub(crate) fn prepare_update(source: &UpdateSource, replacements: &str) -> Result<PreparedUpdate> {
    let repo = fetch_repository(&source.manifest, replacements)?;
    let entry = find_entry(&repo, &source.id).cloned().ok_or_else(|| {
        NotaError::other(format!(
            "Repository {} does not contain plugin {}",
            source.manifest, source.id
        ))
    })?;
    if !crate::update::version_greater(&entry.version, &source.version) {
        return Err(NotaError::other(format!(
            "{} is already current or has no available update",
            source.name
        )));
    }
    if !remote::is_trusted_address(&entry.url) {
        return Err(NotaError::other("Plugin package URL must use HTTPS"));
    }
    if entry.size.is_some_and(|size| size > PACKAGE_LIMIT) {
        return Err(NotaError::other("Plugin package exceeds the 256 MiB limit"));
    }
    let bytes = remote::fetch(&entry.url, replacements, PACKAGE_LIMIT, PACKAGE_TIMEOUT)?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if digest != entry.sha256.to_ascii_lowercase() {
        return Err(NotaError::other(format!(
            "Plugin package checksum mismatch: expected {}, got {digest}",
            entry.sha256
        )));
    }
    if let Some(expected) = &source.signer {
        let package = super::package::Package::from_zip(&bytes)?;
        let actual = package
            .before_name
            .as_ref()
            .map(|sig| super::installed::work_need_fingerprint(&sig.public_key));
        if actual.as_deref() != Some(expected.as_str()) {
            return Err(NotaError::other(format!(
                "The update signer for {} differs from the installed package; automatic replacement was rejected",
                source.name
            )));
        }
    }

    let dir = std::env::temp_dir().join("nota-plugin-update");
    fs::create_dir_all(&dir).map_err(|e| {
        NotaError::other(format!(
            "Could not create the plugin update temp directory: {e}"
        ))
    })?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let path = dir.join(format!(
        "{}-{}-{}-{nonce}.nota-plugin",
        crate::paths::safe_filename(&source.id),
        crate::paths::safe_filename(&entry.version),
        std::process::id(),
    ));
    fs::write(&path, bytes)
        .map_err(|e| NotaError::other(format!("Could not write the plugin update package: {e}")))?;
    Ok(PreparedUpdate {
        source: source.clone(),
        entry,
        path,
    })
}

pub(crate) fn install_update(
    host: &mut PluginHost,
    prepared: PreparedUpdate,
) -> Result<PluginUpdateResult> {
    let result = host.install_2(&prepared.path);
    let _ = fs::remove_file(&prepared.path);
    let installed = result?;
    if installed != prepared.source.id {
        return Err(NotaError::other(format!(
            "Updated package installed plugin {installed}, expected {}",
            prepared.source.id
        )));
    }
    Ok(PluginUpdateResult {
        id: installed,
        from_version: prepared.source.version,
        to_version: prepared.entry.version,
    })
}

fn fetch_repository(url: &str, replacements: &str) -> Result<UpdateRepository> {
    if !remote::is_trusted_address(url) {
        return Err(NotaError::other(
            "Plugin update manifest URL must use HTTPS",
        ));
    }
    let bytes = remote::fetch(url, replacements, MANIFEST_LIMIT, MANIFEST_TIMEOUT)?;
    let repo: UpdateRepository = serde_json::from_slice(&bytes).map_err(|e| {
        NotaError::other(format!("Could not parse the plugin update manifest: {e}"))
    })?;
    if repo.schema != 1 {
        return Err(NotaError::other(format!(
            "Unsupported plugin update manifest version {}",
            repo.schema
        )));
    }
    Ok(repo)
}

fn find_entry<'a>(repo: &'a UpdateRepository, id: &str) -> Option<&'a RepositoryEntry> {
    repo.plugins.iter().find(|entry| entry.id == id)
}

fn status_from_entry(source: &UpdateSource, entry: &RepositoryEntry) -> PluginUpdateStatus {
    PluginUpdateStatus {
        id: source.id.clone(),
        name: source.name.clone(),
        current_version: source.version.clone(),
        latest_version: Some(entry.version.clone()),
        available: crate::update::version_greater(&entry.version, &source.version),
        asset_name: Some(entry.file.clone()),
        notes: entry.notes.clone(),
        error: None,
    }
}

fn error_status(source: &UpdateSource, error: String) -> PluginUpdateStatus {
    PluginUpdateStatus {
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
    fn one_repository_updates_plugins_by_id() {
        let repo: UpdateRepository = serde_json::from_str(
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
        assert_eq!(find_entry(&repo, "nota.ai").unwrap().file, "ai.nota-plugin");
        assert_eq!(
            find_entry(&repo, "nota.git").unwrap().file,
            "git.nota-plugin"
        );
    }
}
