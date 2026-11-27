use std::fs;
use std::path::Path;

use crate::error::{NotaError, Result};
use crate::plugin::PluginHost;

pub fn install_bundled_extensions(host: &mut PluginHost, resource_dir: &Path) -> Result<usize> {
    let profile_path = resource_dir.join(crate::distribution_profile::PROFILE_RESOURCE);
    if !profile_path.is_file() {
        return Ok(0);
    }
    let profile: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&profile_path).map_err(|error| {
            NotaError::other(format!(
                "Could not read distribution profile {}: {error}",
                profile_path.display()
            ))
        })?)
        .map_err(|error| NotaError::other(format!("Distribution profile is invalid: {error}")))?;
    let id = profile
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or(crate::distribution_profile::ID);
    let marker = crate::paths::config_dir()?.join(format!(".distribution-extensions-{id}.done"));
    if marker.is_file() {
        return Ok(0);
    }
    let packages = profile
        .pointer("/extensions/bundled")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    if packages.is_empty() {
        return Ok(0);
    }
    let enabled: std::collections::BTreeSet<String> = profile
        .pointer("/extensions/enabledByDefault")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .map(str::to_owned)
        .collect();
    let mut installed = 0usize;
    for item in packages {
        let relative = item
            .get("package")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| NotaError::other("Bundled extension entry has no package path"))?;
        let package = resource_dir.join("distribution").join(relative);
        let plugin_id = host.install_2(&package)?;
        if !enabled.contains(&plugin_id) {
            host.set_enabled(&plugin_id, false)?;
        }
        installed += 1;
    }
    if let Some(parent) = marker.parent() {
        crate::paths::ensure_dir(parent)?;
    }
    fs::write(&marker, format!("distribution={id}\n")).map_err(|error| {
        NotaError::other(format!(
            "Could not write bundled extension marker {}: {error}",
            marker.display()
        ))
    })?;
    Ok(installed)
}

pub fn apply_extension_defaults(host: &mut PluginHost, resource_dir: &Path) -> Result<usize> {
    let profile_path = resource_dir.join(crate::distribution_profile::PROFILE_RESOURCE);
    if !profile_path.is_file() {
        return Ok(0);
    }
    let profile: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&profile_path).map_err(|error| {
            NotaError::other(format!(
                "Could not read distribution profile {}: {error}",
                profile_path.display()
            ))
        })?)
        .map_err(|error| NotaError::other(format!("Distribution profile is invalid: {error}")))?;
    let id = profile
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or(crate::distribution_profile::ID);
    let config = crate::paths::config_dir()?;
    let state_file = config.join("plugins.toml");
    let marker = config.join(format!(".distribution-extension-defaults-{id}.done"));
    if marker.is_file() || state_file.is_file() {
        return Ok(0);
    }
    let ids = profile
        .pointer("/extensions/enabledByDefault")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Ok(0);
    }
    for extension_id in &ids {
        host.set_enabled(extension_id, true)?;
    }
    crate::paths::ensure_dir(&config)?;
    fs::write(&marker, format!("distribution={id}\n")).map_err(|error| {
        NotaError::other(format!(
            "Could not write extension-defaults marker {}: {error}",
            marker.display()
        ))
    })?;
    Ok(ids.len())
}
