//! `nota.table`: the narrow extension API for ordinary GFM tables.
//!
//! Extensions never receive DOM access. They receive an immutable snapshot,
//! can publish temporary display values, can request one undoable edit, and can
//! register context actions.

use std::collections::BTreeMap;

use mlua::{Lua, Table, Value};
use tauri::Emitter;

use super::mlua_to_nota;
use crate::error::NotaError;
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};
use crate::table_bridge::{
    parse_a1, TableAction, TableCellUpdate, TablePoint, TableRange, TableSnapshot,
};

pub const SNAPSHOT_CALLBACK_REGISTRY: &str = "nota_table_snapshot_callback";
pub const EVENT_TABLE_RENDER: &str = "nota:table-render";
pub const EVENT_TABLE_WRITE: &str = "nota:table-write";

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table, NotaError> {
    let table = lua.create_table().map_err(mlua_to_nota)?;

    if manifest.has(Capability::TableRead) {
        let bridge = ctx.table_bridge.clone();
        let snapshot = lua
            .create_function(move |lua, ()| -> mlua::Result<Value> {
                let current = bridge
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("table state lock poisoned".to_owned()))?
                    .snapshot();
                match current {
                    Some(current) => Ok(Value::Table(snapshot_to_lua(lua, &current)?)),
                    None => Ok(Value::Nil),
                }
            })
            .map_err(mlua_to_nota)?;
        table.set("snapshot", snapshot).map_err(mlua_to_nota)?;

        let callback = lua
            .create_function(move |lua, function: mlua::Function| {
                lua.set_named_registry_value(SNAPSHOT_CALLBACK_REGISTRY, function)?;
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        table.set("on_snapshot", callback).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::TableRender) {
        let app = ctx.app.clone();
        let plugin_id = ctx.plugin_id.clone();
        let bridge = ctx.table_bridge.clone();
        let render = lua
            .create_function(move |_lua, values: Table| {
                let mut cells = BTreeMap::new();
                for pair in values.pairs::<String, Value>() {
                    let (reference, value) = pair?;
                    let Some(point) = parse_a1(reference.trim()) else {
                        return Err(mlua::Error::RuntimeError(format!(
                            "invalid cell reference `{reference}`"
                        )));
                    };
                    if point.row >= 10_000 || point.column >= 1_000 {
                        return Err(mlua::Error::RuntimeError(
                            "cell reference exceeds the table API limit".to_owned(),
                        ));
                    }
                    cells.insert(reference.to_ascii_uppercase(), value_to_text(&value));
                }
                if cells.len() > 20_000 {
                    return Err(mlua::Error::RuntimeError(
                        "table render map exceeds 20000 cells".to_owned(),
                    ));
                }
                let render = bridge
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("table state lock poisoned".to_owned()))?
                    .render(&plugin_id, cells);
                let rendered = render.is_some();
                if let Some(render) = render {
                    app.emit(EVENT_TABLE_RENDER, render)
                        .map_err(|error| mlua::Error::RuntimeError(error.to_string()))?;
                }
                Ok(rendered)
            })
            .map_err(mlua_to_nota)?;
        table.set("render", render).map_err(mlua_to_nota)?;

        let bridge = ctx.table_bridge.clone();
        let has_extension_content = lua
            .create_function(move |_, ()| {
                Ok(bridge
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("table state lock poisoned".to_owned()))?
                    .has_extension_content())
            })
            .map_err(mlua_to_nota)?;
        table
            .set("has_extension_content", has_extension_content)
            .map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::TableWrite) {
        let app = ctx.app.clone();
        let plugin_id = ctx.plugin_id.clone();
        let bridge = ctx.table_bridge.clone();
        let replace_cells = lua
            .create_function(move |_, request: Table| {
                let cells: Table = request.get("cells").map_err(|_| {
                    mlua::Error::RuntimeError(
                        "nota.table.replace_cells expects { cells = { ... } }".to_owned(),
                    )
                })?;
                let mut updates = Vec::new();
                for item in cells.sequence_values::<Table>() {
                    let item = item?;
                    let point = if let Ok(reference) = item.get::<String>("ref") {
                        parse_a1(&reference).ok_or_else(|| {
                            mlua::Error::RuntimeError(format!(
                                "invalid cell reference `{reference}`"
                            ))
                        })?
                    } else {
                        let row = item.get::<usize>("row")?;
                        let column = item.get::<usize>("column")?;
                        TablePoint {
                            row: row.saturating_sub(1),
                            column: column.saturating_sub(1),
                        }
                    };
                    let text = item
                        .get::<Option<String>>("text")
                        .ok()
                        .flatten()
                        .or_else(|| {
                            item.get::<Value>("value")
                                .ok()
                                .map(|value| value_to_text(&value))
                        })
                        .ok_or_else(|| {
                            mlua::Error::RuntimeError(
                                "each table cell update needs `text` or `value`".to_owned(),
                            )
                        })?;
                    updates.push(TableCellUpdate {
                        row: point.row,
                        column: point.column,
                        text,
                    });
                }
                let request = bridge
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("table state lock poisoned".to_owned()))?
                    .write_request(&plugin_id, updates);
                if let Some(request) = request {
                    app.emit(EVENT_TABLE_WRITE, request)
                        .map_err(|error| mlua::Error::RuntimeError(error.to_string()))?;
                }
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        table
            .set("replace_cells", replace_cells)
            .map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::TableContextAction) {
        let bridge = ctx.table_bridge.clone();
        let plugin_id = ctx.plugin_id.clone();
        let register = lua
            .create_function(move |_, spec: Table| {
                let id = spec.get::<String>("id")?;
                let label = spec.get::<String>("label")?;
                let command = spec.get::<String>("command")?;
                if id.is_empty() || label.trim().is_empty() || command.is_empty() {
                    return Err(mlua::Error::RuntimeError(
                        "table action needs non-empty id, label and command".to_owned(),
                    ));
                }
                bridge
                    .lock()
                    .map_err(|_| mlua::Error::RuntimeError("table state lock poisoned".to_owned()))?
                    .register_action(TableAction {
                        plugin: plugin_id.clone(),
                        id,
                        label,
                        command,
                    });
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        table
            .set("register_action", register)
            .map_err(mlua_to_nota)?;
    }

    Ok(table)
}

pub fn snapshot_to_lua(lua: &Lua, snapshot: &TableSnapshot) -> mlua::Result<Table> {
    let root = lua.create_table()?;
    root.set("documentId", snapshot.document_id)?;
    root.set("tableId", snapshot.table_id.clone())?;

    let rows = lua.create_table()?;
    for (row_index, row) in snapshot.rows.iter().enumerate() {
        let lua_row = lua.create_table()?;
        for (column_index, value) in row.iter().enumerate() {
            lua_row.set(column_index + 1, value.clone())?;
        }
        rows.set(row_index + 1, lua_row)?;
    }
    root.set("rows", rows)?;

    root.set("selection", range_to_lua(lua, snapshot.selection)?)?;
    root.set("active", point_to_lua(lua, snapshot.active)?)?;
    Ok(root)
}

pub fn notify_snapshot(lua: &Lua, snapshot: &TableSnapshot) -> mlua::Result<()> {
    let callback: Value = lua.named_registry_value(SNAPSHOT_CALLBACK_REGISTRY)?;
    if let Value::Function(callback) = callback {
        callback.call::<()>(snapshot_to_lua(lua, snapshot)?)?;
    }
    Ok(())
}

fn point_to_lua(lua: &Lua, point: TablePoint) -> mlua::Result<Table> {
    let table = lua.create_table()?;
    table.set("row", point.row + 1)?;
    table.set("column", point.column + 1)?;
    table.set("ref", cell_reference(point.row, point.column))?;
    Ok(table)
}

fn range_to_lua(lua: &Lua, range: TableRange) -> mlua::Result<Table> {
    let table = lua.create_table()?;
    table.set("top", range.top + 1)?;
    table.set("left", range.left + 1)?;
    table.set("bottom", range.bottom + 1)?;
    table.set("right", range.right + 1)?;
    table.set("ref", range_reference(range))?;
    Ok(table)
}

fn value_to_text(value: &Value) -> String {
    match value {
        Value::Nil => String::new(),
        Value::Boolean(value) => {
            if *value {
                "TRUE".to_owned()
            } else {
                "FALSE".to_owned()
            }
        }
        Value::Integer(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.to_string_lossy().to_string(),
        _ => String::new(),
    }
}

fn cell_reference(row: usize, column: usize) -> String {
    let mut value = column + 1;
    let mut letters = Vec::new();
    while value > 0 {
        let digit = ((value - 1) % 26) as u8;
        letters.push((b'A' + digit) as char);
        value = (value - 1) / 26;
    }
    letters.reverse();
    format!("{}{}", letters.into_iter().collect::<String>(), row + 1)
}

fn range_reference(range: TableRange) -> String {
    let start = cell_reference(range.top, range.left);
    let end = cell_reference(range.bottom, range.right);
    if start == end {
        start
    } else {
        format!("{start}:{end}")
    }
}

pub fn report_error(plugin: &str, error: &mlua::Error) {
    if std::env::var_os("NOTA_DEBUG").is_some() {
        eprintln!("[nota:{plugin}] table snapshot callback failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_bridge::TableRange;
    use mlua::Lua;

    #[test]
    fn snapshot_uses_one_based_rows_and_cells() {
        let lua = Lua::new();
        let snapshot = TableSnapshot {
            document_id: 4,
            table_id: "t".into(),
            rows: vec![
                vec!["A1".into(), "B1".into()],
                vec!["A2".into(), "B2".into()],
            ],
            selection: TableRange {
                top: 1,
                left: 1,
                bottom: 1,
                right: 1,
            },
            active: TablePoint { row: 1, column: 1 },
        };
        let table = snapshot_to_lua(&lua, &snapshot).unwrap();
        let rows: Table = table.get("rows").unwrap();
        let first_row: Table = rows.get(1).unwrap();
        assert_eq!(first_row.get::<String>(1).unwrap(), "A1");
        let second_row: Table = rows.get(2).unwrap();
        assert_eq!(second_row.get::<String>(2).unwrap(), "B2");
        let selection: Table = table.get("selection").unwrap();
        assert_eq!(selection.get::<String>("ref").unwrap(), "B2");
    }
}
