use std::path::{Path, PathBuf};

use mlua::{Lua, Table};

use super::{lua_err, mlua_to_nota};
use crate::error::{NotaError, Result};
use crate::plugin::manifest::Manifest;

const MAX_ASSET_BYTES: u64 = 1024 * 1024;

pub fn build(lua: &Lua, manifest: &Manifest) -> Result<Table> {
    let table = lua.create_table().map_err(mlua_to_nota)?;
    let root = manifest.dir.clone();
    let read = lua
        .create_function(move |_, path: String| read_resource(&root, &path).map_err(lua_err))
        .map_err(mlua_to_nota)?;
    table.set("read", read).map_err(mlua_to_nota)?;
    Ok(table)
}

fn read_resource(root: &Path, relative: &str) -> Result<String> {
    if relative.trim().is_empty() {
        return Err(NotaError::other("nota.assets.read path must not be empty"));
    }
    let path: PathBuf = crate::lua::api::fs::resolve_in(root, relative)?;
    if !path.is_file() {
        return Err(NotaError::other(format!(
            "Extension asset is missing or is a directory: {relative}"
        )));
    }
    let size = std::fs::metadata(&path)
        .map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?
        .len();
    if size > MAX_ASSET_BYTES {
        return Err(NotaError::other(format!(
            "Extension asset {relative} is {size} bytes, exceeding the 1 MiB limit"
        )));
    }
    std::fs::read_to_string(&path).map_err(|source| NotaError::Read { path, source })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nota-assets-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("profiles")).unwrap();
        std::fs::write(root.join("profiles/vi.json"), r#"{"id":"vi"}"#).unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn reads_a_relative_asset() {
        let root = fixture("read");
        assert_eq!(
            read_resource(&root, "profiles/vi.json").unwrap(),
            r#"{"id":"vi"}"#
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_absolute_and_escaping_paths() {
        let root = fixture("escape");
        assert!(read_resource(&root, "/etc/passwd").is_err());
        assert!(read_resource(&root, "../outside.json").is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn reports_missing_assets() {
        let root = fixture("missing");
        let error = read_resource(&root, "profiles/missing.json").unwrap_err();
        assert!(error.to_string().contains("missing"));
        let _ = std::fs::remove_dir_all(root);
    }
}
