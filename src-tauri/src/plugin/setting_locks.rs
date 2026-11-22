//! Extension-owned host settings.
//!
//! A lock records the user's previous value once, forces the declared value
//! while its owner is active, and restores that value after disable or removal.

use std::collections::BTreeMap;

use tauri::Emitter;

use crate::error::{NotaError, Result};
use crate::plugin::PluginHost;

impl PluginHost {
    pub fn locked_setting_values(&self) -> BTreeMap<String, bool> {
        let mut locked = BTreeMap::new();
        for plugin in self
            .plugins
            .iter()
            .filter(|plugin| plugin.is_loaded() && self.is_enabled(&plugin.manifest.meta.id))
        {
            for lock in &plugin.manifest.setting_locks {
                locked.entry(lock.setting.clone()).or_insert(lock.value);
            }
        }
        locked
    }

    pub(super) fn apply_setting_locks(&mut self) -> Result<()> {
        let active = self.locked_setting_values();
        let backups = self.installed.setting_backups();

        for (setting, _) in &active {
            if self.installed.backup_owner(setting).is_some() {
                continue;
            }
            let current = {
                let settings = self.base.settings.lock().unwrap();
                setting_value(&settings, setting)
            };
            let Some(current) = current else {
                continue;
            };
            let owner = self
                .plugins
                .iter()
                .filter(|plugin| plugin.is_loaded() && self.is_enabled(&plugin.manifest.meta.id))
                .find(|plugin| {
                    plugin
                        .manifest
                        .setting_locks
                        .iter()
                        .any(|lock| &lock.setting == setting)
                })
                .map(|plugin| plugin.manifest.meta.id.clone());
            if let Some(owner) = owner {
                self.installed
                    .remember_setting_backup(&owner, setting, current)?;
            }
        }

        let mut changed = false;
        {
            let mut settings = self.base.settings.lock().unwrap();
            let previous = settings.clone();
            for (setting, value) in &active {
                if setting_value(&settings, setting) == Some(*value) {
                    continue;
                }
                changed |= set_setting_value(&mut settings, setting, *value);
            }
            for (owner, setting, value) in &backups {
                if active.contains_key(setting) {
                    continue;
                }
                changed |= set_setting_value(&mut settings, setting, *value);
                if std::env::var_os("NOTA_DEBUG").is_some() {
                    eprintln!(
                        "[nota] restored setting {} to {} after extension {} stopped",
                        setting, value, owner
                    );
                }
            }
            if changed {
                if let Err(error) = settings.save() {
                    *settings = previous;
                    return Err(error);
                }
            }
        }

        for (owner, setting, _) in backups {
            if !active.contains_key(&setting) {
                self.installed.clear_setting_backup(&owner, &setting)?;
            }
        }
        if changed {
            self.broadcast_settings("broadcast locked settings")?;
        }
        Ok(())
    }

    pub(super) fn restore_setting_backups_for(&mut self, owner: &str) -> Result<()> {
        let backups: Vec<_> = self
            .installed
            .setting_backups()
            .into_iter()
            .filter(|(id, _, _)| id == owner)
            .collect();
        if backups.is_empty() {
            return Ok(());
        }

        let mut changed = false;
        {
            let mut settings = self.base.settings.lock().unwrap();
            let previous = settings.clone();
            for (_, setting, value) in &backups {
                changed |= set_setting_value(&mut settings, setting, *value);
            }
            if changed {
                if let Err(error) = settings.save() {
                    *settings = previous;
                    return Err(error);
                }
            }
        }
        for (id, setting, _) in backups {
            self.installed.clear_setting_backup(&id, &setting)?;
        }
        if changed {
            self.broadcast_settings("broadcast restored extension settings")?;
        }
        Ok(())
    }

    fn broadcast_settings(&self, context: &str) -> Result<()> {
        let snapshot = self.base.settings.lock().unwrap().clone();
        self.base
            .app
            .emit("nota:settings-changed", snapshot)
            .map_err(|error| NotaError::other(format!("{context}: {error}")))
    }
}

fn setting_value(settings: &crate::settings::Settings, setting: &str) -> Option<bool> {
    match setting {
        "editor.spreadsheet_tables" => Some(settings.editor.spreadsheet_tables),
        _ => None,
    }
}

fn set_setting_value(settings: &mut crate::settings::Settings, setting: &str, value: bool) -> bool {
    let target = match setting {
        "editor.spreadsheet_tables" => &mut settings.editor.spreadsheet_tables,
        _ => return false,
    };
    if *target == value {
        return false;
    }
    *target = value;
    true
}
