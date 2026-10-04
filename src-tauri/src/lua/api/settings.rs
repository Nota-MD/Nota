//! `nota.settings` —— 插件读写**自己那一格**设置（`docs/07` 第 13 项）。
//!
//! # 一格一个文件
//!
//! ```text
//! ~/.config/nota/plugin-settings/<插件 id>.toml
//! ```
//!
//! 每个插件一个文件，**不是一个文件里分节**。理由有三条，每条都实在：
//!
//! 1. **权限**：一个文件只装一个插件的秘密，出问题时把权限收紧（0600）
//!    就是全有全无，不用去动一个共享文件的某几行；
//! 2. **坏一个不连坐**：某个插件写出一份坏 TOML，坏的是它自己那一份，
//!    不是所有人的设置；
//! 3. **删得干净**：卸载插件就是删一个文件，不存在"留下一个空节"。
//!
//! # ⚠️ 这个文件里会有明文密钥
//!
//! AI 插件的 API key 就存在这儿（用户 2026-09-24 定下：**不做密钥链**）。
//! 所以：
//!
//! - 文件按 **0600** 建（`OpenOptions::mode`，不是"先建再 chmod"——那中间有窗口）；
//! - 目录按 **0700** 建；
//! - 文件头写一句说明，让用户手改时知道这是什么。
//!
//! ⚠️ 这**不是**"安全存储"，只是"不给同机器的其他用户看"。谁能读用户的家目录，
//! 谁就能读到它。这一点写在这里，也写在 `docs/13` 里，免得将来有人以为
//! 这层是加密的。
//!
//! # 两处都会写这个文件（2026-10-04 起）
//!
//! | 谁 | 什么时候 | 走哪条路 |
//! |---|---|---|
//! | 插件自己 | `nota.settings.set` | [`build`] 里那两个闭包（就是本文件） |
//! | **宿主** | 用户在「设置 → 拓展」拖动插件声明的那根滑杆 | [`宿主写一个`] |
//!
//! 宿主那一路是新加的（用户要求"打字速度按几秒算"那根滑杆画在设置页上，
//! 见 `plugin/manifest.rs::SettingDecl`）。两者**共用一个进程级的注册表**
//! （[`注册表`]），所以拖完滑杆插件那边立刻读得到新的值，反过来也一样。
//!
//! # 能存的类型**故意很小**
//!
//! 文本、数字、布尔。没有表、没有数组。
//!
//! ⚠️ 不许存表不是偷懒：一旦允许，立刻要回答"表的哪一层算一个键""两次 set
//! 是合并还是替换""删掉一个子键怎么写"这三件事，而它们都没有真实需求支撑。
//! 现在的答案很短：**键只能是不含点的 ASCII 词**，值只能是上面三种，
//! `nil` 表示删掉这个键。

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use mlua::{Lua, Table, Value};

use super::mlua_to_nota;
use crate::error::{NotaError, Result as NotaResult};
use crate::paths;

