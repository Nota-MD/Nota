use mlua::{Lua, Table};
use std::collections::BTreeMap;

use crate::error::{NotaError, Result};
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};

pub const MAX_CONTEXT_BYTES: usize = 20_000;
pub const MAX_TOTAL_BYTES: usize = 80_000;

#[derive(Default)]
pub struct ContextRegistry {
    entries: BTreeMap<String, String>,
}

impl ContextRegistry {
    pub fn add(&mut self, plugin_id: &str, text: &str) -> std::result::Result<(), String> {
        let text = text.trim();
        if text.is_empty() {
            self.entries.remove(plugin_id);
            return Ok(());
        }
        if text.len() > MAX_CONTEXT_BYTES {
            return Err(format!(
                "AI context exceeds the {MAX_CONTEXT_BYTES} byte per-extension limit"
            ));
        }
        let retained = self
            .entries
            .iter()
            .filter(|(id, _)| id.as_str() != plugin_id)
            .map(|(_, value)| value.len())
            .sum::<usize>();
        if retained + text.len() > MAX_TOTAL_BYTES {
            return Err(format!(
                "AI context exceeds the {MAX_TOTAL_BYTES} byte total limit"
            ));
        }
        self.entries.insert(plugin_id.to_owned(), text.to_owned());
        Ok(())
    }

    pub fn remove(&mut self, plugin_id: &str) -> Option<String> {
        self.entries.remove(plugin_id)
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn read(&self) -> Vec<(String, String)> {
        self.entries
            .iter()
            .map(|(plugin, text)| (plugin.clone(), text.clone()))
            .collect()
    }
}

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table> {
    let table = lua.create_table().map_err(mlua_to_nota)?;
    let can_read = manifest.has(Capability::AiContextRead);
    let can_write = manifest.has(Capability::AiContextWrite);

    if can_read {
        let registry = ctx.ai_context.clone();
        let read = lua
            .create_function(move |lua, ()| {
                let entries = registry
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("AI context lock is poisoned".into()))?
                    .read();
                let list = lua.create_table()?;
                for (index, (plugin, text)) in entries.into_iter().enumerate() {
                    let item = lua.create_table()?;
                    item.set("plugin", plugin)?;
                    item.set("text", text)?;
                    list.raw_set(index + 1, item)?;
                }
                Ok(list)
            })
            .map_err(mlua_to_nota)?;
        table.set("format_context", read).map_err(mlua_to_nota)?;
    }

    if can_write {
        let registry = ctx.ai_context.clone();
        let plugin_id = ctx.plugin_id.clone();
        let add = lua
            .create_function(move |_, text: String| {
                registry
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("AI context lock is poisoned".into()))?
                    .add(&plugin_id, &text)
                    .map_err(mlua::Error::RuntimeError)
            })
            .map_err(mlua_to_nota)?;
        table.set("add_format_context", add).map_err(mlua_to_nota)?;

        let registry = ctx.ai_context.clone();
        let plugin_id = ctx.plugin_id.clone();
        let clear = lua
            .create_function(move |_, ()| {
                registry
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("AI context lock is poisoned".into()))?
                    .remove(&plugin_id);
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        table
            .set("clear_format_context", clear)
            .map_err(mlua_to_nota)?;
    }

    Ok(table)
}

fn mlua_to_nota(error: mlua::Error) -> NotaError {
    NotaError::other(format!("Lua: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_is_namespaced_replaced_and_sorted() {
        let mut registry = ContextRegistry::default();
        registry.add("z.plugin", "last").unwrap();
        registry.add("a.plugin", "first").unwrap();
        registry.add("a.plugin", "replacement").unwrap();
        assert_eq!(
            registry.read(),
            vec![
                ("a.plugin".to_owned(), "replacement".to_owned()),
                ("z.plugin".to_owned(), "last".to_owned()),
            ]
        );
    }

    #[test]
    fn empty_context_removes_only_that_plugin() {
        let mut registry = ContextRegistry::default();
        registry.add("a", "one").unwrap();
        registry.add("b", "two").unwrap();
        registry.add("a", " ").unwrap();
        assert_eq!(registry.read(), vec![("b".to_owned(), "two".to_owned())]);
    }

    #[test]
    fn context_limits_are_enforced() {
        let mut registry = ContextRegistry::default();
        assert!(registry
            .add("large", &"x".repeat(MAX_CONTEXT_BYTES + 1))
            .is_err());
        registry.add("one", &"x".repeat(MAX_CONTEXT_BYTES)).unwrap();
        registry.add("two", &"x".repeat(MAX_CONTEXT_BYTES)).unwrap();
        registry
            .add("three", &"x".repeat(MAX_CONTEXT_BYTES))
            .unwrap();
        registry
            .add("four", &"x".repeat(MAX_CONTEXT_BYTES))
            .unwrap();
        assert!(registry
            .add("five", &"x".repeat(MAX_CONTEXT_BYTES))
            .is_err());
    }
}
