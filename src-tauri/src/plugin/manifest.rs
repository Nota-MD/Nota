//! license     = "BSD-2-Clause"

use std::fmt;
use std::path::{Path, PathBuf};
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::{NotaError, Result};
use crate::lang;

use super::settings_decl;

pub use settings_decl::SettingDecl;

pub const NOTA_PLUGIN_API_VERSION: PluginApiVersion = PluginApiVersion::new(2, 5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PluginApiVersion {
    pub major: u16,
    pub minor: u16,
}

impl PluginApiVersion {
    pub const fn new(major: u16, minor: u16) -> Self {
        Self { major, minor }
    }

    pub fn supports(self, requested: Self) -> bool {
        self.major == requested.major && requested.minor <= self.minor
    }
}

impl fmt::Display for PluginApiVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "v{}.{}", self.major, self.minor)
    }
}

impl FromStr for PluginApiVersion {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        let Some(rest) = value.strip_prefix('v') else {
            return Err("API version must use vMAJOR.MINOR".to_owned());
        };
        let Some((major, minor)) = rest.split_once('.') else {
            return Err("API version must use vMAJOR.MINOR".to_owned());
        };
        if major.is_empty() || minor.is_empty() || major.contains('.') || minor.contains('.') {
            return Err("API version must use vMAJOR.MINOR".to_owned());
        }
        Ok(Self {
            major: major
                .parse()
                .map_err(|_| "invalid API major version".to_owned())?,
            minor: minor
                .parse()
                .map_err(|_| "invalid API minor version".to_owned())?,
        })
    }
}

impl Serialize for PluginApiVersion {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for PluginApiVersion {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            Text(String),
            Legacy(u16),
        }

