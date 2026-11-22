use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use mlua::{Lua, Table, Value};

use super::mlua_to_nota;
use crate::error::{NotaError, Result as NotaResult};
use crate::paths;

pub fn build(lua: &Lua, plugin_id: &str) -> NotaResult<Table> {
    let store_out = get_store_out(plugin_id)?;

    let t = lua.create_table().map_err(mlua_to_nota)?;

    let s = store_out.clone();
    let get = lua
        .create_function(move |lua, key: String| {
            let value_list = s.lock().map_err(lock_broken)?;
            match value_list.value_list.get(&key) {
                Some(v) => toml_convert_lua(lua, v),
                None => Ok(Value::Nil),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("get", get).map_err(mlua_to_nota)?;

    let s = store_out.clone();
    let set = lua
        .create_function(move |_, (key, value): (String, Value)| {
            check_and_method(&key)?;
            let toml_value = value_convert_toml(&value)?;

            let mut value_list = s.lock().map_err(lock_broken)?;
            match toml_value {
                Some(v) => {
                    value_list.value_list.insert(key, v);
                }

                None => {
                    if value_list.value_list.remove(&key).is_none() {
                        return Ok(());
                    }
                }
            }

            write_2(&value_list.path_3, &value_list.value_list).map_err(super::lua_err)
        })
        .map_err(mlua_to_nota)?;
    t.set("set", set).map_err(mlua_to_nota)?;

    let s = store_out.clone();
    let all = lua
        .create_function(move |lua, ()| {
            let value_list = s.lock().map_err(lock_broken)?;
            let out = lua.create_table()?;
            for (k, v) in &value_list.value_list {
                out.set(k.as_str(), toml_convert_lua(lua, v)?)?;
            }
            Ok(out)
        })
        .map_err(mlua_to_nota)?;
    t.set("all", all).map_err(mlua_to_nota)?;

    Ok(t)
}

fn lock_broken<E: std::fmt::Display>(e: E) -> mlua::Error {
    mlua::Error::RuntimeError(lock_package_error(e))
}

fn lock_package_error<E: std::fmt::Display>(e: E) -> String {
    format!("Extension settings state is invalid: {e}")
}

struct StorageState {
    path_3: PathBuf,
    value_list: BTreeMap<String, toml::Value>,
}

fn main_side_table() -> &'static Mutex<HashMap<String, Arc<Mutex<StorageState>>>> {
    static TABLE_2: OnceLock<Mutex<HashMap<String, Arc<Mutex<StorageState>>>>> = OnceLock::new();
    TABLE_2.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_store_out(plugin_id: &str) -> NotaResult<Arc<Mutex<StorageState>>> {
    let path_3 = paths::plugin_settings_file(plugin_id)?;

    let ge = {
        let mut table_2 = main_side_table().lock().unwrap();
        table_2
            .entry(plugin_id.to_owned())
            .or_insert_with(|| {
                Arc::new(Mutex::new(StorageState {
                    value_list: BTreeMap::new(),
                    path_3: path_3.clone(),
                }))
            })
            .clone()
    };

    {
        let mut s = ge
            .lock()
            .map_err(|e| NotaError::other(lock_package_error(e)))?;
        s.value_list = read_2(&s.path_3);
    }
    Ok(ge)
}

pub fn host_write_one(plugin_id: &str, key: &str, value_2: toml::Value) -> NotaResult<()> {
    let ge = get_store_out(plugin_id)?;
    write_enter(&ge, key, value_2)
}

fn write_enter(ge: &Arc<Mutex<StorageState>>, key: &str, value_2: toml::Value) -> NotaResult<()> {
    check_rule(key).map_err(NotaError::other)?;
    let mut s = ge
        .lock()
        .map_err(|e| NotaError::other(lock_package_error(e)))?;

    if s.value_list.get(key).is_some_and(|old| *old == value_2) {
        return Ok(());
    }
    s.value_list.insert(key.to_owned(), value_2);

    write_2(&s.path_3, &s.value_list)
}

pub fn read_full_not(plugin_id: &str) -> BTreeMap<String, toml::Value> {
    let Ok(ge) = get_store_out(plugin_id) else {
        return BTreeMap::new();
    };

    let out = match ge.lock() {
        Ok(s) => s.value_list.clone(),
        Err(e) => {
            crate::debug_log!(
                "[nota] plugin settings state poisoned: {}",
                lock_package_error(e)
            );
            BTreeMap::new()
        }
    };
    out
}

fn read_2(path_3: &Path) -> BTreeMap<String, toml::Value> {
    let Ok(text) = std::fs::read_to_string(path_3) else {
        return BTreeMap::new();
    };
    match toml::from_str::<BTreeMap<String, toml::Value>>(&text) {
        Ok(m) => m,
        Err(e) => {
            crate::debug_log!(
                "[nota] plugin settings file unreadable; using empty state: {}: {e}",
                path_3.display()
            );
            BTreeMap::new()
        }
    }
}

const FILE_HEADER: &str = "\
# Nota extension settings.
# Edit this file directly; changes take effect after saving.
# It may contain plaintext secrets. Keep this file private.
";

fn write_2(path_3: &Path, value_list: &BTreeMap<String, toml::Value>) -> NotaResult<()> {
    if let Some(dir) = path_3.parent() {
        paths::ensure_dir(dir)?;
        receive_enter_directory_full_thread(dir);
    }

    let body = toml::to_string(value_list)
        .map_err(|e| NotaError::other(format!("Could not serialize extension settings: {e}")))?;
    let text = format!("{FILE_HEADER}{body}");

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path_3)
            .map_err(|source| NotaError::Write {
                path: path_3.to_path_buf(),
                source,
            })?;
        f.write_all(text.as_bytes())
            .map_err(|source| NotaError::Write {
                path: path_3.to_path_buf(),
                source,
            })?;
        return Ok(());
    }

    #[cfg(not(unix))]
    std::fs::write(path_3, text).map_err(|source| NotaError::Write {
        path: path_3.to_path_buf(),
        source,
    })
}

#[cfg(unix)]
fn receive_enter_directory_full_thread(dir: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn receive_enter_directory_full_thread(_dir: &Path) {}

fn check_rule(key: &str) -> std::result::Result<(), String> {
    if key.is_empty() {
        return Err("The setting key cannot be empty".to_owned());
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err(format!(
            "Invalid setting key `{key}`; use ASCII letters, digits, `-`, and `_`"
        ));
    }
    Ok(())
}

fn check_and_method(key: &str) -> mlua::Result<()> {
    check_rule(key).map_err(mlua::Error::RuntimeError)
}

fn value_convert_toml(v: &Value) -> mlua::Result<Option<toml::Value>> {
    Ok(match v {
        Value::Nil => None,
        Value::Boolean(b) => Some(toml::Value::Boolean(*b)),
        Value::Integer(i) => Some(toml::Value::Integer(*i)),
        Value::Number(n) => Some(toml::Value::Float(*n)),
        Value::String(s) => Some(toml::Value::String(s.to_string_lossy().to_string())),
        other => {
            return Err(mlua::Error::RuntimeError(format!(
                "Extension settings support strings, numbers, and booleans, not {}; serialize structured data as text",
                kind_line_name(other)
            )))
        }
    })
}

fn toml_convert_lua(lua: &Lua, v: &toml::Value) -> mlua::Result<Value> {
    Ok(match v {
        toml::Value::String(s) => Value::String(lua.create_string(s)?),
        toml::Value::Integer(i) => Value::Integer(*i),
        toml::Value::Float(f) => Value::Number(*f),
        toml::Value::Boolean(b) => Value::Boolean(*b),

        other => Value::String(lua.create_string(other.to_string())?),
    })
}

fn kind_line_name(v: &Value) -> &'static str {
    match v {
        Value::Table(_) => "table",
        Value::Function(_) => "function",
        Value::Thread(_) => "coroutine",
        Value::UserData(_) | Value::LightUserData(_) => "host object",
        _ => "this type",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_directory(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nota-settings-test-{name}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn write_lower_get_value_read_return_incoming() {
        let path_3 = temp_directory("roundtrip").join("t.toml");
        let mut value_list = BTreeMap::new();
        value_list.insert("api_key".to_owned(), toml::Value::String("sk-1".to_owned()));
        value_list.insert("model".to_owned(), toml::Value::String("x".to_owned()));
        value_list.insert("max_tokens".to_owned(), toml::Value::Integer(4096));

        write_2(&path_3, &value_list).unwrap();

        let read_return = read_2(&path_3);
        assert_eq!(
            read_return["api_key"],
            toml::Value::String("sk-1".to_owned())
        );
        assert_eq!(read_return["max_tokens"], toml::Value::Integer(4096));
        assert_eq!(read_return.len(), 3);
    }

    #[test]
    fn file_header_that_segment_main_is_not_should_item_read() {
        let path_3 = temp_directory("header").join("t.toml");
        write_2(&path_3, &BTreeMap::new()).unwrap();
        let text = std::fs::read_to_string(&path_3).unwrap();
        assert!(
            text.starts_with("# Nota extension settings."),
            "missing file header: {text}"
        );
        assert!(read_2(&path_3).is_empty());
    }

    #[test]
    #[cfg(unix)]
    fn settings_file_is_0600() {
        use std::os::unix::fs::PermissionsExt;
        let path_3 = temp_directory("mode").join("t.toml");
        write_2(&path_3, &BTreeMap::new()).unwrap();
        let mode = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "\u{62d3}\u{5c55}\u{8bbe}\u{7f6e}\u{6587}\u{4ef6}\u{6743}\u{9650}\u{6210}\u{4e86} {mode:o}\u{ff0c}\u{91cc}\u{9762}\u{53ef}\u{80fd}\u{6709}\u{5bc6}\u{94a5}");

        write_2(&path_3, &BTreeMap::new()).unwrap();
        let mode = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "\u{7b2c}\u{4e8c}\u{6b21}\u{5199}\u{4e4b}\u{540e}\u{6743}\u{9650}\u{53d8}\u{6210}\u{4e86} {mode:o}");
    }

    #[test]
    fn broken_file_when_empty_use_two_not_is_package_error() {
        let dir = temp_directory("broken");
        let path_3 = dir.join("t.toml");
        std::fs::write(&path_3, "\u{8fd9}\u{4e0d}\u{662f} = = toml").unwrap();
        assert!(
            read_2(&path_3).is_empty(),
            "\u{4e00}\u{4efd}\u{624b}\u{6539}\u{574f}\u{7684}\u{8bbe}\u{7f6e}\u{8be5}\u{8868}\u{73b0}\u{4e3a}\u{300c}\u{56de}\u{5230}\u{9ed8}\u{8ba4}\u{503c}\u{300d}\u{ff0c}\u{4e0d}\u{8be5}\u{8ba9}\u{62d3}\u{5c55}\u{52a0}\u{8f7d}\u{5931}\u{8d25}"
        );
    }

    #[test]
    fn check_inner_not_required_has_point_and_unexpected_character_service() {
        assert!(check_and_method("api_key").is_ok());
        assert!(check_and_method("max-tokens2").is_ok());
        let err = check_and_method("a.b").unwrap_err().to_string();
        assert!(
            err.contains("Invalid setting key"),
            "unexpected error: {err}"
        );
        assert!(
            check_and_method("").is_err(),
            "\u{7a7a}\u{952e}\u{8981}\u{62a5}\u{9519}"
        );
        assert!(check_and_method("\u{6a21}\u{578b}").is_err(), "\u{975e} ASCII \u{952e}\u{8981}\u{62a5}\u{9519}\u{ff08}\u{672c}\u{4ed3}\u{81ea}\u{884c}\u{62fc}\u{63a5}\u{7684}\u{952e}\u{5747}\u{4e3a} ASCII\u{ff09}");
    }

    #[test]
    fn only_receive_three_middle_table_two() {
        let lua = Lua::new();
        assert!(
            value_convert_toml(&Value::Nil).unwrap().is_none(),
            "nil = \u{5220}\u{6389}\u{8fd9}\u{4e2a}\u{952e}"
        );
        assert!(value_convert_toml(&Value::Boolean(true)).unwrap().is_some());
        assert!(value_convert_toml(&Value::Integer(1)).unwrap().is_some());
        assert!(value_convert_toml(&Value::Number(1.5)).unwrap().is_some());
        assert!(
            value_convert_toml(&Value::String(lua.create_string("x").unwrap()))
                .unwrap()
                .is_some()
        );

        let t = lua.create_table().unwrap();
        let err = value_convert_toml(&Value::Table(t))
            .unwrap_err()
            .to_string();
        assert!(
            err.contains("support strings, numbers, and booleans"),
            "expected a table rejection, got: {err}"
        );
    }

    #[test]
    fn receive_change_out_incoming_service_and_value_read_return_incoming_is_text_not_is_nil() {
        let lua = Lua::new();
        let arr = toml::Value::Array(vec![toml::Value::Integer(1)]);
        let v = toml_convert_lua(&lua, &arr).unwrap();
        assert!(!v.is_nil(), "\u{590d}\u{5408}\u{503c}\u{8bfb}\u{56de}\u{6765}\u{53d8}\u{6210}\u{4e86} nil\u{ff0c}\u{62d3}\u{5c55}\u{4f1a}\u{628a}\u{7528}\u{6237}\u{7684}\u{8bbe}\u{7f6e}\u{8986}\u{76d6}\u{6389}");
        assert!(
            matches!(v, Value::String(_)),
            "\u{8be5}\u{7ed9}\u{5b83}\u{4e00}\u{4e32}\u{6587}\u{672c}"
        );
    }

    fn one(name: &str) -> (Arc<Mutex<StorageState>>, PathBuf) {
        let path_3 = temp_directory(name).join("t.toml");
        let ge = Arc::new(Mutex::new(StorageState {
            value_list: read_2(&path_3),
            path_3: path_3.clone(),
        }));
        (ge, path_3)
    }

    #[test]
    fn speed_main_write_value_inner_store_and_parse_upper_all_has() {
        let (ge, path_3) = one("hostwrite");

        write_enter(&ge, "window_seconds", toml::Value::Integer(5)).unwrap();

        let inner_store = ge.lock().unwrap();
        assert_eq!(
            inner_store.value_list["window_seconds"],
            toml::Value::Integer(5)
        );
        drop(inner_store);

        assert_eq!(
            read_2(&path_3)["window_seconds"],
            toml::Value::Integer(5),
            "\u{5bbf}\u{4e3b}\u{5199}\u{5b8c}\u{4e86}\u{76d8}\u{4e0a}\u{5374}\u{6ca1}\u{6709}\u{ff08}\u{91cd}\u{542f}\u{5c31}\u{6ca1}\u{4e86}\u{ff09}"
        );
    }

    #[test]
    fn value_each_edit_old_not_write_parse() {
        let (ge, path_3) = one("nowrite");
        write_enter(&ge, "window_seconds", toml::Value::Integer(5)).unwrap();

        std::fs::write(&path_3, "window_seconds = 7\n").unwrap();
        write_enter(&ge, "window_seconds", toml::Value::Integer(5)).unwrap();

        assert_eq!(
            read_2(&path_3)["window_seconds"],
            toml::Value::Integer(7),
            "\u{503c}\u{6ca1}\u{53d8}\u{5374}\u{53c8}\u{5199}\u{4e86}\u{4e00}\u{6b21}\u{76d8}"
        );

        write_enter(&ge, "window_seconds", toml::Value::Integer(9)).unwrap();
        assert_eq!(read_2(&path_3)["window_seconds"], toml::Value::Integer(9));
    }

    #[test]
    fn speed_main_write_broken_check_need_package_error() {
        let (ge, _) = one("badkey");
        let err = write_enter(&ge, "a.b", toml::Value::Integer(1))
            .unwrap_err()
            .to_string();
        assert!(
            err.contains("Invalid setting key"),
            "unexpected error: {err}"
        );
    }

    #[test]
    #[cfg(unix)]
    fn speed_main_write_out_incoming_file_page_is_0600() {
        use std::os::unix::fs::PermissionsExt;
        let (ge, path_3) = one("hostmode");
        write_enter(&ge, "window_seconds", toml::Value::Integer(5)).unwrap();
        let mode = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "\u{6743}\u{9650}\u{6210}\u{4e86} {mode:o}");
    }
}
