//! `nota.json` —— 把一段 JSON 文本拆成 Lua 值（**只有 `decode` 这一半**）。
//!
//! # 为什么现在才抽出这张表
//!
//! `mod.rs::json_to_lua` 顶上原本写着一条**判断依据**（2026-09-27 写的）：
//!
//! > 没有给插件一张 `nota.json` 表，这是有意的。现在只有"读 HTTP 响应"这一处
//! > 需要解析 JSON……等真出现第二个需要它的地方再抽出去——那时这条注释就是
//! > 判断的依据。
//!
//! **2026-10-04（`docs/07` 第 58 项）那个地方出现了**：流式回答里，每一块正文
//! 都是**一小段独立的 JSON**（SSE 的 `data:` 行），而它到不了"整份响应一次
//! 拆好"那条路上——那条路要等整段收完，而流式的全部意义就是**别等**。
//!
//! 于是照那条依据把这张表抽出来。抽的是**同一份实现**（`mod.rs::json_to_lua`），
//! 不是另写一份解析器：两处各写一份的话，"数组下标从 1 起"这种规矩迟早有一边
//! 会漏（漏了的表现是"模型没给出回答"，见那条函数的注释）。
//!
//! # 只有 `decode`，没有 `encode`
//!
//! 用不着。**要发 JSON 的时候把表交给 `nota.http` 就行**——它的 `body` 是表就
//! 当 JSON 发（`http.rs::拼请求`）。多一个 `encode` 就多一份要维护、要写文档的
//! 面，而它一个调用者都没有。
//!
//! # 能力
//!
//! **不需要任何能力**，与 `nota.diff` / `nota.i18n` / `nota.time` 同一类：
//! **它是纯的**——一段文本进、一个值出，不碰文档、不碰磁盘、不碰网络。
//!
//! # 失败是**值**，不是抛出
//!
//! `decode` 收下的常常是**别人写的东西**（模型吐的、服务器回的），它坏掉是
//! 正常情况，不是插件作者的错。所以解析不了时给 `nil, "原因"`——与
//! `nota.http` 那两条失败通道同一条口径（`http.rs::落定`）：**作者的错抛出去，
//! 环境的错返回回来**。
//!
//! ⚠️ 一个诚实的边界：JSON 顶层正好是 `null` 时，`decode` 给的是**一个 `nil`、
//! 没有第二个返回值**，而失败是 `nil` 加一句原因。这两者只差"有几个返回值"——
//! `select("#", nota.json.decode(s))` 分得开。没有为它另设一种返回值：顶层 `null`
//! 在要解析的场合（HTTP 响应、SSE 的一行）等于没出现过，为它把每一次调用都改成
//! "先看一个布尔"得不偿失。
//!
//! ⚠️ **参数收的是 Lua 的"字符串"**，所以按 Lua 自己的规矩**数字会被转成文本**
//! （`decode(1)` 解出来就是数字 `1`——`"1"` 是合法 JSON）。这不是这里特意做的，
//! 是 `lua_tolstring` 那套既有语义；**表、布尔、nil 递进来会抛错**（那是插件作者
//! 写错了程序，该带着栈冒出来）。

use mlua::{Lua, Table, Value};

use super::{json_to_lua, mlua_to_nota};
use crate::error::Result as NotaResult;

