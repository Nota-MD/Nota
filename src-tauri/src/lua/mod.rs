pub mod api;

use std::path::Path;
use std::sync::{Arc, Mutex};

use mlua::{Lua, Table};

use crate::document::DocumentStore;
use crate::error::{NotaError, Result};
use crate::plugin::manifest::Manifest;
use crate::settings::Settings;
use crate::table_bridge::TableBridge;

#[derive(Clone)]
pub struct HostContext {
    pub app: tauri::AppHandle,
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,

    pub table_bridge: Arc<Mutex<TableBridge>>,

    pub ai_context: Arc<Mutex<crate::lua::api::ai::ContextRegistry>>,

    pub workspace: Arc<Mutex<Option<std::path::PathBuf>>>,

    pub plugin_id: String,

    pub application_language: String,
}

const MAIN_SIDE_SUFFIX_BLOCK_REPLACE_STORE: &str = "nota_require_cache";
const MAIN_SIDE_AT_IMAGE: &str = "nota_require_loading";

fn install_require(lua: &Lua, root_2: &Path) -> Result<()> {
    lua.set_named_registry_value(
        MAIN_SIDE_SUFFIX_BLOCK_REPLACE_STORE,
        lua.create_table().map_err(mlua_err)?,
    )
    .map_err(mlua_err)?;
    lua.set_named_registry_value(MAIN_SIDE_AT_IMAGE, lua.create_table().map_err(mlua_err)?)
        .map_err(mlua_err)?;

    let root_2 = root_2.to_path_buf();
    let f = lua
        .create_function(move |lua, name: String| {
            let name = name.trim().to_string();


            if name.is_empty()
                || !name.chars().all(|c| c.is_ascii_alphanumeric() || "_.-/".contains(c))
                || name.starts_with('/')
                || name.contains("..")
            {
                return Err(mlua::Error::RuntimeError(format!(
                    "Invalid require name `{name}`; use ASCII letters, digits, `_`, `.`, `-`, and `/`, without `..`"
                )));
            }

            let replace_store: Table = lua.named_registry_value(MAIN_SIDE_SUFFIX_BLOCK_REPLACE_STORE)?;
            let at_image: Table = lua.named_registry_value(MAIN_SIDE_AT_IMAGE)?;

            let old: mlua::Value = replace_store.get(name.as_str())?;
            if !old.is_nil() {
                return Ok(old);
            }


            if at_image.get::<bool>(name.as_str()).unwrap_or(false) {
                return Err(mlua::Error::RuntimeError(format!(
                    "Circular require: `{name}` required itself during evaluation"
                )));
            }

            let module_path = name.replace('.', "/");


            let mut module_error = String::new();
            for candidate in [format!("{module_path}.lua"), format!("{module_path}/init.lua")] {


                let path = match crate::lua::api::fs::resolve_in(&root_2, &candidate) {
                    Ok(p) => p,
                    Err(e) => {
                        module_error = e.to_string();
                        continue;
                    }
                };
                if !path.is_file() {
                    continue;
                }
                let code = std::fs::read_to_string(&path).map_err(|source| {
                    mlua::Error::RuntimeError(format!("Could not read `{}`: {source}", path.display()))
                })?;

                at_image.set(name.as_str(), true)?;


                let result_3 = lua
                    .load(&code)
                    .set_name(path.to_string_lossy().as_ref())
                    .eval::<mlua::Value>();


                at_image.set(name.as_str(), mlua::Value::Nil)?;
                let value_2 = result_3?;




                let store = if value_2.is_nil() {
                    mlua::Value::Boolean(true)
                } else {
                    value_2.clone()
                };
                replace_store.set(name.as_str(), store)?;
                return Ok(value_2);
            }

            Err(mlua::Error::RuntimeError(format!(
                "Module `{name}` was not found as `{module_path}.lua` or `{module_path}/init.lua` inside the extension directory. {module_error}"
            )))
        })
        .map_err(mlua_err)?;

    lua.globals().set("require", f).map_err(mlua_err)
}

fn mlua_err(e: mlua::Error) -> NotaError {
    NotaError::other(format!(
        "Could not install the extension module system: {e}"
    ))
}

fn plugin_table_ready_store() -> mlua::StdLib {
    mlua::StdLib::COROUTINE
        | mlua::StdLib::TABLE
        | mlua::StdLib::STRING
        | mlua::StdLib::UTF8
        | mlua::StdLib::MATH
}

const MUST_REQUIRED_POSITION_EMPTY_FULL_SENTENCE: [&str; 7] = [
    "io", "os", "package", "require", "dofile", "loadfile", "debug",
];

fn should_render_lua() -> Result<Lua> {
    should_render_lua_active_error().map_err(NotaError::other)
}

fn should_render_lua_active_error() -> std::result::Result<Lua, String> {
    let lua = Lua::new_with(plugin_table_ready_store(), mlua::LuaOptions::default())
        .map_err(|e| format!("Could not create the Lua state: {e}"))?;

    let globals = lua.globals();
    for name in MUST_REQUIRED_POSITION_EMPTY_FULL_SENTENCE {
        globals
            .set(name, mlua::Value::Nil)
            .map_err(|e| format!("Could not remove global `{name}`: {e}"))?;
    }

    Ok(lua)
}

pub struct LuaPlugin {
    pub manifest: Manifest,
    pub lua: Lua,
    pub state: PluginState,

    pub language_2: crate::lua::api::i18n::LanguagePack,

    has_unload: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    Loaded,

    Failed(String),

    Disabled,
}

