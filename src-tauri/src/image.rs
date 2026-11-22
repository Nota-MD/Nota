use std::path::PathBuf;

use crate::settings::image::InsertImageAction;

mod address;
mod plan;
mod target;

#[cfg(test)]
mod tests;

pub use address::{
    is_network_address, jia_dian_dian_xie_gang, resolve_local_file, rule_shi_yong, xiang_dui_path,
    zhuan_yi_address,
};
pub use plan::{luo_di, place, suan_ji_hua};
pub use target::{ding_ming, target_directory};

pub const RECOGNIZED_EXTENSIONS: [&str; 8] =
    ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

#[derive(Debug, Clone)]
pub enum ImageSource {
    LocalFile(PathBuf),

    NetworkAddress(String),

    Clipboard {
        zi_jie: Vec<u8>,
        extension_2: String,
    },
}

impl ImageSource {
    pub fn is_network_2(&self) -> bool {
        matches!(self, ImageSource::NetworkAddress(_))
    }

    pub fn bi_xu_luo_pan(&self) -> bool {
        matches!(self, ImageSource::Clipboard { .. })
    }

    pub fn miao_shu(&self) -> String {
        match self {
            ImageSource::LocalFile(p) => p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| p.to_string_lossy().to_string()),
            ImageSource::NetworkAddress(u) => u.clone(),
            ImageSource::Clipboard { .. } => "Image from clipboard".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct InsertionRule {
    pub action: InsertImageAction,
    pub apply_to_local: bool,
    pub apply_to_remote: bool,
    pub custom_dir: String,
    pub prefer_relative: bool,
    pub add_dot_slash: bool,
    pub escape_url: bool,
}

impl InsertionRule {
    pub fn from_settings(i: &crate::settings::image::Image) -> Self {
        Self {
            action: i.insert_action,
            apply_to_local: i.apply_to_local,
            apply_to_remote: i.apply_to_remote,
            custom_dir: i.custom_dir.clone(),
            prefer_relative: i.prefer_relative,
            add_dot_slash: i.add_dot_slash,
            escape_url: i.escape_url,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlacementPlan {
    KeepInPlace {
        address_2: String,
    },

    Copy {
        cong: PathBuf,
        dao: PathBuf,
    },

    Download {
        address_2: String,
        dao: PathBuf,
    },

    WriteToDisk {
        zi_jie: Vec<u8>,
        dao: PathBuf,
        name_2: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum PlacementOperation {
    #[serde(rename = "kept")]
    KeepInPlace,

    #[serde(rename = "copied")]
    Copy,

    #[serde(rename = "downloaded")]
    Download,

    #[serde(rename = "written")]
    WriteToDisk,

    #[serde(rename = "existing")]
    AlreadyExists,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PlacementOutcome {
    pub src: String,

    pub saved_to: Option<String>,
    pub operation_2: PlacementOperation,
}