/// 装 `nota.settings`。**只该在清单申请了 `settings.own` 时调。**
pub fn build(lua: &Lua, plugin_id: &str) -> NotaResult<Table> {
    let 存储 = 取存储(plugin_id)?;

    let t = lua.create_table().map_err(mlua_to_nota)?;

    let s = 存储.clone();
    let get = lua
        .create_function(move |lua, key: String| {
            let 值们 = s.lock().map_err(锁坏了)?;
            match 值们.值们.get(&key) {
                Some(v) => toml转lua(lua, v),
                None => Ok(Value::Nil),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("get", get).map_err(mlua_to_nota)?;

    let s = 存储.clone();
    let set = lua
        .create_function(move |_, (key, value): (String, Value)| {
            键合法吗(&key)?;
            let toml值 = 值转toml(&value)?;

            let mut 值们 = s.lock().map_err(锁坏了)?;
            match toml值 {
                Some(v) => {
                    值们.值们.insert(key, v);
                }
                // `nil` = 删掉这个键。**不报错**：`set(k, nil)` 是 Lua 里
                // "把设置清掉"的自然写法，为此报错只会逼插件作者绕一圈。
                None => {
                    if 值们.值们.remove(&key).is_none() {
                        return Ok(()); // 本来就没有，不用白写一次盘
                    }
                }
            }
            // **立刻落盘**，不攒到卸载时写：插件卸载不保证会被调到
            // （崩溃、强杀都到不了 `on_unload`），而"我填的密钥没了"
            // 是最让人恼火的一种丢数据。
            写(&值们.路径, &值们.值们).map_err(super::lua_err)
        })
        .map_err(mlua_to_nota)?;
    t.set("set", set).map_err(mlua_to_nota)?;

    let s = 存储.clone();
    let all = lua
        .create_function(move |lua, ()| {
            let 值们 = s.lock().map_err(锁坏了)?;
            let out = lua.create_table()?;
            for (k, v) in &值们.值们 {
                out.set(k.as_str(), toml转lua(lua, v)?)?;
            }
            Ok(out)
        })
        .map_err(mlua_to_nota)?;
    t.set("all", all).map_err(mlua_to_nota)?;

    Ok(t)
}

/// `Mutex` 中毒了。**几乎到不了**（临界区里没有会 panic 的代码），
/// 但 `.unwrap()` 在这里是错的：中毒之后那把锁里的数据可能是半截的，
/// 而"设置读不出来"该是一句人话，不是一次 panic。
fn 锁坏了<E: std::fmt::Display>(e: E) -> mlua::Error {
    mlua::Error::RuntimeError(锁报错(e))
}

/// 那句话本身。**两条路（Lua 那条、宿主那条）共用一份**——
/// 各写一遍的话，同一个毛病在一边叫"设置状态坏了"、在另一边叫别的，
/// 用户拿着一句报错去搜是搜不到的。
fn 锁报错<E: std::fmt::Display>(e: E) -> String {
    format!("拓展设置状态坏了：{e}")
}

/// 一个插件的设置格：一份内存里的值 ＋ 它的落点。
struct 存储 {
    路径: PathBuf,
    值们: BTreeMap<String, toml::Value>,
}

/// 进程里所有插件的设置格，按插件 id 存。
///
/// # 为什么要有这么一张全局表（2026-10-04 加）
///
/// 因为**宿主现在也会写这个文件**：「设置 → 拓展」那一页上的滑杆是宿主画的
/// （清单里的 `[[settings]]`），按下去由宿主的命令写值。两处各持一份内存副本的话，
/// 用户在设置页拖一下，插件那边 `nota.settings.get` 拿到的还是启动时读的那份——
/// 界面上的数和插件算出来的数当场对不上，而且要等重启才"自己好了"。
///
/// ⚠️ **锁序**：注册表那把锁**永远是外层的、并且只拿一小会儿**（取/放一个
/// `Arc`）。里层那把（`存储`）才是临界区。绝不在抱着里层锁的时候来拿注册表——
/// 那正是死锁的形状（`docs/03` 的锁序那条不变量）。
fn 注册表() -> &'static Mutex<HashMap<String, Arc<Mutex<存储>>>> {
    static 表: OnceLock<Mutex<HashMap<String, Arc<Mutex<存储>>>>> = OnceLock::new();
    表.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 取一个插件的设置格（没有就现建一个）。
///
/// ⚠️ **每次调用都从盘上重读一遍值**：用户拿编辑器手改了那份文件、或者宿主刚写过，
/// 下一次读到的就该是新的。真正"读一次记住一辈子"的只有插件那边的 `nota.settings`
/// 表——它在插件加载时建、跟着插件活（`docs/13` §设置那一节写着这条）。
fn 取存储(plugin_id: &str) -> NotaResult<Arc<Mutex<存储>>> {
    let 路径 = paths::plugin_settings_file(plugin_id)?;

    // ⚠️ 注册表那把锁在这一段里就放掉，下面重读盘只拿里层那一把（见 `注册表`）。
    let 格 = {
        let mut 表 = 注册表().lock().unwrap();
        表.entry(plugin_id.to_owned())
            .or_insert_with(|| {
                Arc::new(Mutex::new(存储 {
                    值们: BTreeMap::new(),
                    路径: 路径.clone(),
                }))
            })
            .clone()
    };

    {
        let mut s = 格.lock().map_err(|e| NotaError::other(锁报错(e)))?;
        s.值们 = 读(&s.路径);
    }
    Ok(格)
}

/// **宿主替插件写一个键**（「设置 → 拓展」那一页上那根滑杆）。
///
/// ⚠️ 走的是**同一格内存**，不是"直接改文件"：插件那边 `get` 读的就是这一格，
/// 绕过去改文件的话，用户拖完滑杆插件还是老值（要等重启），
/// 更坏的是插件下一次 `set` 会把宿主写的整份盖掉。
pub fn 宿主写一个(plugin_id: &str, key: &str, 值: toml::Value) -> NotaResult<()> {
    let 格 = 取存储(plugin_id)?;
    写进格(&格, key, 值)
}

/// 上面那条的**干活那一半**：查键 ＋ 一格内存 ＋ 一次落盘。
///
/// ⚠️ 拆出来是为了**能测**：`宿主写一个` 要的是"某个插件此刻的设置文件"，
/// 那个路径由 `paths::plugin_settings_file` 算，在开发机上就是用户**真的**那份
/// （`~/.config/nota/plugin-settings/nota.ai.toml` 里躺着真密钥）——测试绝不能走那条路。
/// 这一半只认"一格存储"，测试自己拿临时目录搭一格就行。
///
/// ⚠️ 查键这一步**留在这里**（不是上移到 `宿主写一个`）：它是"宿主能往文件里写什么"
/// 的判据本身，跟写落在同一处才不会被后人绕开——而拆出去之后它也就**测得到**了。
fn 写进格(格: &Arc<Mutex<存储>>, key: &str, 值: toml::Value) -> NotaResult<()> {
    键规则(key).map_err(NotaError::other)?;
    let mut s = 格.lock().map_err(|e| NotaError::other(锁报错(e)))?;

    // ⚠️ 值没变就别白写一次盘：滑杆拖过一个刻度会连发好几次
    //（`ui/settings/primitives.tsx::Range` 是 `input` 事件，一格格地走）。
    if s.值们.get(key).is_some_and(|旧的| *旧的 == 值) {
        return Ok(());
    }
    s.值们.insert(key.to_owned(), 值);

    // **立刻落盘**：与插件那条 `set` 同一条理由（插件卸载不保证会被调到）。
    写(&s.路径, &s.值们)
}

/// 读一个插件**此刻的整份设置**（宿主侧：「设置 → 拓展」要显示每一格现在是什么值，
/// 插件那一行也要据此算它自己的默认值）。
///
/// ⚠️ **一次读整份**，不是"一个键读一回"：几条 `[[settings]]` 就是同一个文件的
/// 几个键，一个键读一遍等于把同一个文件读 N 遍。
///
/// ⚠️ 读不出来给**空的**（不是报错）：同 [`读`] 那条"读不出来当空的用"——
/// 调用方拿清单里的 `default` 兜底，界面上照旧画得出那根滑杆。
pub fn 读全部(plugin_id: &str) -> BTreeMap<String, toml::Value> {
    let Ok(格) = 取存储(plugin_id) else {
        return BTreeMap::new();
    };
    // ⚠️ 先把结果接出来再返回（`match 格.lock() {…}` 直接当块尾表达式的话，
    // 那把临时的锁会活到 `格` 之后，借用检查当场报 E0597）。
    let 出 = match 格.lock() {
        Ok(s) => s.值们.clone(),
        Err(e) => {
            crate::日志!("[nota] 拓展设置状态坏了：{}", 锁报错(e));
            BTreeMap::new()
        }
    };
    出
}

/// 读一份设置。**读不出来就是空的**，不报错。
///
/// ⚠️ 这里刻意**不让坏文件挡住插件加载**：一份被用户手改坏的 TOML 应该表现为
/// "设置回到默认值"，而不是"这个插件坏了用不了"。跟 `Settings::load` 在
/// `lib.rs` 里那条口径一致——坏掉的配置不该让人连界面都进不去。
///
/// ⚠️ 但**坏的读法有两种**，不能混：读失败（文件不在 / 语法错）→ 空；
/// 读到了但某个键的类型不认识（用户写了数组）→ 那个键**照样留着**，
/// 只是返回给插件时变成一串文本（见 `toml转lua`）。
fn 读(路径: &Path) -> BTreeMap<String, toml::Value> {
    let Ok(text) = std::fs::read_to_string(路径) else {
        return BTreeMap::new();
    };
    match toml::from_str::<BTreeMap<String, toml::Value>>(&text) {
        Ok(m) => m,
        Err(e) => {
            crate::日志!("[nota] 拓展设置文件读不了（本次当空的用）：{}：{e}", 路径.display());
            BTreeMap::new()
        }
    }
}

/// 文件头。用户手改时先看到它，知道这是什么、权限为什么是这样。
const 文件头: &str = "\
# 这个文件是 Nota 拓展的设置。可以直接用编辑器改，改完存盘即生效。
# ⚠️ 里面可能有明文密钥（比如 AI 拓展的 API key）。文件权限是 0600
#    （只有你自己读得到），别把它提交进任何仓库。
";

/// 写一份设置。目录 0700、文件 0600。
fn 写(路径: &Path, 值们: &BTreeMap<String, toml::Value>) -> NotaResult<()> {
    if let Some(dir) = 路径.parent() {
        paths::ensure_dir(dir)?;
        收紧目录权限(dir);
    }

    let body = toml::to_string(值们)
        .map_err(|e| NotaError::other(format!("拓展设置序列化失败：{e}")))?;
    let text = format!("{文件头}{body}");

    // ⚠️ 用 `OpenOptions` 带上创建时的 mode，**不是**"写完了再 chmod"——
    // 那中间有一个窗口，此刻任何进程都能读到刚写下去的密钥。
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(路径)
            .map_err(|source| NotaError::Write {
                path: 路径.to_path_buf(),
                source,
            })?;
        f.write_all(text.as_bytes())
            .map_err(|source| NotaError::Write {
                path: 路径.to_path_buf(),
                source,
            })?;
        return Ok(());
    }

    #[cfg(not(unix))]
    std::fs::write(路径, text).map_err(|source| NotaError::Write {
        path: 路径.to_path_buf(),
        source,
    })
}

/// 目录权限收到 0700。收不上就算了——**这不是一条能让存盘失败的错**。
#[cfg(unix)]
fn 收紧目录权限(dir: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn 收紧目录权限(_dir: &Path) {}

/// 键必须是"不含点的 ASCII 词"——**规则本体**。
///
/// ⚠️ 挡点号不是洁癖：TOML 里 `a.b = 1` 与 `a = { b = 1 }` 是**同一个东西**。
/// 允许键里带点的话，插件写 `set("a.b", 1)`，读回来 `all()` 得到的是一个嵌套表，
/// 而 `get("a.b")` 又查不到——一个自己跟自己对不上的设置文件。
///
/// ⚠️ **两条路共用这一份**：插件那条（Lua 的 `nota.settings.set`）与宿主那条
/// （设置页上拖滑杆，`宿主写一个`）。各写一遍的话，同一个坏键在一边被挡下、
/// 在另一边悄悄写进文件——而那种文件读回来是个嵌套表（见上一条）。
/// 清单那一侧还有第三处同样的校验（`plugin/manifest.rs::check_settings`）：
/// 那里挡的是"作者写错了清单"，这里挡的是"运行时写错了键"。
fn 键规则(key: &str) -> std::result::Result<(), String> {
    if key.is_empty() {
        return Err("设置键不能为空".to_owned());
    }
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_')) {
        return Err(format!(
            "设置键 `{key}` 不合法：只能用 ASCII 字母、数字、`-`、`_`\
             （点号会让 TOML 把它当成嵌套的表，见 `lua/api/settings.rs` 的说明）"
        ));
    }
    Ok(())
}

/// 上面那条规则的 Lua 包装（原因包成 `mlua::Error` 给插件看）。
fn 键合法吗(key: &str) -> mlua::Result<()> {
    键规则(key).map_err(mlua::Error::RuntimeError)
}

/// Lua 值 → TOML 值。`Ok(None)` 表示"删掉这个键"。
fn 值转toml(v: &Value) -> mlua::Result<Option<toml::Value>> {
    Ok(match v {
        Value::Nil => None,
        Value::Boolean(b) => Some(toml::Value::Boolean(*b)),
        Value::Integer(i) => Some(toml::Value::Integer(*i)),
        Value::Number(n) => Some(toml::Value::Float(*n)),
        Value::String(s) => Some(toml::Value::String(s.to_string_lossy().to_string())),
        other => {
            return Err(mlua::Error::RuntimeError(format!(
                "拓展设置只支持文本、数字、布尔（写 `nil` 表示删掉这个键），\
                 不支持{}——要存结构化的东西请自己拼成文本",
                类型名(other)
            )))
        }
    })
}

/// TOML 值 → Lua 值。
fn toml转lua(lua: &Lua, v: &toml::Value) -> mlua::Result<Value> {
    Ok(match v {
        toml::Value::String(s) => Value::String(lua.create_string(s)?),
        toml::Value::Integer(i) => Value::Integer(*i),
        toml::Value::Float(f) => Value::Number(*f),
        toml::Value::Boolean(b) => Value::Boolean(*b),
        // 读到了但类型不在支持的那三种里——**用户手改过文件**（塞了个数组
        // 或嵌套表）。给它一串文本，**不给 nil**：nil 会让插件以为"这个键没设过"，
        // 于是它写回自己的默认值，把用户手写的东西悄悄盖掉。
        other => Value::String(lua.create_string(other.to_string())?),
    })
}

fn 类型名(v: &Value) -> &'static str {
    match v {
        Value::Table(_) => "表",
        Value::Function(_) => "函数",
        Value::Thread(_) => "协程",
        Value::UserData(_) | Value::LightUserData(_) => "宿主对象",
        _ => "这个类型",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 临时目录(名: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nota-settings-test-{名}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 一套最小限度的来回：写下去 → 从盘上读回来 → 值还在。
    ///
    /// ⚠️ 走**真的文件**，不mock。这一格的全部价值就是"关掉应用再打开还在"，
    /// 而内存里的表当然会通过所有内存里的用例。
    #[test]
    fn 写下去的值读得回来() {
        let 路径 = 临时目录("roundtrip").join("t.toml");
        let mut 值们 = BTreeMap::new();
        值们.insert("api_key".to_owned(), toml::Value::String("sk-1".to_owned()));
        值们.insert("model".to_owned(), toml::Value::String("x".to_owned()));
        值们.insert("max_tokens".to_owned(), toml::Value::Integer(4096));

        写(&路径, &值们).unwrap();

        let 读回 = 读(&路径);
        assert_eq!(读回["api_key"], toml::Value::String("sk-1".to_owned()));
        assert_eq!(读回["max_tokens"], toml::Value::Integer(4096));
        assert_eq!(读回.len(), 3);
    }

    /// 文件头是注释，**不能影响读回来**——这句话看着理所当然，
    /// 但它就是"Nota 往 TOML 里塞了一段自己写的东西"的那条边界。
    #[test]
    fn 文件头那段注释不影响读() {
        let 路径 = 临时目录("header").join("t.toml");
        写(&路径, &BTreeMap::new()).unwrap();
        let text = std::fs::read_to_string(&路径).unwrap();
        assert!(text.starts_with("# 这个文件是"), "文件头没了：{text}");
        assert!(读(&路径).is_empty());
    }

    /// ⚠️ 文件里会有明文密钥，权限必须是 0600。
    #[test]
    #[cfg(unix)]
    fn 设置文件是_0600() {
        use std::os::unix::fs::PermissionsExt;
        let 路径 = 临时目录("mode").join("t.toml");
        写(&路径, &BTreeMap::new()).unwrap();
        let mode = std::fs::metadata(&路径).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "拓展设置文件权限成了 {mode:o}，里面可能有密钥");

        // 覆盖写也还是 0600（`truncate(true)` 不会改 mode，但这条钉住它）。
        写(&路径, &BTreeMap::new()).unwrap();
        let mode = std::fs::metadata(&路径).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "第二次写之后权限变成了 {mode:o}");
    }

    #[test]
    fn 坏文件当空的用而不是报错() {
        let dir = 临时目录("broken");
        let 路径 = dir.join("t.toml");
        std::fs::write(&路径, "这不是 = = toml").unwrap();
        assert!(
            读(&路径).is_empty(),
            "一份手改坏的设置该表现为「回到默认值」，不该让拓展加载失败"
        );
    }

    /// 键里带点会让 TOML 把它当成嵌套表，于是写进去读不回来。
    #[test]
    fn 键里不许有点和怪字符() {
        assert!(键合法吗("api_key").is_ok());
        assert!(键合法吗("max-tokens2").is_ok());
        let err = 键合法吗("a.b").unwrap_err().to_string();
        assert!(err.contains("不合法"), "实际报的是：{err}");
        assert!(键合法吗("").is_err(), "空键要报错");
        assert!(键合法吗("模型").is_err(), "非 ASCII 键要报错（本仓自行拼接的键均为 ASCII）");
    }

    #[test]
    fn 只收三种标量() {
        let lua = Lua::new();
        assert!(值转toml(&Value::Nil).unwrap().is_none(), "nil = 删掉这个键");
        assert!(值转toml(&Value::Boolean(true)).unwrap().is_some());
        assert!(值转toml(&Value::Integer(1)).unwrap().is_some());
        assert!(值转toml(&Value::Number(1.5)).unwrap().is_some());
        assert!(值转toml(&Value::String(lua.create_string("x").unwrap()))
            .unwrap()
            .is_some());

        let t = lua.create_table().unwrap();
        let err = 值转toml(&Value::Table(t)).unwrap_err().to_string();
        assert!(err.contains("只支持"), "表该被挡下，实际报的是：{err}");
    }

    /// 用户手改出来的复合值：**读回来不能变成 nil**。
    ///
    /// 变成 nil 的后果是插件以为"这个键没设过"，于是写回默认值把用户写的东西盖掉
    /// ——一次静默的数据丢失，而且看起来像是插件自己抽风。
    #[test]
    fn 手改出来的复合值读回来是文本不是_nil() {
        let lua = Lua::new();
        let arr = toml::Value::Array(vec![toml::Value::Integer(1)]);
        let v = toml转lua(&lua, &arr).unwrap();
        assert!(!v.is_nil(), "复合值读回来变成了 nil，拓展会把用户的设置覆盖掉");
        assert!(matches!(v, Value::String(_)), "该给它一串文本");
    }

    // ── 宿主替插件写（2026-10-04 加：「设置 → 拓展」那根滑杆）──────────────

    /// 搭一格"存储"，落点在临时目录里。
    ///
    /// ⚠️ **不能走 `宿主写一个`**：它要的那份设置文件是按插件 id 算的
    /// （`paths::plugin_settings_file`），在开发机上就是用户**真的**那一份——
    /// `~/.config/nota/plugin-settings/nota.ai.toml` 里躺着一把真钥匙。
    /// 所以测的是干活那一半（`写进格`），它只认"一格存储"。
    fn 一格(名: &str) -> (Arc<Mutex<存储>>, PathBuf) {
        let 路径 = 临时目录(名).join("t.toml");
        let 格 = Arc::new(Mutex::new(存储 {
            值们: 读(&路径),
            路径: 路径.clone(),
        }));
        (格, 路径)
    }

    /// 宿主写下去的值：内存里读得到、盘上也读得回来。
    ///
    /// ⚠️ **两处都要**。只查内存的话，"落盘"那一步整个删掉它也照样通过——
    /// 而这一格的全部价值就是"用户拖完滑杆、重启还在"。
    #[test]
    fn 宿主写的值内存和盘上都有() {
        let (格, 路径) = 一格("hostwrite");

        写进格(&格, "window_seconds", toml::Value::Integer(5)).unwrap();

        let 内存 = 格.lock().unwrap();
        assert_eq!(内存.值们["window_seconds"], toml::Value::Integer(5));
        drop(内存);

        assert_eq!(
            读(&路径)["window_seconds"],
            toml::Value::Integer(5),
            "宿主写完了盘上却没有（重启就没了）"
        );
    }

    /// ⚠️ 值没变就**不写盘**。
    ///
    /// 症状要钉的是：滑杆拖过一个刻度会连发好几次（`Range` 是 `input` 事件），
    /// 每次都落一次盘是白花的钱。观测办法是**背着手把文件改掉**——
    /// 短路的那个分支不会覆盖它，没短路就会把用户的手改盖掉。
    #[test]
    fn 值没变就不写盘() {
        let (格, 路径) = 一格("nowrite");
        写进格(&格, "window_seconds", toml::Value::Integer(5)).unwrap();

        std::fs::write(&路径, "window_seconds = 7\n").unwrap();
        写进格(&格, "window_seconds", toml::Value::Integer(5)).unwrap();

        assert_eq!(
            读(&路径)["window_seconds"],
            toml::Value::Integer(7),
            "值没变却又写了一次盘"
        );

        // 值真变了照旧写。
        写进格(&格, "window_seconds", toml::Value::Integer(9)).unwrap();
        assert_eq!(读(&路径)["window_seconds"], toml::Value::Integer(9));
    }

    /// ⚠️ 宿主这条路**不许**写进一个坏键：点号会让 TOML 把它当成嵌套的表，
    /// 于是写进去读不回来（规则本体与插件那条 `set` 是同一份，见 `键规则`）。
    #[test]
    fn 宿主写坏键要报错() {
        let (格, _) = 一格("badkey");
        let err = 写进格(&格, "a.b", toml::Value::Integer(1)).unwrap_err().to_string();
        assert!(err.contains("不合法"), "实际：{err}");
    }

    /// 宿主写完的文件还得是 **0600**：这份文件里可能有插件自己的密钥
    /// （AI 插件那一把就在同一个目录里），别因为换了一条写入口就把权限弄丢了。
    #[test]
    #[cfg(unix)]
    fn 宿主写出来的文件也是_0600() {
        use std::os::unix::fs::PermissionsExt;
        let (格, 路径) = 一格("hostmode");
        写进格(&格, "window_seconds", toml::Value::Integer(5)).unwrap();
        let mode = std::fs::metadata(&路径).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "权限成了 {mode:o}");
    }
}