/// 装 `nota.json`。
pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let decode = lua
        .create_function(|lua, 文本: String| {
            // ⚠️ 表 / 布尔 / nil 递进来会**抛**（转不成文本）：那是插件作者写错了
            // 程序，与"这段文本不是合法 JSON"完全是两回事。
            // ⚠️ 返回值是**手搓的 `MultiValue`**，不是 `(Value, Value)` 那个元组：
            // 元组写成两个 `Nil` 时 Lua 那边收到的是**两个** nil，而文件头那句
            // "顶层 `null` 只有一个返回值"就成了一句假话。多值这件事在这里是
            // 要传的信息，那就一个不多一个不少地传。
            let mut 返回 = mlua::MultiValue::new();
            match serde_json::from_str::<serde_json::Value>(&文本) {
                Ok(v) => 返回.push_back(json_to_lua(lua, &v)?),
                Err(e) => {
                    返回.push_back(Value::Nil);
                    let 原因 = lua.create_string(format!("不是合法的 JSON：{e}"))?;
                    返回.push_back(Value::String(原因));
                }
            }
            Ok(返回)
        })
        .map_err(mlua_to_nota)?;
    t.set("decode", decode).map_err(mlua_to_nota)?;

    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 拆出来的东西要**与 `nota.http` 那份一模一样**——两条路走的是同一个
    /// `json_to_lua`，这条用例是"别哪天有人在这儿另写一份"的抓手。
    #[test]
    fn 拆出来的形状与_http_那份一致() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let 拆 = json.get::<mlua::Function>("decode").unwrap();

        let (v, e) = 拆
            .call::<(Value, Value)>(r#"{"choices":[{"message":{"content":"你好"}}]}"#)
            .unwrap();
        assert!(matches!(e, Value::Nil), "能解析时不该给原因");
        let v = match v {
            Value::Table(t) => t,
            other => panic!("该是一张表，拿到 {other:?}"),
        };
        let choices = v.get::<Table>("choices").unwrap();
        // ⚠️ **下标从 1 起**：这条与 `mod.rs::json_to_lua` 那条注释是同一件事，
        // 写成 0 起的话第一个元素会静默丢掉。
        assert_eq!(choices.raw_len(), 1);
        assert_eq!(
            choices
                .get::<Table>(1)
                .unwrap()
                .get::<Table>("message")
                .unwrap()
                .get::<String>("content")
                .unwrap(),
            "你好"
        );
    }

    /// 解析不了 ⇒ `nil, 原因`，**不抛**（理由见文件头）。
    #[test]
    fn 解析不了给_nil_和原因() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let 拆 = json.get::<mlua::Function>("decode").unwrap();

        for 坏 in ["", "{", "{\"a\":}", "data: [DONE]"] {
            let (v, e) = 拆.call::<(Value, Value)>(坏).unwrap();
            assert!(matches!(v, Value::Nil), "`{坏}` 不该解析出东西来");
            match e {
                Value::String(s) => assert!(!s.to_str().unwrap().is_empty()),
                other => panic!("失败时第二个返回值该是一句原因，拿到 {other:?}"),
            }
        }
    }

    /// **转不成文本的东西照旧抛**——那是作者写错了程序，不是数据的问题。
    ///
    /// ⚠️ 数字**不算**：Lua 自己会把数字当字符串（`lua_tolstring`），所以
    /// `decode(1)` 解出来就是 `1`。那是 Lua 的脾气，不是这里给的方便。
    #[test]
    fn 递了张表进去是抛错() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let 拆 = json.get::<mlua::Function>("decode").unwrap();

        assert!(拆.call::<Value>(lua.create_table().unwrap()).is_err(), "表不是一段 JSON 文本");
        assert!(拆.call::<Value>(true).is_err(), "布尔不是一段 JSON 文本");

        // 数字走 Lua 自己的转换（`"1"` 是合法 JSON），给的是数字本身。
        let (v, e) = 拆.call::<(Value, Value)>(1).unwrap();
        assert!(matches!(e, Value::Nil));
        assert!(matches!(v, Value::Integer(1)), "拿到 {v:?}");
    }

    /// 顶层 `null` 那条诚实的边界（文件头最后一段）在这里钉住。
    #[test]
    fn 顶层_null_给的是一个没有第二个返回值的_nil() {
        let lua = Lua::new();
        let json = build(&lua).unwrap();
        let 拆 = json.get::<mlua::Function>("decode").unwrap();

        let n = 拆
            .call::<mlua::MultiValue>("null")
            .unwrap()
            .into_iter()
            .count();
        assert_eq!(n, 1, "`null` 解出来就是一个 `nil`，不是 `nil, 原因`");
    }
}
