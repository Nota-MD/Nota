//! `nota.document` —— 读写当前文档。
//!
//! 读的方法要 `document.read`，写的要 `document.write`；两者各自装表，
//! 只申请了读的插件拿到的 `nota.document` 上**没有** `set_text` 这一格。
//!
//! # 写完之后发生了什么
//!
//! `set_text` / `insert_text` 改的是后端镜像，**前端编辑器不会自己知道**。
//! 所以每次写完都往 `nota:document-changed` 发一条事件，前端收到就把编辑器内容
//! 换掉、光标落到合理位置。这条链路见 `docs/05-editor-bridge.md`。
//!
//! ⚠️ 写操作是**整篇替换**语义。插件想"在光标处插一段"目前只能拿到全文自己拼——
//! 精细的选区/位置 API 排在后面的轮次（`docs/07` 第 14 项）。

use mlua::{Lua, Table};

use super::{lua_err, mlua_to_nota};
use crate::error::NotaError;
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    let can_read = manifest.has(Capability::DocumentRead);
    let can_write = manifest.has(Capability::DocumentWrite);

    // ── 读 ────────────────────────────────────────────────────────────────
    if can_read {
        let docs = ctx.documents.clone();
        let get_text = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store
                    .active()
                    .map(|d| d.text.clone())
                    .unwrap_or_default())
            })
            .map_err(mlua_to_nota)?;
        t.set("get_text", get_text).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_path = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().and_then(|d| d.path_string()))
            })
            .map_err(mlua_to_nota)?;
        t.set("get_path", get_path).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_title = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.title.clone()).unwrap_or_default())
            })
            .map_err(mlua_to_nota)?;
        t.set("get_title", get_title).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_revision = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.revision).unwrap_or(0))
            })
            .map_err(mlua_to_nota)?;
        t.set("get_revision", get_revision).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let is_dirty = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.dirty).unwrap_or(false))
            })
            .map_err(mlua_to_nota)?;
        t.set("is_dirty", is_dirty).map_err(mlua_to_nota)?;

        // ── stats：一份"现在多大、多久了"的快照（2026-09-26 加）─────────────
        //
        // 为「写作统计」加的（`plugins/stats`）：它要算**每分钟打了多少**，
        // 而那需要两样东西——**长度**和一个**时刻**。长度这一侧本来就能拿
        // （`get_text` 之后自己数），可**时刻**这一侧沙箱里根本没有：
        // 标准库里没有 `os`（`lua/mod.rs` 的硬化名单里抹掉了），
        // 所以插件拿不到任何形式的时间（`docs/13` §13.3a 那句"插件拿不到时间"
        // 就是这个意思）。把这一条补在这里，而不是给沙箱开一个 `os.time`：
        // 开了 `os` 就同时开出了 `os.exit`（`docs/12` §6 那张表）和
        // `os.remove`/`os.execute` 那一串，代价远不止一个时间戳。
        //
        // ⚠️ `clock_ms` 是**单调时钟**（自 Nota 启动起算的毫秒，`Instant` 出身），
        // **不是墙上时间**：插件要的从来只是"两次之间差了多少"，而墙上时间
        // 会被对表、时区、夏令时拨来拨去（差值甚至能是负的，画出来的曲线会往回跑）。
        // 名字刻意**不叫 `now`**——那会让人以为能拿去显示"现在几点"。
        //
        // ⚠️ 数的是**后端这份镜像**，也就是前端 `nota_doc_sync` 推上来的那一份，
        // 不是磁盘上的文件（同上面 `get_text`，两者在没存盘时本来就不一样）。
        // 它也不是"绝对实时"：前端那条路有 500ms 防抖（`EditorPane.tsx`），
        // 所以这个数最多落后半秒。对"每秒采样一次"的用法完全够。
        let docs = ctx.documents.clone();
        let stats = lua
            .create_function(move |lua, ()| {
                let store = docs.lock().unwrap();
                // ⚠️ 借 `store` 的那几行全部在这一段里做完（出来的都是自有值），
                // 下面 `drop` 之后不再碰它——同上面 `set_text` 那条的形状。
                let (文本, 版本, 路径) = match store.active() {
                    Some(d) => (d.text.clone(), d.revision, d.path_string()),
                    None => (String::new(), 0, None),
                };
                drop(store);

                let t = lua.create_table()?;
                // ⚠️ **码点**（`chars()`），与状态栏那个「N 字符」同一个口径
                // （前端是 `[...text].length`，`ui/outline.ts::countText`）。
                // ⚠️ 不是字节、也不是 UTF-16 单元：一份中文文档如果按字节数，
                // 数字会是显示值的三倍，"字/分钟"直接变成另一个量级。
                t.set("chars", 文本.chars().count())?;
                // ⚠️ 「字/词」数（2026-09-27 加，用户点名「**如果是英文的话要统计词**」）：
                // `chars` 那条口径对中文是对的、对英文是**错的**——`hello` 会被数成
                // 5 个字，写一句英文的读数能虚高四五倍。规则见 `词数`。
                t.set("words", 词数(&文本))?;
                t.set("lines", if 文本.is_empty() { 0 } else { 文本.split('\n').count() })?;
                t.set("revision", 版本)?;
                t.set("path", 路径)?;
                t.set("clock_ms", 单调毫秒())?;
                Ok(t)
            })
            .map_err(mlua_to_nota)?;
        t.set("stats", stats).map_err(mlua_to_nota)?;
    }

    // ── 写 ────────────────────────────────────────────────────────────────
    if can_write {
        let docs = ctx.documents.clone();
        let app = ctx.app.clone();
        let set_text = lua
            .create_function(move |_, text: String| {
                let mut store = docs.lock().unwrap();
                let id = store
                    .active_id()
                    .ok_or_else(|| lua_err(NotaError::NoActiveDocument))?;
                store.sync(id, text.clone()).map_err(lua_err)?;
                drop(store);

                emit_changed(&app, id, &text);
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        t.set("set_text", set_text).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let app = ctx.app.clone();
        let append_text = lua
            .create_function(move |_, tail: String| {
                let mut store = docs.lock().unwrap();
                let id = store
                    .active_id()
                    .ok_or_else(|| lua_err(NotaError::NoActiveDocument))?;
                let mut text = store.active().map(|d| d.text.clone()).unwrap_or_default();
                text.push_str(&tail);
                store.sync(id, text.clone()).map_err(lua_err)?;
                drop(store);

                emit_changed(&app, id, &text);
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        t.set("append_text", append_text).map_err(mlua_to_nota)?;
    }

    Ok(t)
}

/// 自 Nota 启动起算的毫秒数。**单调**：对表、改时区、夏令时都动不了它。
///
/// ⚠️ `OnceLock` 而不是"每次现取一个 `Instant::now` 当零点"：那样两次调用
/// 的零点不一样，减出来的差值毫无意义。起点必须**全进程只有一份**。
///
/// ⚠️ 为什么不用 `SystemTime`（墙钟）：见 `stats` 里那段——插件要的是差值，
/// 而墙钟会被拨回去，差值能是负的。
fn 单调毫秒() -> u64 {
    static 起点: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    // `as_millis` 是 u128：这个进程要跑满 u64 毫秒（≈5.8 亿年）才需要担心截断。
    起点.get_or_init(std::time::Instant::now).elapsed().as_millis() as u64
}

/// 「字/词」数：**中文按字、英文按词**。
///
/// 规则只有这一条（**没有分词器、没有词典、不数 token**）：
///
/// * 一段**连续的 ASCII 字母 / 数字** → 算 **1**（`hello`、`Nota2` 各算一个词）
/// * 其中的 ASCII 撇号**不断词**（`don't` 算 **1**，不是 2）
/// * 其余**非空白**字符 → 各算 **1**（汉字、全角标点、emoji 都算）
/// * ASCII 标点与空白 → 算 **0**（`Hello, world!` 是 **2**，不是 4）
///
/// ⚠️ **为什么不做真分词**：用户 2026-09-27 的原话是「你可以选择同用 token 来
/// 计数，当然这是我随口说的，**如果 token 拆分器写的代码量太多的话就不用了**」
/// ——一条规则就能盖住他要的那件事（英文别按字母数），而真分词要引一份词典或
/// 一个 crate，跟"插件面板上那一格写着『字』"的分量不匹配。
///
/// ⚠️ **已知的三处不精确，都是故意的**（改之前先看这里）：
/// * 连字符**断词**：`well-known` 算 **2**（英文排版里两种数法都有人用，不挑一个）；
/// * 破折号 / 弯引号这类**非 ASCII 标点算 1**（`—` 在中文里是要算的，而"一篇英文
///   里用了几个破折号"这件事不值得为它单独列一张表）；
/// * 不认代码 / URL：`https://a.b/c` 会被拆成 3~4 个词。
///
/// ⚠️ **目前只有 `stats()` 一个消费者**（写作统计插件）。要是前端也要（状态栏那个
/// 「N 字符」想换成字/词），那时再把它搬去顶层模块——**现在不值得为一个 15 行的
/// 纯函数开一个文件**（本仓新文件要登记五处，见 `docs/09` §2）。
fn 词数(文本: &str) -> usize {
    let mut 数 = 0usize;
    // 此刻是不是正在一段字母/数字里。用它在**段首**记一次数（而不是每个字符都记）。
    let mut 在词里 = false;
    for c in 文本.chars() {
        if c.is_ascii_alphanumeric() {
            if !在词里 {
                数 += 1;
                在词里 = true;
            }
        } else if c == '\'' {
            // 撇号什么都不做：**既不断词、自己也不成词**——`don't` 是 1，
            // 而单独一个 `'` 是 0（"在词里"那一格不动，交给两边的字母决定）。
        } else if c.is_whitespace() || c.is_ascii_punctuation() {
            在词里 = false;
        } else {
            数 += 1;
            在词里 = false;
        }
    }
    数
}

/// 把"文档被插件改了"告诉前端。

///
/// 事件名与宿主自己的 `nota:document-changed` 一致——**前端不必区分**
/// 是插件改的还是别处改的，反正都是"后端这份跟你的不一致了，来拿"。
fn emit_changed(app: &tauri::AppHandle, id: crate::document::DocId, text: &str) {
    use tauri::Emitter;
    let _ = app.emit(
        "nota:document-changed",
        serde_json::json!({
            "id": id.0,
            "text": text,
            "origin": "plugin",
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::词数;

    #[test]
    fn 中文按字算() {
        assert_eq!(词数("你好"), 2);
        // ⚠️ 全角标点也各算一个（与状态栏那个「N 字符」同一个口径——中文里
        // 「字数」本来就把它算进去，Word 也是这么数的）。
        assert_eq!(词数("你好，世界。"), 6);
    }

    #[test]
    fn 英文按词算而不是按字母() {
        // ⚠️ 这一条就是用户报的那件事：按 `chars` 会是 13，读完读数是虚的。
        assert_eq!(词数("Hello, world!"), 2);
        assert_eq!(词数("a b c"), 3);
    }

    #[test]
    fn 撇号不断词而连字符断词() {
        assert_eq!(词数("don't"), 1);
        assert_eq!(词数("well-known"), 2);
        // 孤立的一个撇号自己不成词（两边没有字母）。
        assert_eq!(词数("'"), 0);
        assert_eq!(词数("a ' b"), 2);
    }

    #[test]
    fn 空白与_ascii_标点不计数() {
        assert_eq!(词数("  \n\t  "), 0);
        assert_eq!(词数("..."), 0);
        assert_eq!(词数(""), 0);
        assert_eq!(词数("Nota2"), 1);
    }

    #[test]
    fn 中英混排各按自己的规则() {
        // `abc` 一个词 ＋ `中文` 两个字。
        assert_eq!(词数("abc中文"), 3);
        // 汉字**打断**一段字母：`写` 两侧的 `abc` / `def` 是两个词（＋`写` 自己）。
        assert_eq!(词数("abc写def"), 3);
    }

    #[test]
    fn 换行与空格在中文里也不计数() {
        // 打字机每敲一次回车都会让 `chars` 涨一，词数不该跟着涨。
        assert_eq!(词数("第一段\n\n第二段"), 6);
    }
}
