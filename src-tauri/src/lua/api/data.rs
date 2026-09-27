//! `nota.data` —— 插件**自己那份数据**的读写（2026-09-27 加）。
//!
//! ```text
//! ~/.local/share/nota/plugin-data/<插件 id>/<名字>
//! ```
//!
//! # 为什么另开一张表，而不是用现成的那两张
//!
//! | 现成的 | 为什么不行 |
//! |---|---|
//! | `nota.fs` | 它**围在工作区里**（`resolve_in`：canonicalize 之后必须在当前工作区根下，没有工作区就直接拒）。插件的账不该写进用户的文档目录；而且没有工作区时它整个不能用 |
//! | `nota.settings` | 那是**设置**：`api/settings.rs` 顶上那条明确写着"能存的类型故意很小——文本、数字、布尔，没有表、没有数组"，理由是"表的哪一层算一个键"那三个问题没有真实需求支撑。而一条写作记录天然是**一串**记录，拿设置文件当数据库用就把它变成了一个没有 schema 的 blob |
//!
//! 所以这里给的是**第三样东西**：一个目录 ＋ 一串文本文件。插件自己定格式
//! （想存 JSON 就自己拼），宿主只保证"这是你的、别人碰不到、跨重启还在"。
//!
//! # 为什么是"一串文本文件"而不是"一个键值库"
//!
//! 因为需要它的第一个用户（写作统计）要的是**按天追加的一段账**，而文本文件
//! 的优点是**能被人当场看懂、能直接删**。一个二进制库会把"插件数据"变成
//! 一个用户没法排查的黑盒——而这个项目里凡是有"用户看不见的状态"的地方，
//! 都已经在文档里写明代价了（见 `paths.rs::plugin_data_dir` 那条注释）。
//!
//! # 能力 `data.own`（**新加的一条**）
//!
//! ⚠️ 它**只放行上面那一个目录**，与 `fs.write` 不是一回事：`fs` 那一对围的是
//! 用户的工作区，这一条围的是插件自己的角落。两条能力**都要**才是"什么都能写"，
//! 只有这一条的话，插件连文档目录的门都摸不到。
//!
//! # 三条硬边界
//!
//! 1. **名字只认 ASCII 字母数字与 `.` `-` `_`**，不含分隔符、不许是 `.` / `..`
//!    （与 `paths::安全文件名` 同一条理由：名字是插件给的，拿它拼路径就是一条
//!    任意路径写入口）。**不支持子目录**——要分门别类请自己用文件名前缀
//!    （`day-2026-09-27.txt`），一旦允许多级路径，"目录穿越"那个话题就得在这里
//!    重新回答一遍，而它没有任何真实需求。
//! 2. **写是原子的**（先写 `<名字>.tmp` 再 rename）：插件崩在写盘中间时，
//!    用户看到的应该是"上一次那份账"，不是一份被截断的账。
//! 3. **有大小上限**（一次读写 1 MiB）：这是**防呆**不是防恶意——插件本来就能
//!    每秒调一次，没有上限的话一个写错的循环能把用户的磁盘写满。真要存更大的
//!    东西（比如一张图）得先想清楚存哪，那是另一个决定。

use std::path::{Path, PathBuf};

use mlua::{Lua, Table};

use super::mlua_to_nota;
use crate::error::{NotaError, Result as NotaResult};
use crate::paths;

/// 一次读写的大小上限。见文件头第 3 条。
const 上限字节: u64 = 1024 * 1024;

/// 装 `nota.data`。**只该在清单申请了 `data.own` 时调。**
pub fn build(lua: &Lua, plugin_id: &str) -> NotaResult<Table> {
    装(lua, &paths::plugin_data_dir(plugin_id)?)
}

