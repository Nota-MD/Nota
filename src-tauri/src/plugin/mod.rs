pub mod export;
pub mod installed;

mod install;
pub mod manifest;
pub mod package;
pub mod setting_locks;
pub mod settings_decl;

pub mod updater;

pub mod watch;

pub mod trust;

pub mod types;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use mlua::Lua;
use serde::Serialize;

use tauri::Manager;

use crate::error::{NotaError, Result};
use crate::lua::api::i18n::LanguagePack;
use crate::lua::{HostContext, LuaPlugin, PluginState};
use install::at_use_call_directory_inner;
use installed::{InstallSource, Installed, Signature};
use manifest::{find_manifests, Capability, Manifest, NOTA_PLUGIN_API_VERSION};

pub use types::*;

pub const REG_PANELS: &str = "nota_panels";
pub const REG_MENUS: &str = "nota_menus";

pub const EVENT_PANEL_DIRTY: &str = "nota:plugin-panel";

pub const EVENT_REVIEW: &str = "nota:plugin-review";

pub const EVENT_PLUGIN_RELOADED: &str = "nota:plugin-reloaded";

pub const EVENT_PANEL_FOCUS: &str = "nota:plugin-panel-focus";

pub const EVENT_PANEL_STREAM: &str = "nota:plugin-stream";

pub struct DeferredDiscovery {
    pending: Mutex<Option<(Option<PathBuf>, HostContext)>>,
}

impl DeferredDiscovery {
    pub fn new(resource_dir: Option<PathBuf>, base: HostContext) -> Self {
        Self {
            pending: Mutex::new(Some((resource_dir, base))),
        }
    }

    pub fn start(&self, app: &tauri::AppHandle) {
        let Some((resource_dir, base)) = self.pending.lock().ok().and_then(|mut slot| slot.take())
        else {
            return;
        };
        let plugin_thread_success = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(std::time::Duration::from_millis(350));
            let loaded = PluginHost::discover(resource_dir, &base);
            crate::debug_log!("[nota] loaded {} plugins", loaded.count());
            let state = plugin_thread_success.state::<crate::state::AppState>();
            if let Ok(mut slot) = state.plugins.lock() {
                *slot = loaded;
            };
            let enabled = plugin_thread_success
                .state::<crate::state::AppState>()
                .settings
                .lock()
                .map(|settings| settings.general.debug_mode && settings.general.lua_hot_reload)
                .unwrap_or(false);
            plugin_thread_success
                .state::<watch::PluginWatch>()
                .set_enabled(&plugin_thread_success, enabled);
        });
    }
}

pub struct PluginHost {
    plugins: Vec<LuaPlugin>,

    installed: Installed,

    base: HostContext,

    ready: bool,

    extensions_enabled: bool,
}

impl PluginHost {
    pub fn empty(base: &HostContext) -> Self {
        Self {
            plugins: Vec::new(),
            installed: Installed::load(),
            base: base.clone(),
            ready: false,
            extensions_enabled: extensions_enabled_from(base),
        }
    }

    pub fn is_ready(&self) -> bool {
        self.ready
    }