        match Raw::deserialize(deserializer)? {
            Raw::Text(value) => value.parse().map_err(serde::de::Error::custom),
            Raw::Legacy(major) => Ok(Self::new(major, 0)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    #[serde(rename = "document.read")]
    DocumentRead,

    #[serde(rename = "document.write")]
    DocumentWrite,

    #[serde(rename = "fs.read")]
    FsRead,

    #[serde(rename = "fs.write")]
    FsWrite,

    #[serde(rename = "process.git")]
    ProcessGit,

    #[serde(rename = "process.devserver")]
    ProcessDevServer,

    #[serde(rename = "network.http")]
    NetworkHttp,

    #[serde(rename = "ai.context.read")]
    AiContextRead,

    #[serde(rename = "ai.context.write")]
    AiContextWrite,

    #[serde(rename = "ui.notify")]
    UiNotify,

    #[serde(rename = "ui.open_url")]
    UiOpenUrl,

    #[serde(rename = "ui.panel")]
    UiPanel,

    #[serde(rename = "ui.menu")]
    UiMenu,

    #[serde(rename = "editor.input")]
    EditorInput,

    #[serde(rename = "settings.own")]
    SettingsOwn,

    #[serde(rename = "data.own")]
    DataOwn,
}

impl Capability {
    pub fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "document.read" => Self::DocumentRead,
            "document.write" => Self::DocumentWrite,
            "fs.read" => Self::FsRead,
            "fs.write" => Self::FsWrite,
            "process.git" => Self::ProcessGit,
            "process.devserver" => Self::ProcessDevServer,
            "network.http" => Self::NetworkHttp,
            "ai.context.read" => Self::AiContextRead,
            "ai.context.write" => Self::AiContextWrite,
            "ui.notify" => Self::UiNotify,
            "ui.open_url" => Self::UiOpenUrl,
            "ui.panel" => Self::UiPanel,
            "ui.menu" => Self::UiMenu,
            "editor.input" => Self::EditorInput,
            "settings.own" => Self::SettingsOwn,
            "data.own" => Self::DataOwn,
            other => {
                return Err(NotaError::other(format!(
                    "Unknown capability `{other}`; see the capability table in docs/11"
                )))
            }
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub api: PluginApiVersion,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub license: String,

    #[serde(default)]
    pub capabilities: Vec<String>,

    #[serde(default)]
    pub langs: Vec<String>,
}

fn default_version() -> String {
    "0.0.0".to_owned()
}

fn default_entry() -> String {
    "main.lua".to_owned()
}

#[derive(Debug, Clone, Deserialize)]
pub struct DevServerSpec {
    pub cmd: String,

    #[serde(default)]
    pub cmd_env: Option<String>,

    #[serde(default)]
    pub args: Vec<String>,

    #[serde(default)]
    pub entry: Option<String>,

    #[serde(default)]
    pub probe_args: Option<Vec<String>>,

    #[serde(default)]
    pub probe_env: Option<std::collections::BTreeMap<String, String>>,

    #[serde(default)]
    pub project_marker: Option<String>,
}

impl DevServerSpec {
    pub fn command(&self) -> String {
        match &self.cmd_env {
            Some(var) => crate::proc::command_or_default(var, &self.cmd),
            None => self.cmd.clone(),
        }
    }

    pub fn entry_name(&self, doc: u64) -> Option<String> {
        self.entry
            .as_ref()
            .map(|t| t.replace("{doc}", &doc.to_string()))
    }

    pub fn probe_args(&self) -> Vec<String> {
        self.probe_args
            .clone()
            .unwrap_or_else(|| vec!["--version".to_owned()])
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSpec {
    pub manifest: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ManifestFile {
    plugin: PluginMeta,
    #[serde(default)]
    devserver: Option<DevServerSpec>,
    #[serde(default)]
    update: Option<UpdateSpec>,

    #[serde(default)]
    settings: Vec<SettingDecl>,
}

#[derive(Debug, Clone)]
pub struct Manifest {
    pub meta: PluginMeta,

    pub dir: PathBuf,
    pub capabilities: Vec<Capability>,

    pub devserver: Option<DevServerSpec>,

    pub update: Option<UpdateSpec>,

    pub settings: Vec<SettingDecl>,
}

impl Manifest {
    pub fn entry_path(&self) -> PathBuf {
        self.dir.join(&self.meta.entry)
    }

    pub fn load(path: &Path) -> Result<Self> {
        Self::load_maybe_unchecked(path, true)
    }

    pub(crate) fn load_unchecked(path: &Path) -> Result<Self> {
        Self::load_maybe_unchecked(path, false)
    }

    fn load_maybe_unchecked(path: &Path, check_api: bool) -> Result<Self> {
        let text = std::fs::read_to_string(path).map_err(|source| NotaError::Read {
            path: path.to_path_buf(),
            source,
        })?;

        let file: ManifestFile = toml::from_str(&text).map_err(|e| NotaError::Manifest {
            file: path.to_path_buf(),
            reason: e.to_string(),
        })?;

        let dir = path
            .parent()
            .ok_or_else(|| NotaError::Manifest {
                file: path.to_path_buf(),
                reason: "plugin.toml has no parent directory".to_owned(),
            })?
            .to_path_buf();

        Self::from_meta(
            file.plugin,
            file.devserver,
            file.update,
            file.settings,
            dir,
            path,
            check_api,
        )
    }

    fn from_meta(
        meta: PluginMeta,
        devserver: Option<DevServerSpec>,
        update: Option<UpdateSpec>,
        settings: Vec<SettingDecl>,
        dir: PathBuf,
        file: &Path,
        check_api: bool,
    ) -> Result<Self> {
        if meta.id.is_empty() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: "The extension ID cannot be empty".to_owned(),
            });
        }
        if !meta.id.chars().all(|c| {
            c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-' || c == '_'
        }) {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!("Extension ID `{}` may contain only lowercase letters, digits, `.`, `-`, and `_`", meta.id),
            });
        }

        if check_api && !NOTA_PLUGIN_API_VERSION.supports(meta.api) {
            return Err(NotaError::PluginApiMismatch {
                id: meta.id.clone(),
                wanted: meta.api.to_string(),
                have: NOTA_PLUGIN_API_VERSION.to_string(),
            });
        }

        if meta.entry.contains("..") || Path::new(&meta.entry).is_absolute() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!(
                    "Entry `{}` must be a path relative to the extension directory",
                    meta.entry
                ),
            });
        }

        let mut capabilities = Vec::new();
        for raw in &meta.capabilities {
            let cap = Capability::parse(raw).map_err(|e| NotaError::Manifest {
                file: file.to_path_buf(),
                reason: e.to_string(),
            })?;
            if !capabilities.contains(&cap) {
                capabilities.push(cap);
            }
        }

        if !meta.langs.is_empty()
            && lang::match_language(lang::PLUGIN_FALLBACK, &meta.langs).is_none()
        {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!(
                    "`langs` must include `en` as the fallback (currently {:?})",
                    meta.langs
                ),
            });
        }

        let devserver = check_devserver(devserver, &capabilities, file)?;

        if let Some(spec) = &update {
            if !crate::remote::is_trusted_address(&spec.manifest) {
                return Err(NotaError::Manifest {
                    file: file.to_path_buf(),
                    reason: format!(
                        "`[update] manifest` must use HTTPS; loopback HTTP is allowed only for development: {}",
                        spec.manifest
                    ),
                });
            }
        }

        let settings = settings_decl::check_settings(settings, &capabilities, file)?;
        Ok(Manifest {
            meta,
            dir,
            capabilities,
            devserver,
            update,
            settings,
        })
    }

    pub fn has(&self, cap: Capability) -> bool {
        self.capabilities.contains(&cap)
    }
}

fn check_devserver(
    spec: Option<DevServerSpec>,
    capabilities: &[Capability],
    file: &Path,
) -> Result<Option<DevServerSpec>> {
    let deep_request = capabilities.contains(&Capability::ProcessDevServer);

    let Some(spec) = spec else {
        if deep_request {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: "`process.devserver` requires a `[devserver]` section".to_owned(),
            });
        }
        return Ok(None);
    };

    if !deep_request {
        return Err(NotaError::Manifest {
            file: file.to_path_buf(),
            reason: "`[devserver]` requires the `process.devserver` capability".to_owned(),
        });
    }

    if spec.cmd.trim().is_empty() {
        return Err(NotaError::Manifest {
            file: file.to_path_buf(),
            reason: "`[devserver] cmd` cannot be empty".to_owned(),
        });
    }

    if let Some(name) = &spec.entry {
        let month_boundary = Path::new(name)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)));
        if month_boundary {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!("`[devserver] entry` must be a file name; received `{name}`"),
            });
        }
    }

    Ok(Some(spec))
}

pub fn channel_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

pub fn find_manifests(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();

    let direct = root.join("plugin.toml");
    if direct.is_file() {
        out.push(direct);
        return out;
    }

    let Ok(entries) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        if entry
            .file_name()
            .to_str()
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        let candidate = entry.path().join("plugin.toml");
        if candidate.is_file() {
            out.push(candidate);
        }
    }
    out.sort();
    out
}

#[cfg(test)]
pub(crate) mod tests;