impl LuaPlugin {
    pub fn load(manifest: Manifest, ctx: HostContext) -> Self {
        let language_2 = crate::lua::api::i18n::install_2(&manifest, &ctx.application_language);

        let lua = match should_render_lua() {
            Ok(lua) => lua,

            Err(e) => {
                return Self {
                    manifest,
                    lua: Lua::new(),
                    language_2,
                    state: PluginState::Failed(format!(
                        "{e} (the sandbox could not be created, so the extension was not loaded)"
                    )),
                    has_unload: false,
                }
            }
        };

        if let Err(e) = Self::install(&lua, &manifest, &ctx, &language_2) {
            if let Ok(mut context) = ctx.ai_context.lock() {
                context.remove(&ctx.plugin_id);
            }
            return Self {
                manifest,
                lua,
                language_2,
                state: PluginState::Failed(e.to_string()),
                has_unload: false,
            };
        }

        let entry = manifest.entry_path();
        match Self::run_entry(&lua, &entry) {
            Ok(has_unload) => Self {
                manifest,
                lua,
                language_2,
                state: PluginState::Loaded,
                has_unload,
            },
            Err(e) => {
                if let Ok(mut context) = ctx.ai_context.lock() {
                    context.remove(&ctx.plugin_id);
                }
                Self {
                    manifest,
                    lua,
                    language_2,
                    state: PluginState::Failed(e.to_string()),
                    has_unload: false,
                }
            }
        }
    }

    pub fn rejected(manifest: Manifest, reason: String, application_language: &str) -> Self {
        let language_2 = crate::lua::api::i18n::install_2(&manifest, application_language);
        Self {
            manifest,
            lua: should_render_lua().unwrap_or_else(|_| Lua::new()),
            language_2,
            state: PluginState::Failed(reason),
            has_unload: false,
        }
    }

    pub fn disabled(manifest: Manifest, application_language: &str) -> Self {
        let language_2 = crate::lua::api::i18n::install_2(&manifest, application_language);
        Self {
            manifest,
            lua: should_render_lua().unwrap_or_else(|_| Lua::new()),
            language_2,
            state: PluginState::Disabled,
            has_unload: false,
        }
    }

    fn install(
        lua: &Lua,
        manifest: &Manifest,
        ctx: &HostContext,
        language_2: &crate::lua::api::i18n::LanguagePack,
    ) -> Result<()> {
        let nota = api::build(lua, manifest, ctx, language_2)?;
        lua.globals()
            .set("nota", nota)
            .map_err(|e| NotaError::Lua {
                plugin: manifest.meta.id.clone(),
                message: e.to_string(),
            })?;
        install_require(lua, &manifest.dir)
    }

    fn run_entry(lua: &Lua, entry: &Path) -> Result<bool> {
        if !entry.is_file() {
            return Err(NotaError::other(format!(
                "Entry script not found: {}",
                entry.display()
            )));
        }

        let code = std::fs::read_to_string(entry).map_err(|source| NotaError::Read {
            path: entry.to_path_buf(),
            source,
        })?;

        let chunk = lua.load(&code).set_name(entry.to_string_lossy().as_ref());

        let module: mlua::Value = chunk.eval().map_err(|e| NotaError::Lua {
            plugin: entry.display().to_string(),
            message: e.to_string(),
        })?;

        let mut has_unload = false;
        if let mlua::Value::Table(t) = module {
            has_unload = matches!(
                t.get::<mlua::Value>("on_unload"),
                Ok(mlua::Value::Function(_))
            );

            lua.set_named_registry_value("nota_module", t.clone())
                .map_err(|e| NotaError::Lua {
                    plugin: entry.display().to_string(),
                    message: e.to_string(),
                })?;

            if let Ok(mlua::Value::Function(f)) = t.get::<mlua::Value>("on_load") {
                let nota: Table = lua.globals().get("nota").map_err(|e| NotaError::Lua {
                    plugin: entry.display().to_string(),
                    message: e.to_string(),
                })?;
                f.call::<()>(nota).map_err(|e| NotaError::Lua {
                    plugin: entry.display().to_string(),
                    message: e.to_string(),
                })?;
            }
        }

        Ok(has_unload)
    }

    pub fn unload(&self) {
        if !self.has_unload {
            return;
        }
        let Ok(mlua::Value::Table(t)) = self.lua.named_registry_value::<mlua::Value>("nota_module")
        else {
            return;
        };
        if let Ok(mlua::Value::Function(f)) = t.get::<mlua::Value>("on_unload") {
            if let Err(e) = f.call::<()>(()) {
                crate::debug_log!(
                    "[nota] plugin {} on_unload failed: {e}",
                    self.manifest.meta.id
                );
            }
        }
    }

    pub fn is_loaded(&self) -> bool {
        self.state == PluginState::Loaded
    }

    pub fn call_command(&self, name: &str, args: mlua::Value) -> Result<mlua::Value> {
        let commands: Table = self
            .lua
            .named_registry_value("nota_commands")
            .map_err(|e| NotaError::Lua {
                plugin: self.manifest.meta.id.clone(),
                message: format!("Could not read the command table: {e}"),
            })?;

        let f: mlua::Function = commands.get(name).map_err(|_| {
            NotaError::other(format!(
                "Extension {} did not register command `{name}`",
                self.manifest.meta.id
            ))
        })?;

        f.call::<mlua::Value>(args).map_err(|e| NotaError::Lua {
            plugin: self.manifest.meta.id.clone(),
            message: e.to_string(),
        })
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod require_tests;