    pub fn discover(resource_dir: Option<PathBuf>, base: &HostContext) -> Self {
        let installed = Installed::load();
        let extensions_enabled = extensions_enabled_from(base);
        let mut seen: HashSet<String> = HashSet::new();

        let mut channels: HashMap<String, String> = HashMap::new();
        let mut plugins: Vec<LuaPlugin> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        let mut roots = vec![(crate::paths::user_plugins_dir().unwrap_or_default(), true)];
        roots.extend(
            crate::paths::builtin_plugins_dirs(resource_dir.as_deref())
                .into_iter()
                .map(|root| (root, false)),
        );

        for (root, removable) in roots {
            if !root.is_dir() {
                continue;
            }
            for manifest_path in find_manifests(&root) {
                let manifest = match Manifest::load(&manifest_path) {
                    Ok(m) => m,
                    Err(NotaError::PluginApiMismatch { id, wanted, have }) => {
                        match Manifest::load_unchecked(&manifest_path) {
                            Ok(manifest) => {
                                let reason = format!(
                                "extension {id} requires API {wanted}; this host supports {have}"
                            );
                                errors.push(format!("{}\u{ff1a}{reason}", manifest_path.display()));
                                if seen.insert(manifest.meta.id.clone()) {
                                    plugins.push(LuaPlugin::rejected(
                                        manifest,
                                        reason,
                                        &base.application_language,
                                    ));
                                }
                                continue;
                            }
                            Err(error) => {
                                errors.push(format!("{}\u{ff1a}{error}", manifest_path.display()));
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        errors.push(format!("{}\u{ff1a}{e}", manifest_path.display()));
                        continue;
                    }
                };

                if !seen.insert(manifest.meta.id.clone()) {
                    continue;
                }
                if !removable && installed.is_removed(&manifest.meta.id) {
                    continue;
                }

                let channel = manifest::channel_id(&manifest.meta.id);
                if let Some(holder) = channels.insert(channel.clone(), manifest.meta.id.clone()) {
                    let reason = format!(
                        "Event channel `plugin:{channel}:...` is already used by `{holder}`; choose another extension ID"
                    );
                    errors.push(format!("{}\u{ff1a}{reason}", manifest.meta.id));
                    plugins.push(LuaPlugin::rejected(
                        manifest,
                        reason,
                        &base.application_language,
                    ));
                    continue;
                }

                let ctx = HostContext {
                    plugin_id: manifest.meta.id.clone(),
                    ..base.clone()
                };

                let plugin_2 = if extensions_enabled && installed.is_enabled(&manifest.meta.id) {
                    LuaPlugin::load(manifest, ctx)
                } else {
                    LuaPlugin::disabled(manifest, &base.application_language)
                };
                plugins.push(plugin_2);
            }
        }

        for e in errors {
            crate::debug_log!("[nota] plugin manifest unreadable: {e}");
        }

        plugins.sort_by(|a, b| a.manifest.meta.id.cmp(&b.manifest.meta.id));
        for plugin in &plugins {
            match &plugin.state {
                crate::lua::PluginState::Loaded => {
                    crate::debug_log!("[nota] plugin loaded: {}", plugin.manifest.meta.id);
                }
                crate::lua::PluginState::Disabled => {
                    crate::debug_log!("[nota] plugin disabled: {}", plugin.manifest.meta.id);
                }
                crate::lua::PluginState::Failed(reason) => {
                    crate::debug_log!(
                        "[nota] plugin failed: {}: {reason}",
                        plugin.manifest.meta.id
                    );
                }
            }
        }

        let mut host = Self {
            plugins,
            installed,
            base: base.clone(),
            ready: true,
            extensions_enabled,
        };

        let latest = extensions_enabled_from(base);
        if latest != host.extensions_enabled() {
            host.set_extensions_enabled(latest);
        }
        if let Err(error) = host.apply_setting_locks() {
            if std::env::var_os("NOTA_DEBUG").is_some() {
                eprintln!("[nota] could not apply extension setting locks: {error}");
            }
        }
        host
    }

    pub fn list_info(&self) -> Vec<PluginInfo> {
        self.plugins
            .iter()
            .map(|p| {
                let m = &p.manifest.meta;
                let record = self.installed.record(&m.id);
                let (state, error) = match (&p.state, self.is_enabled(&m.id)) {
                    (_, false) => ("disabled", None),
                    (PluginState::Loaded, _) => ("loaded", None),
                    (PluginState::Disabled, _) => ("disabled", None),
                    (PluginState::Failed(e), _) => ("failed", Some(e.clone())),
                };

                PluginInfo {
                    id: m.id.clone(),

                    name: p.language_2.name_2().unwrap_or(&m.name).to_owned(),
                    version: m.version.clone(),
                    api: m.api.to_string(),
                    host_api: NOTA_PLUGIN_API_VERSION.to_string(),
                    api_supported: NOTA_PLUGIN_API_VERSION.supports(m.api),

                    description: p
                        .language_2
                        .description_data()
                        .unwrap_or(&m.description)
                        .to_owned(),
                    authors: m.authors.clone(),
                    license: m.license.clone(),
                    capabilities: m.capabilities.clone(),
                    entry: m.entry.clone(),
                    dir: p.manifest.dir.display().to_string(),
                    state: state.to_owned(),
                    error,
                    langs: m.langs.clone(),
                    language: p.language_2.language.clone(),
                    language_ok: p.language_2.ok,
                    origin: if at_use_call_directory_inner(&p.manifest.dir) {
                        "user"
                    } else {
                        "builtin"
                    }
                    .to_owned(),
                    signature: record.and_then(|r| r.signature).map(|s| {
                        match s {
                            Signature::Verified => "verified",
                            Signature::Unknown => "unknown",
                            Signature::Unsigned => "unsigned",
                        }
                        .to_owned()
                    }),
                    key_id: record.and_then(|r| r.key_id.clone()),
                    removable: true,

                    settings: settings(&p.manifest, &p.language_2),
                    setting_locks: p
                        .manifest
                        .setting_locks
                        .iter()
                        .map(|lock| lock.setting.clone())
                        .collect(),
                }
            })
            .collect()
    }

    pub fn get(&self, id: &str) -> Option<&LuaPlugin> {
        self.plugins.iter().find(|p| p.manifest.meta.id == id)
    }

    fn position_only(&self, id: &str) -> Option<usize> {
        self.plugins.iter().position(|p| p.manifest.meta.id == id)
    }

    fn upper_lower_text(&self, id: &str) -> HostContext {
        HostContext {
            plugin_id: id.to_owned(),
            ..self.base.clone()
        }
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        self.extensions_enabled && self.installed.is_enabled(id)
    }

    pub fn is_active(&self, id: &str) -> bool {
        self.get(id)
            .is_some_and(|plugin| plugin.is_loaded() && self.is_enabled(id))
    }

    pub fn reload_dir(&mut self, dir: &Path) -> Result<Option<String>> {
        let Some(i) = self.plugins.iter().position(|p| p.manifest.dir == dir) else {
            return Ok(None);
        };
        let id = self.plugins[i].manifest.meta.id.clone();
        let manifest = Manifest::load(&dir.join(package::MANIFEST_FILE))?;
        if manifest.meta.id != id {
            return Err(NotaError::other(format!(
                "plugin directory {} changed id from {id} to {}; hot reload does not change identity",
                dir.display(),
                manifest.meta.id
            )));
        }

        let enabled = self.extensions_enabled && self.installed.is_enabled(&id);
        let replacement = if enabled {
            LuaPlugin::load(manifest, self.upper_lower_text(&id))
        } else {
            LuaPlugin::disabled(manifest, &self.base.application_language)
        };
        if let PluginState::Failed(reason) = &replacement.state {
            return Err(NotaError::other(format!(
                "extension {id} failed to hot reload; keeping the previous version: {reason}"
            )));
        }

        let old = std::mem::replace(&mut self.plugins[i], replacement);
        if old.state == PluginState::Loaded {
            old.unload();
        }
        self.receive_probe(&id);
        if let Err(error) = self.apply_setting_locks() {
            if std::env::var_os("NOTA_DEBUG").is_some() {
                eprintln!("[nota] could not reapply setting locks after reload: {error}");
            }
        }
        crate::debug_log!("[nota] plugin hot reloaded: {id}");
        Ok(Some(id))
    }

    pub fn extensions_enabled(&self) -> bool {
        self.extensions_enabled
    }

    pub fn set_extensions_enabled(&mut self, enabled: bool) {
        if self.extensions_enabled == enabled {
            return;
        }
        self.extensions_enabled = enabled;
        let mut changed = 0usize;

        for i in 0..self.plugins.len() {
            let id = self.plugins[i].manifest.meta.id.clone();
            if enabled {
                if self.installed.is_enabled(&id) && self.plugins[i].state != PluginState::Loaded {
                    let manifest = self.plugins[i].manifest.clone();
                    let ctx = self.upper_lower_text(&id);
                    self.plugins[i] = LuaPlugin::load(manifest, ctx);
                    changed += 1;
                }
            } else {
                if self.plugins[i].state == PluginState::Loaded {
                    self.plugins[i].unload();
                    changed += 1;
                }
                self.receive_probe(&id);
                let manifest = self.plugins[i].manifest.clone();
                self.plugins[i] = LuaPlugin::disabled(manifest, &self.base.application_language);
            }
        }
        crate::debug_log!(
            "[nota] extensions {}: {} plugin states changed",
            if enabled { "enabled" } else { "disabled" },
            changed
        );
        if let Err(error) = self.apply_setting_locks() {
            if std::env::var_os("NOTA_DEBUG").is_some() {
                eprintln!("[nota] could not apply setting locks: {error}");
            }
        }
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<()> {
        if !self.extensions_enabled {
            return Err(NotaError::other(
                "Extensions are disabled in General settings; enable them before changing individual extensions",
            ));
        }
        let i = self
            .position_only(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;

        if enabled {
            self.installed.set_enabled(id, true)?;

            if self.plugins[i].state != PluginState::Loaded {
                let manifest = self.plugins[i].manifest.clone();
                let ctx = self.upper_lower_text(id);
                self.plugins[i] = LuaPlugin::load(manifest, ctx);
            }
        } else {
            self.installed.set_enabled(id, false)?;
            if self.plugins[i].state == PluginState::Loaded {
                self.plugins[i].unload();
            }
            self.receive_probe(id);
            let manifest = self.plugins[i].manifest.clone();
            self.plugins[i] = LuaPlugin::disabled(manifest, &self.base.application_language);
        }
        self.apply_setting_locks()?;
        Ok(())
    }

    fn receive_probe(&self, id: &str) {
        crate::devserver::stop(
            &self.base.app.state::<crate::devserver::DevServerState>(),
            id,
        );

        {
            use tauri::Emitter;
            let review = self.base.app.state::<ReviewState>();
            review.set(id, None);
            let _ = self.base.app.emit(EVENT_REVIEW, serde_json::json!({}));
        }
    }

    fn can_drop_use(&self, plugin_id: &str) -> Result<&LuaPlugin> {
        let plugin = self
            .get(plugin_id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {plugin_id}")))?;

        match &plugin.state {
            _ if !self.is_enabled(plugin_id) => Err(NotaError::other(format!(
                "Extension {plugin_id} is disabled"
            ))),
            PluginState::Loaded => Ok(plugin),
            PluginState::Failed(e) => Err(NotaError::other(format!(
                "Extension {plugin_id} failed to load and cannot run the command: {e}"
            ))),
            PluginState::Disabled => Err(NotaError::other(format!(
                "Extension {plugin_id} is disabled"
            ))),
        }
    }

    pub fn call_command(
        &self,
        plugin_id: &str,
        command: &str,
        args: mlua::Value,
    ) -> Result<mlua::Value> {
        self.can_drop_use(plugin_id)?.call_command(command, args)
    }

    pub fn panel_content(&self, plugin_id: &str, panel_id: &str) -> Result<serde_json::Value> {
        let plugin = self.can_drop_use(plugin_id)?;
        crate::lua::api::ui::surface_half_content(&plugin.lua, plugin_id, panel_id)
    }

    fn generate_small(&self) -> impl Iterator<Item = &LuaPlugin> {
        self.plugins
            .iter()
            .filter(|p| p.is_loaded() && self.is_enabled(&p.manifest.meta.id))
    }

    pub fn find_command_owner(&self, command: &str) -> Option<&str> {
        self.generate_small()
            .find(|p| {
                p.lua
                    .named_registry_value::<mlua::Table>("nota_commands")
                    .map(|t| t.contains_key(command).unwrap_or(false))
                    .unwrap_or(false)
            })
            .map(|p| p.manifest.meta.id.as_str())
    }

    pub fn panels(&self) -> Vec<PluginPanel> {
        self.generate_small()
            .flat_map(|p| read_surface_half(&p.lua, &p.manifest.meta.id))
            .collect()
    }

    pub fn live_panels(&self) -> Vec<(String, String)> {
        self.generate_small()
            .flat_map(|p| {
                let id = p.manifest.meta.id.clone();
                read_surface_half(&p.lua, &id)
                    .into_iter()
                    .filter(|panel| panel.live)
                    .map(|panel| (id.clone(), panel.id))
                    .collect::<Vec<_>>()
            })
            .collect()
    }

    pub fn menus(&self) -> Vec<PluginMenuItem> {
        self.generate_small()
            .flat_map(|p| read_extract_single(&p.lua, &p.manifest.meta.id))
            .collect()
    }

    pub fn count(&self) -> usize {
        self.plugins.len()
    }

    pub fn notify_table_snapshot(&self, snapshot: &crate::table_bridge::TableSnapshot) {
        for plugin in self.plugins.iter().filter(|plugin| {
            plugin.is_loaded()
                && self.is_enabled(&plugin.manifest.meta.id)
                && plugin.manifest.has(Capability::TableRead)
        }) {
            if let Err(error) = crate::lua::api::table::notify_snapshot(&plugin.lua, snapshot) {
                crate::lua::api::table::report_error(&plugin.manifest.meta.id, &error);
            }
        }
    }

    pub fn unload_all(&mut self) {
        for p in &self.plugins {
            p.unload();
        }
    }

    fn spell_to_passive_expand(&self, id: &str) -> Option<String> {
        let my = manifest::channel_id(id);
        self.plugins
            .iter()
            .find(|p| p.manifest.meta.id != id && manifest::channel_id(&p.manifest.meta.id) == my)
            .map(|p| p.manifest.meta.id.clone())
    }
}

fn extensions_enabled_from(base: &HostContext) -> bool {
    base.settings
        .lock()
        .map(|settings| settings.general.extensions_enabled)
        .unwrap_or(true)
}

fn settings(manifest: &Manifest, language_2: &LanguagePack) -> Vec<PluginSetting> {
    if manifest.settings.is_empty() {
        return Vec::new();
    }

    let file_inner = crate::lua::api::settings::read_full_not(&manifest.meta.id);

    manifest
        .settings
        .iter()
        .map(|s| {
            let value_2 = s.request_value(file_inner.get(&s.key));

            PluginSetting {
                key: s.key.clone(),
                kind: s.kind.clone(),

                label: value_3(language_2, &s.label),
                help: value_3(language_2, &s.help),
                min: s.min.unwrap_or(0.0),
                max: s.max.unwrap_or(0.0),
                step: s.step(),
                unit: s.unit.clone(),
                value: match value_2 {
                    crate::plugin::settings_decl::SettingsValue::Number(n) => n,
                    _ => 0.0,
                },
                text: match &value_2 {
                    crate::plugin::settings_decl::SettingsValue::Text(s) => s.clone(),
                    _ => String::new(),
                },
                on: matches!(
                    value_2,
                    crate::plugin::settings_decl::SettingsValue::Toggle(true)
                ),
                secret: s.secret,
                placeholder: value_3(language_2, &s.placeholder),
            }
        })
        .collect()
}

fn value_3(language_2: &LanguagePack, source_text: &str) -> String {
    if source_text.is_empty() {
        return String::new();
    }
    language_2
        .get_2(source_text)
        .unwrap_or(source_text)
        .to_owned()
}

pub(crate) fn read_surface_half(lua: &Lua, plugin_id: &str) -> Vec<PluginPanel> {
    declaration(lua, REG_PANELS)
        .into_iter()
        .map(|s| PluginPanel {
            plugin: plugin_id.to_owned(),
            id: s.get("id").unwrap_or_default(),
            title: s.get("title").unwrap_or_default(),
            icon: s.get("icon").ok(),

            location: s.get("location").unwrap_or_else(|_| "right".to_owned()),

            wide: s
                .get::<Option<bool>>("wide")
                .ok()
                .flatten()
                .unwrap_or(false),

            live: s
                .get::<Option<bool>>("live")
                .ok()
                .flatten()
                .unwrap_or(false),
        })
        .collect()
}

pub(crate) fn read_extract_single(lua: &Lua, plugin_id: &str) -> Vec<PluginMenuItem> {
    declaration(lua, REG_MENUS)
        .into_iter()
        .map(|s| PluginMenuItem {
            plugin: plugin_id.to_owned(),
            label: s.get("label").unwrap_or_default(),
            command: s.get("command").unwrap_or_default(),
            menu: s.get("menu").unwrap_or_else(|_| "plugins".to_owned()),
            accelerator: s.get("accelerator").ok(),

            prompt: s
                .get::<mlua::Table>("prompt")
                .ok()
                .and_then(|p| read_question_is(&p)),
        })
        .collect()
}

fn read_question_is(t: &mlua::Table) -> Option<PluginPrompt> {
    let arg: String = t.get("arg").ok()?;
    if arg.is_empty() {
        return None;
    }

    let second_arg = t.get::<String>("secondArg").unwrap_or_default();
    let second_label = t.get::<String>("secondLabel").unwrap_or_default();
    let two_all_give = !second_arg.is_empty() && !second_label.is_empty();
    Some(PluginPrompt {
        arg,
        label: t
            .get::<String>("label")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Enter".to_owned()),
        placeholder: t.get::<String>("placeholder").unwrap_or_default(),
        hint: t.get::<String>("hint").unwrap_or_default(),
        secret: t.get::<bool>("secret").unwrap_or(false),
        second_arg: if two_all_give {
            second_arg
        } else {
            String::new()
        },
        second_label: if two_all_give {
            second_label
        } else {
            String::new()
        },
        second_placeholder: if two_all_give {
            t.get::<String>("secondPlaceholder").unwrap_or_default()
        } else {
            String::new()
        },
    })
}

fn declaration(lua: &Lua, reg: &str) -> Vec<mlua::Table> {
    let Ok(list) = lua.named_registry_value::<mlua::Table>(reg) else {
        return Vec::new();
    };
    (1..=list.raw_len())
        .filter_map(|i| list.raw_get::<mlua::Table>(i).ok())
        .collect()
}