/// 装到指定目录上。
///
/// ⚠️ 拆出来是**给用例用的**（同 `plugin/package.rs::记下不落盘` 那条理由）：
/// `build()` 算的是 `$XDG_DATA_HOME/nota/plugin-data/<id>`，在开发机上那就是
/// 用户**真的**数据目录——用例往那儿写等于随手改用户的数据。
fn 装(lua: &Lua, 目录: &Path) -> NotaResult<Table> {
    let 目录 = 目录.to_path_buf();
    let t = lua.create_table().map_err(mlua_to_nota)?;

    // 目录路径本身也给它：插件要写进日志、或者在界面上告诉用户"我的账存在这儿"，
    // 而它自己算不出这个路径（沙箱里没有 `os.getenv`，也没有 `dirs`）。
    let 路径串 = paths::path_to_string(&目录)?;
    t.set("dir", 路径串).map_err(mlua_to_nota)?;

    let d = 目录.clone();
    let read = lua
        .create_function(move |lua, name: String| {
            名字合法吗(&name)?;
            match 读文件(&d.join(&name)).map_err(super::lua_err)? {
                Some(text) => Ok(mlua::Value::String(lua.create_string(text)?)),
                None => Ok(mlua::Value::Nil),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("read", read).map_err(mlua_to_nota)?;

    let d = 目录.clone();
    let write = lua
        .create_function(move |_, (name, text): (String, String)| {
            名字合法吗(&name)?;
            大小合法吗(&name, text.len() as u64)?;
            paths::ensure_dir(&d).map_err(super::lua_err)?;
            写文件(&d.join(&name), &text).map_err(super::lua_err)?;
            Ok(true)
        })
        .map_err(mlua_to_nota)?;
    t.set("write", write).map_err(mlua_to_nota)?;

    let d = 目录.clone();
    let remove = lua
        .create_function(move |_, name: String| {
            名字合法吗(&name)?;
            match std::fs::remove_file(d.join(&name)) {
                Ok(()) => Ok(true),
                // 本来就没有 → **不报错**：`remove` 是"保证它不在了"，
                // 与 `settings.set(k, nil)` 不报错是同一条口径。
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

/// 名字必须是"不含分隔符的 ASCII 词"。见文件头第 1 条。
///
/// ⚠️ 与 `settings.rs::键合法吗` 那条**故意不一样**：这里多放了 `.`——
/// 数据文件是**文件**，`day-2026-09-27.txt` 这种名字里有个后缀很正常。
/// 设置键不许带点是因为 TOML 拿它当嵌套表的语法（那边写着）。
fn 名字合法吗(name: &str) -> mlua::Result<()> {
    if name.is_empty() {
        return Err(mlua::Error::RuntimeError("数据文件名不能为空".to_owned()));
    }
    if name.len() > 64 {
        return Err(mlua::Error::RuntimeError(format!(
            "数据文件名 `{name}` 太长（最多 64 个字符）"
        )));
    }
    if name == "." || name == ".." {
        return Err(mlua::Error::RuntimeError(format!(
            "数据文件名 `{name}` 不合法"
        )));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        return Err(mlua::Error::RuntimeError(format!(
            "数据文件名 `{name}` 不合法：只能用 ASCII 字母、数字、`.`、`-`、`_`，\
             且不能带路径分隔符（`lua/api/data.rs` 文件头第 1 条）"
        )));
    }
    Ok(())
}

/// 写进去的字节数超没超上限。见文件头第 3 条。
fn 大小合法吗(name: &str, 字节: u64) -> mlua::Result<()> {
    if 字节 > 上限字节 {
        return Err(mlua::Error::RuntimeError(format!(
            "写 `{name}` 失败：{字节} 字节超过了一次 {上限字节} 字节的上限\
             （见 `lua/api/data.rs` 文件头第 3 条）"
        )));
    }
    Ok(())
}

/// 读一个数据文件。**不存在就是 `None`**（调用方翻成 `nil`）。
///
/// ⚠️ 读不出来（权限、不是 UTF-8）**要报错**，不能像"文件不在"那样当空的：
/// 那两种情况的含义正相反——前者是"这份账坏了、该让用户知道"，
/// 后者是"还没记过、从零开始"，静默合并成一种就会把坏账当成新的一天。
fn 读文件(路径: &Path) -> NotaResult<Option<String>> {
    let 元 = match std::fs::metadata(路径) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(NotaError::Read {
                path: 路径.to_path_buf(),
                source,
            })
        }
    };
    if 元.len() > 上限字节 {
        return Err(NotaError::other(format!(
            "数据文件 {} 有 {} 字节，超过了一次能读的 {上限字节} 字节（`lua/api/data.rs` 文件头第 3 条）",
            路径.display(),
            元.len()
        )));
    }
    let text = std::fs::read_to_string(路径).map_err(|source| NotaError::Read {
        path: 路径.to_path_buf(),
        source,
    })?;
    Ok(Some(text))
}

/// 原子写：先写 `<路径>.tmp` 再 rename。见文件头第 2 条。
///
/// ⚠️ 权限 0600、目录 0700：与 `plugin_settings` 同一套（那里写着"不是安全存储，
/// 只是不给同机器的其他用户看"）。数据文件里可能有用户写的句子（心电图的账
/// 不存正文，但这是**约定**不是保证），照最保守的那一档建不吃亏。
fn 写文件(路径: &Path, text: &str) -> NotaResult<()> {
    let 临时 = 临时路径(路径);

    // ⚠️ 落盘顺序是 **fsync 再 rename**：反过来的话，掉电时可能出现
    // "名字已经指向新文件、而内容还在页缓存里"的空文件。
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&临时)
            .map_err(|source| NotaError::Write {
                path: 临时.clone(),
                source,
            })?;
        f.write_all(text.as_bytes()).map_err(|source| NotaError::Write {
            path: 临时.clone(),
            source,
        })?;
        f.sync_all().map_err(|source| NotaError::Write {
            path: 临时.clone(),
            source,
        })?;
    }

    // ⚠️ Windows 那一支也得留着：本仓有 `--target x86_64-pc-windows-gnu` 那条
    // 交叉编译路（`AGENTS.md` 里记着），`OpenOptionsExt` 在那边不存在。
    // 权限那一档在 Windows 上由 ACL 说了算，`mode` 本来也没用。
    #[cfg(not(unix))]
    std::fs::write(&临时, text).map_err(|source| NotaError::Write {
        path: 临时.clone(),
        source,
    })?;

    std::fs::rename(&临时, 路径).map_err(|source| NotaError::Write {
        path: 路径.to_path_buf(),
        source,
    })
}

/// `<名字>.tmp`。⚠️ 后缀是**宿主加的**，所以插件不可能拿它去覆盖别人：
/// 它自己的名字里要出现 `.tmp` 只是多一个普通文件。
fn 临时路径(路径: &Path) -> PathBuf {
    let mut s = 路径.as_os_str().to_owned();
    s.push(".tmp");
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 临时目录(名: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nota-data-test-{名}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).expect("建临时目录");
        d
    }

    /// ⚠️ **这是安全用例，不是格式用例**：名字来自插件，拿它拼路径就是一条
    /// 任意路径读写入口。`../x`、`a/b` 这两种形状必须被挡在调 `join` 之前。
    #[test]
    fn 名字里的路径分隔符与点点出不去() {
        for 坏 in ["", ".", "..", "../x", "a/b", "a\\b", "/etc/passwd", "中文.txt"] {
            let e = 名字合法吗(坏).expect_err(&format!("`{坏}` 该被拒"));
            assert!(
                e.to_string().contains("不合法") || e.to_string().contains("不能为空"),
                "报错要说清是名字的问题：{e}"
            );
        }
        // 好名字：后缀、连字符、下划线、点开头都留着。
        for 好 in ["history.txt", "day-2026-09-27", "a_b.c", "x"] {
            名字合法吗(好).expect("这些该放行");
        }
    }

    /// 写进去、读回来、删掉——一条正常的路。
    #[test]
    fn 写了能读回来删了就没有了() {
        let d = 临时目录("来回");
        let p = d.join("history.txt");
        assert_eq!(读文件(&p).expect("读不存在的文件不该报错"), None, "还没有");

        写文件(&p, "第一天\n第二天\n").expect("写");
        assert_eq!(
            读文件(&p).expect("读").expect("该有内容"),
            "第一天\n第二天\n"
        );

        // 覆盖写：整份替换，不是追加（口径见文件头"名字"那条之前那段）。
        写文件(&p, "只有这一条\n").expect("再写一次");
        assert_eq!(读文件(&p).expect("读").expect("该有内容"), "只有这一条\n");

        // ⚠️ 临时文件不许留在目录里——它会被下一次读当普通文件看到。
        let 残留: Vec<_> = std::fs::read_dir(&d)
            .expect("列目录")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".tmp"))
            .collect();
        assert!(残留.is_empty(), "不该留下临时文件：{残留:?}");

        std::fs::remove_file(&p).expect("删");
        assert_eq!(读文件(&p).expect("读"), None, "删了就该是 None");
    }

    /// 超出上限的写**报错**，而且**一个字节都不落**。
    ///
    /// ⚠️ 走的是真表（`装` 到临时目录上），不是直接调那个纯函数：光钉住
    /// `大小合法吗` 的话，"检查写在 `ensure_dir` 之前"这句保证就没人看着——
    /// 而它的意义正是"被挡住时连目录都不建"。
    #[test]
    fn 太大就不写() {
        let d = 临时目录("太大");
        let lua = Lua::new();
        let t = 装(&lua, &d).expect("装表");
        let write: mlua::Function = t.get("write").expect("有 write");
        let 大 = "字".repeat(上限字节 as usize); // UTF-8 下 3 字节一个，必超
        let e = write
            .call::<bool>(("big.txt", 大))
            .expect_err("该被上限挡住");
        assert!(e.to_string().contains("上限"), "报错要说清是上限：{e}");
        assert!(!d.join("big.txt").exists(), "被挡住了就不该有文件");
    }

    /// 整张表在 Lua 那边**能用**：`read` 读不到给 `nil`（不是空串、不是报错），
    /// 写了之后读得到，`remove` 之后又读不到。`dir` 是那个目录本身。
    #[test]
    fn 在lua里走一遍读写删() {
        let d = 临时目录("在lua里");
        let lua = Lua::new();
        let t = 装(&lua, &d).expect("装表");

        let dir: String = t.get("dir").expect("有 dir");
        assert_eq!(Path::new(&dir), &d, "dir 该是那座目录本身");

        let read: mlua::Function = t.get("read").expect("有 read");
        let write: mlua::Function = t.get("write").expect("有 write");
        let remove: mlua::Function = t.get("remove").expect("有 remove");

        let v: mlua::Value = read.call("history.txt").expect("读不到不该报错");
        assert!(matches!(v, mlua::Value::Nil), "没有这个文件该给 nil");

        assert!(write.call::<bool>(("history.txt", "2026-09-27|1200")).expect("写"));
        let v: mlua::Value = read.call("history.txt").expect("读");
        let mlua::Value::String(s) = v else {
            panic!("该读到一串文本");
        };
        assert_eq!(s.to_string_lossy(), "2026-09-27|1200");

        assert!(remove.call::<bool>("history.txt").expect("删"));
        let v: mlua::Value = read.call("history.txt").expect("再读");
        assert!(matches!(v, mlua::Value::Nil), "删了就该是 nil");
        // 再删一次**不报错**（"保证它不在了"那条口径）。
        assert!(remove.call::<bool>("history.txt").expect("再删一次不该报错"));
    }

    /// 名字不合法时**在进文件系统之前**就被挡住，而且报错是人话。
    #[test]
    fn 坏名字进不了文件系统() {
        let d = 临时目录("坏名字");
        let lua = Lua::new();
        let t = 装(&lua, &d).expect("装表");
        let write: mlua::Function = t.get("write").expect("有 write");
        let e = write
            .call::<bool>(("../escape.txt", "x"))
            .expect_err("带分隔符的名字该被拒");
        assert!(e.to_string().contains("不合法"), "报错要说清：{e}");
        assert!(!d.parent().expect("临时目录有上一级").join("escape.txt").exists());
    }
}
