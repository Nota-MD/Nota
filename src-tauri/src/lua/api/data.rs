use std::path::{Path, PathBuf};

use mlua::{Lua, Table};

use super::mlua_to_nota;
use crate::error::{NotaError, Result as NotaResult};
use crate::paths;

const SHANG_XIAN_ZI_JIE: u64 = 1024 * 1024;

pub fn build(lua: &Lua, plugin_id: &str) -> NotaResult<Table> {
    install_2(lua, &paths::plugin_data_dir(plugin_id)?)
}

fn install_2(lua: &Lua, directory_2: &Path) -> NotaResult<Table> {
    let directory_2 = directory_2.to_path_buf();
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let path_chuan = paths::path_to_string(&directory_2)?;
    t.set("dir", path_chuan).map_err(mlua_to_nota)?;

    let d = directory_2.clone();
    let read = lua
        .create_function(move |lua, name: String| {
            name_he_fa_ma(&name)?;
            match read_file_2(&d.join(&name)).map_err(super::lua_err)? {
                Some(text) => Ok(mlua::Value::String(lua.create_string(text)?)),
                None => Ok(mlua::Value::Nil),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("read", read).map_err(mlua_to_nota)?;

    let d = directory_2.clone();
    let write = lua
        .create_function(move |_, (name, text): (String, String)| {
            name_he_fa_ma(&name)?;
            da_xiao_he_fa_ma(&name, text.len() as u64)?;
            paths::ensure_dir(&d).map_err(super::lua_err)?;
            write_file_2(&d.join(&name), &text).map_err(super::lua_err)?;
            Ok(true)
        })
        .map_err(mlua_to_nota)?;
    t.set("write", write).map_err(mlua_to_nota)?;

    let d = directory_2.clone();
    let remove = lua
        .create_function(move |_, name: String| {
            name_he_fa_ma(&name)?;
            match std::fs::remove_file(d.join(&name)) {
                Ok(()) => Ok(true),

                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(true),
                Err(source) => Err(super::lua_err(NotaError::Write {
                    path: d.join(&name),
                    source,
                })),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("remove", remove).map_err(mlua_to_nota)?;

    Ok(t)
}

fn name_he_fa_ma(name: &str) -> mlua::Result<()> {
    if name.is_empty() {
        return Err(mlua::Error::RuntimeError(
            "The data file name cannot be empty".to_owned(),
        ));
    }
    if name.len() > 64 {
        return Err(mlua::Error::RuntimeError(format!(
            "Data file name `{name}` is too long (maximum 64 characters)"
        )));
    }
    if name == "." || name == ".." {
        return Err(mlua::Error::RuntimeError(format!(
            "Invalid data file name: `{name}`"
        )));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        return Err(mlua::Error::RuntimeError(format!(
            "Invalid data file name `{name}`; use ASCII letters, digits, `.`, `-`, and `_`, with no path separators"
        )));
    }
    Ok(())
}

fn da_xiao_he_fa_ma(name: &str, zi_jie: u64) -> mlua::Result<()> {
    if zi_jie > SHANG_XIAN_ZI_JIE {
        return Err(mlua::Error::RuntimeError(format!(
            "Could not write `{name}`: {zi_jie} bytes exceeds the {SHANG_XIAN_ZI_JIE} byte limit"
        )));
    }
    Ok(())
}

fn read_file_2(path_3: &Path) -> NotaResult<Option<String>> {
    let metadata_2 = match std::fs::metadata(path_3) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(NotaError::Read {
                path: path_3.to_path_buf(),
                source,
            })
        }
    };
    if metadata_2.len() > SHANG_XIAN_ZI_JIE {
        return Err(NotaError::other(format!(
            "Data file {} is {} bytes, above the {SHANG_XIAN_ZI_JIE} byte read limit",
            path_3.display(),
            metadata_2.len()
        )));
    }
    let text = std::fs::read_to_string(path_3).map_err(|source| NotaError::Read {
        path: path_3.to_path_buf(),
        source,
    })?;
    Ok(Some(text))
}

fn write_file_2(path_3: &Path, text: &str) -> NotaResult<()> {
    let temp_2 = temp_path_2(path_3);

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temp_2)
            .map_err(|source| NotaError::Write {
                path: temp_2.clone(),
                source,
            })?;
        f.write_all(text.as_bytes())
            .map_err(|source| NotaError::Write {
                path: temp_2.clone(),
                source,
            })?;
        f.sync_all().map_err(|source| NotaError::Write {
            path: temp_2.clone(),
            source,
        })?;
    }

    #[cfg(not(unix))]
    std::fs::write(&temp_2, text).map_err(|source| NotaError::Write {
        path: temp_2.clone(),
        source,
    })?;

    std::fs::rename(&temp_2, path_3).map_err(|source| NotaError::Write {
        path: path_3.to_path_buf(),
        source,
    })
}

fn temp_path_2(path_3: &Path) -> PathBuf {
    let mut s = path_3.as_os_str().to_owned();
    s.push(".tmp");
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_directory(ming: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nota-data-test-{ming}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
        d
    }

    #[test]
    fn name_li_de_path_fen_ge_fu_yu_dian_dian_chu_bu_qu() {
        for huai in [
            "",
            ".",
            "..",
            "../x",
            "a/b",
            "a\\b",
            "/etc/passwd",
            "\u{4e2d}\u{6587}.txt",
        ] {
            let e = name_he_fa_ma(huai).expect_err(&format!("`{huai}` \u{8be5}\u{88ab}\u{62d2}"));
            assert!(
                e.to_string().contains("Invalid data file name")
                    || e.to_string().contains("cannot be empty"),
                "expected a file-name error: {e}"
            );
        }

        for ok_2 in ["history.txt", "day-2026-09-27", "a_b.c", "x"] {
            name_he_fa_ma(ok_2).expect("\u{8fd9}\u{4e9b}\u{8be5}\u{653e}\u{884c}");
        }
    }

    #[test]
    fn write_le_neng_read_hui_lai_shan_le_jiu_mei_you_le() {
        let d = temp_directory("\u{6765}\u{56de}");
        let p = d.join("history.txt");
        assert_eq!(read_file_2(&p).expect("\u{8bfb}\u{4e0d}\u{5b58}\u{5728}\u{7684}\u{6587}\u{4ef6}\u{4e0d}\u{8be5}\u{62a5}\u{9519}"), None, "\u{8fd8}\u{6ca1}\u{6709}");

        write_file_2(&p, "\u{7b2c}\u{4e00}\u{5929}\n\u{7b2c}\u{4e8c}\u{5929}\n").expect("\u{5199}");
        assert_eq!(
            read_file_2(&p)
                .expect("\u{8bfb}")
                .expect("\u{8be5}\u{6709}\u{5185}\u{5bb9}"),
            "\u{7b2c}\u{4e00}\u{5929}\n\u{7b2c}\u{4e8c}\u{5929}\n"
        );

        write_file_2(&p, "\u{53ea}\u{6709}\u{8fd9}\u{4e00}\u{6761}\n")
            .expect("\u{518d}\u{5199}\u{4e00}\u{6b21}");
        assert_eq!(
            read_file_2(&p)
                .expect("\u{8bfb}")
                .expect("\u{8be5}\u{6709}\u{5185}\u{5bb9}"),
            "\u{53ea}\u{6709}\u{8fd9}\u{4e00}\u{6761}\n"
        );

        let can_liu: Vec<_> = std::fs::read_dir(&d)
            .expect("\u{5217}\u{76ee}\u{5f55}")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".tmp"))
            .collect();
        assert!(
            can_liu.is_empty(),
            "\u{4e0d}\u{8be5}\u{7559}\u{4e0b}\u{4e34}\u{65f6}\u{6587}\u{4ef6}\u{ff1a}{can_liu:?}"
        );

        std::fs::remove_file(&p).expect("\u{5220}");
        assert_eq!(
            read_file_2(&p).expect("\u{8bfb}"),
            None,
            "\u{5220}\u{4e86}\u{5c31}\u{8be5}\u{662f} None"
        );
    }

    #[test]
    fn tai_da_jiu_bu_write() {
        let d = temp_directory("\u{592a}\u{5927}");
        let lua = Lua::new();
        let t = install_2(&lua, &d).expect("\u{88c5}\u{8868}");
        let write: mlua::Function = t.get("write").expect("\u{6709} write");
        let da = "\u{5b57}".repeat(SHANG_XIAN_ZI_JIE as usize);
        let e = write
            .call::<bool>(("big.txt", da))
            .expect_err("\u{8be5}\u{88ab}\u{4e0a}\u{9650}\u{6321}\u{4f4f}");
        assert!(
            e.to_string().contains("byte limit"),
            "expected a size-limit error: {e}"
        );
        assert!(
            !d.join("big.txt").exists(),
            "\u{88ab}\u{6321}\u{4f4f}\u{4e86}\u{5c31}\u{4e0d}\u{8be5}\u{6709}\u{6587}\u{4ef6}"
        );
    }

    #[test]
    fn zai_lua_li_zou_yi_bian_read_write_shan() {
        let d = temp_directory("\u{5728}lua\u{91cc}");
        let lua = Lua::new();
        let t = install_2(&lua, &d).expect("\u{88c5}\u{8868}");

        let dir: String = t.get("dir").expect("\u{6709} dir");
        assert_eq!(
            Path::new(&dir),
            &d,
            "dir \u{8be5}\u{662f}\u{90a3}\u{5ea7}\u{76ee}\u{5f55}\u{672c}\u{8eab}"
        );

        let read: mlua::Function = t.get("read").expect("\u{6709} read");
        let write: mlua::Function = t.get("write").expect("\u{6709} write");
        let remove: mlua::Function = t.get("remove").expect("\u{6709} remove");

        let v: mlua::Value = read
            .call("history.txt")
            .expect("\u{8bfb}\u{4e0d}\u{5230}\u{4e0d}\u{8be5}\u{62a5}\u{9519}");
        assert!(
            matches!(v, mlua::Value::Nil),
            "\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{6587}\u{4ef6}\u{8be5}\u{7ed9} nil"
        );

        assert!(write
            .call::<bool>(("history.txt", "2026-09-27|1200"))
            .expect("\u{5199}"));
        let v: mlua::Value = read.call("history.txt").expect("\u{8bfb}");
        let mlua::Value::String(s) = v else {
            panic!("\u{8be5}\u{8bfb}\u{5230}\u{4e00}\u{4e32}\u{6587}\u{672c}");
        };
        assert_eq!(s.to_string_lossy(), "2026-09-27|1200");

        assert!(remove.call::<bool>("history.txt").expect("\u{5220}"));
        let v: mlua::Value = read.call("history.txt").expect("\u{518d}\u{8bfb}");
        assert!(
            matches!(v, mlua::Value::Nil),
            "\u{5220}\u{4e86}\u{5c31}\u{8be5}\u{662f} nil"
        );

        assert!(remove
            .call::<bool>("history.txt")
            .expect("\u{518d}\u{5220}\u{4e00}\u{6b21}\u{4e0d}\u{8be5}\u{62a5}\u{9519}"));
    }

    #[test]
    fn huai_name_jin_bu_le_file_xi_tong() {
        let d = temp_directory("\u{574f}\u{540d}\u{5b57}");
        let lua = Lua::new();
        let t = install_2(&lua, &d).expect("\u{88c5}\u{8868}");
        let write: mlua::Function = t.get("write").expect("\u{6709} write");
        let e = write.call::<bool>(("../escape.txt", "x")).expect_err(
            "\u{5e26}\u{5206}\u{9694}\u{7b26}\u{7684}\u{540d}\u{5b57}\u{8be5}\u{88ab}\u{62d2}",
        );
        assert!(
            e.to_string().contains("Invalid data file name"),
            "unexpected error: {e}"
        );
        assert!(!d
            .parent()
            .expect("\u{4e34}\u{65f6}\u{76ee}\u{5f55}\u{6709}\u{4e0a}\u{4e00}\u{7ea7}")
            .join("escape.txt")
            .exists());
    }
}
