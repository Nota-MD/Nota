//! MCP 的工具清单：**AI 客户端能对 Nota 做的每一件事**。
//!
//! # 五个工具，为什么是这五个
//!
//! 判据只有一条：**这件事在不经 MCP 的时候做不到或很别扭**。
//! AI 客户端自己就能读盘上的文件、能写文件，所以"再给一个读文件的口子"
//! 一点价值都没有；它做不到的是**够到 Nota 里正开着的那一份**——那份文档
//! 可能还没存盘、可能刚被用户改了一半、可能还没有路径（`未命名 N`）。
//! 于是清单是：
//!
//! | 工具 | 一句话 |
//! |---|---|
//! | `nota_info` | 对面那个 Nota 还活着吗、它手里有什么 |
//! | `nota_documents` | 现在开着哪几份（含未存盘的那几份） |
//! | `nota_read` | 读一份的全文（**读到的是窗口里此刻的内容**，不是盘上那份） |
//! | `nota_write` | 整篇替换一份（用户在窗口里看得见、Ctrl+Z 撤得回） |
//! | `nota_open` | 请 Nota 打开一个文件（进一个新标签页） |
//!
//! ⚠️ **不做的事，如实记三件**（都是"想做但这一版没做"，不是"想过了决定不做"）：
//!
//! 1. **不做细粒度编辑**（在某个位置插入一段、替换选中内容、动光标）。
//!    那需要前端把"编辑器事务"暴露成一套可远程调用的动作（还要处理"用户
//!    此刻正在打字"的并发），是本模块之外的一大块。整篇替换已经能覆盖
//!    "AI 帮我改这篇文章"的主流用法，而且**撤销栈是完整的**。
//! 2. **不执行 Nota 自己的命令**（导出 PDF、新建标签页、切换主题……）。
//!    宿主侧发命令这条路今天不存在：那些命令是前端 `invoke` 进来的，
//!    方向是"前端问宿主"。要做得先有一条宿主→前端的请求/应答通道。
//! 3. **不做 HTTP 传输**（只做 stdio）。加 HTTP 要引一个 web 框架，
//!    而本仓的规矩是不加依赖、且 MCP 官方客户端默认就是 stdio 起进程。
//!
//! # 说明书为什么用中文写
//!
//! `description` 是给**模型**读的，本仓的用户与它的 AI 都说中文，中文说明书
//! 在这条链路上更短也更准。要换成英文只改这一个文件里的字符串——协议那边
//! （`mod.rs`）一个字都不用动。

use serde_json::{json, Value};

use super::host::宿主;

/// 一个工具：名字、给模型看的说明、参数的 JSON Schema、以及怎么跑。
///
/// ⚠️ `跑` 是 `fn` 指针而不是闭包：清单要放在 `const` 里（AI 客户端拉的
/// `tools/list` 与文档里那张表必须**同源**，写成运行期拼的 `Vec` 就会有两份）。
pub struct 工具 {
    pub 名: &'static str,
    pub 说明: &'static str,
    pub 参数: fn() -> Value,
    pub 跑: fn(&dyn 宿主, &Value) -> Result<Value, String>,
}

/// 那几个工具的**唯一**名册。`tools/list` 与 `tools/call` 都读它。
pub const 工具表: &[工具] = &[
    工具 {
        名: "nota_info",
        说明: "看对面的 Nota 是什么状态：版本、开着几份文档、当前活动的是哪一份。\
               不读正文，也不改任何东西——用它来确认「我连上的那个 Nota 手里有什么」。",
        参数: || json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        跑: 跑_info,
    },
    工具 {
        名: "nota_documents",
        说明: "列出 Nota 现在打开着的每一份文档（含还没存盘的「未命名 N」）。\
               ⚠️ 这是**窗口里开着的那几份**，不是某个目录下的文件清单——要文件清单请直接用你自己的文件工具。",
        参数: || json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        跑: 跑_documents,
    },
    工具 {
        名: "nota_read",
        说明: "读一份文档的全文（markdown 原文）。⚠️ 读到的是**窗口里此刻的内容**：\
               用户刚打了一半还没存盘的字也在里面，而这正是它比「直接读盘上那个文件」有用的地方。",
        参数: || {
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "integer", "minimum": 1, "description": "文档 id（见 nota_documents）。不写＝当前活动的那一份。" }
                },
                "additionalProperties": false
            })
        },
        跑: 跑_read,
    },
    工具 {
        名: "nota_write",
        说明: "把一份文档**整篇**替换成新的正文（markdown 原文）。用户在 Nota 窗口里会立刻看到这次改动，\
               并且可以用 Ctrl+Z 撤销——所以这里不需要额外的确认。⚠️ 它替换的是整篇，不是某一处：\
               先 nota_read 拿到当前正文，改完再整篇写回来。",
        参数: || {
            json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "整篇新正文（markdown 原文，不要带代码围栏）" },
                    "id": { "type": "integer", "minimum": 1, "description": "文档 id。不写＝当前活动的那一份。" }
                },
                "required": ["text"],
                "additionalProperties": false
            })
        },
        跑: 跑_write,
    },
    工具 {
        名: "nota_open",
        说明: "请 Nota 打开一个文件（进一个新的标签页）。⚠️ 这是**请求**：出错的提示落在 Nota 界面上，\
               返回 `requested` 只表示请求发出去了。路径必须存在，且得是 Nota 能读的文本文件。",
        参数: || {
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "文件的绝对路径" }
                },
                "required": ["path"],
                "additionalProperties": false
            })
        },
        跑: 跑_open,
    },
];

/// `tools/list` 的 `result`。
pub fn 清单() -> Value {
    json!({
        "tools": 工具表
            .iter()
            .map(|t| json!({
                "name": t.名,
                "description": t.说明,
                "inputSchema": (t.参数)(),
            }))
            .collect::<Vec<_>>()
    })
}

/// 跑一个工具。
///
/// ⚠️ 两条错误通道分开（这是 MCP 自己的规定，不是我们的口味）：
///
/// * **叫不出名字的工具** → 返回 `Err`，由 `mod.rs` 当成 JSON-RPC 的 `-32602`
///   协议错误（这说明客户端拿错了名册）；
/// * **工具跑了但没成**（没有这份文档、路径不存在……）→ 正常返回一份
///   `isError: true` 的内容，**模型看得见那句话并可自行纠错**——这是工具
///   该有的行为，不该升级成协议错误。
pub fn 跑一个(名: &str, 参: &Value, 宿主: &dyn 宿主) -> Result<Value, String> {
    let 找 = 工具表
        .iter()
        .find(|t| t.名 == 名)
        .ok_or_else(|| format!("没有叫 {名} 的工具（用 tools/list 看现在有哪些）"))?;
    let 结果 = (找.跑)(宿主, 参);
    Ok(装内容(结果))
}

/// 把工具的结果装成 MCP 的 `tools/call` 结果。
fn 装内容(结果: Result<Value, String>) -> Value {
    match 结果 {
        Ok(值) => json!({
            "content": [{ "type": "text", "text": 好看一点(&值) }],
            "isError": false,
        }),
        Err(为什么) => json!({
            "content": [{ "type": "text", "text": 为什么 }],
            "isError": true,
        }),
    }
}

/// 给模型看的那段文字。**JSON 原样给**（不缩进、不包裹）：
/// 缩进后的 JSON 会白白多出三四成 token，而模型读紧凑 JSON 毫无困难。
/// 唯一做的加工是"只有一层对象且只有一个 `text` 字段时，直接把那段文字给它"
/// ——`nota_read` 就是这种形状，让模型少解析一层壳。
fn 好看一点(值: &Value) -> String {
    match 值 {
        Value::String(s) => s.clone(),
        _ => 值.to_string(),
    }
}

// ── 五个工具的实现 ────────────────────────────────────────────────────────

/// 取 `id` 参数：不写是 `None`，写错了就报错（**不猜**）。
fn 取可选id(参: &Value) -> Result<Option<u64>, String> {
    match 参.get("id") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => n
            .as_u64()
            .ok_or_else(|| format!("id 得是正整数，收到的是 {n}"))
            .map(Some),
        Some(别的) => Err(format!("id 得是正整数，收到的是 {别的}")),
    }
}

fn 跑_info(宿主: &dyn 宿主, _参: &Value) -> Result<Value, String> {
    let 概览们 = 宿主.概览们();
    let 活动 = 概览们.iter().find(|g| g.active);
    Ok(json!({
        "app": "Nota",
        "version": 宿主.应用版本(),
        "protocol_versions": super::协议版本们,
        "open_documents": 概览们.len(),
        "active": 活动,
    }))
}

fn 跑_documents(宿主: &dyn 宿主, _参: &Value) -> Result<Value, String> {
    Ok(json!({ "documents": 宿主.概览们() }))
}

fn 跑_read(宿主: &dyn 宿主, 参: &Value) -> Result<Value, String> {
    let id = 取可选id(参)?;
    let 全文 = 宿主.读(id)?;
    Ok(json!({
        "id": 全文.概览.id,
        "title": 全文.概览.title,
        "path": 全文.概览.path,
        "dirty": 全文.概览.dirty,
        "revision": 全文.概览.revision,
        // ⚠️ 正文**最后**写：`serde_json` 的 `json!` 保序（默认那个 `preserve_order`
        // feature 在本仓是开着的，靠的是 tauri 那一串依赖），上面几个字段先出现，
        // 模型一眼就能看到"这是哪一份"。
        "text": 全文.正文,
    }))
}

fn 跑_write(宿主: &dyn 宿主, 参: &Value) -> Result<Value, String> {
    let 正文 = match 参.get("text") {
        Some(Value::String(s)) => s.clone(),
        Some(别的) => return Err(format!("text 得是字符串，收到的是 {别的}")),
        None => return Err("少了 text：整篇新正文是必填的".to_string()),
    };
    let id = 取可选id(参)?;
    let (文档号, 版本) = 宿主.写(id, &正文)?;
    Ok(json!({
        "id": 文档号,
        "revision": 版本,
        "chars": 正文.chars().count(),
        "note": "已写进 Nota，窗口里看得见，用户可以用 Ctrl+Z 撤销",
    }))
}

fn 跑_open(宿主: &dyn 宿主, 参: &Value) -> Result<Value, String> {
    let 路径 = match 参.get("path") {
        Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
        Some(Value::String(_)) => return Err("path 是空的".to_string()),
        Some(别的) => return Err(format!("path 得是字符串，收到的是 {别的}")),
        None => return Err("少了 path".to_string()),
    };
    宿主.请求打开(&路径)?;
    Ok(json!({
        "requested": 路径,
        "note": "请求已经交给 Nota；它开不出来时提示会出现在 Nota 界面上（这里看不到）",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::host::{概览, 全文};
    use std::sync::Mutex;

    /// 一份假宿主：够跑通五个工具，且每一条**都记着被调过什么**。
    ///
    /// ⚠️ 它不只是"返回点假数据"：`写` 会真的改掉自己那份文本、
    /// `请求打开` 会记下路径——不然测出来的是"函数返回了 Ok"，不是"它做了那件事"。
    #[derive(Default)]
    struct 假宿主 {
        文档: Mutex<Vec<(u64, String, Option<String>, String)>>, // id, 标题, 路径, 正文
        活动: Mutex<Option<u64>>,
        版本: Mutex<u64>,
        打开过: Mutex<Vec<String>>,
    }

    impl 假宿主 {
        fn 建两份() -> Self {
            let 这 = Self::default();
            这.文档.lock().unwrap().push((1, "甲".into(), Some("/tmp/甲.md".into()), "第一篇".into()));
            这.文档.lock().unwrap().push((2, "乙".into(), None, "".into()));
            *这.活动.lock().unwrap() = Some(2);
            *这.版本.lock().unwrap() = 7;
            这
        }
    }

    impl 宿主 for 假宿主 {
        fn 应用版本(&self) -> String {
            "0.0.0-假".into()
        }
        fn 概览们(&self) -> Vec<概览> {
            let 活动 = *self.活动.lock().unwrap();
            self.文档
                .lock()
                .unwrap()
                .iter()
                .map(|(id, 标题, 路径, _)| 概览 {
                    id: *id,
                    title: 标题.clone(),
                    path: 路径.clone(),
                    dirty: *id == 2,
                    revision: *self.版本.lock().unwrap(),
                    active: 活动 == Some(*id),
                })
                .collect()
        }
        fn 读(&self, id: Option<u64>) -> Result<全文, String> {
            let 要 = id.or(*self.活动.lock().unwrap()).ok_or("没有活动文档")?;
            let 概览 = self
                .概览们()
                .into_iter()
                .find(|g| g.id == 要)
                .ok_or_else(|| format!("没有 id 为 {要} 的文档"))?;
            let 正文 = self
                .文档
                .lock()
                .unwrap()
                .iter()
                .find(|(i, _, _, _)| *i == 要)
                .map(|(_, _, _, t)| t.clone())
                .unwrap_or_default();
            Ok(全文 { 概览, 正文 })
        }
        fn 写(&self, id: Option<u64>, 正文: &str) -> Result<(u64, u64), String> {
            let 要 = id.or(*self.活动.lock().unwrap()).ok_or("没有活动文档")?;
            let mut 文档 = self.文档.lock().unwrap();
            let 一份 = 文档
                .iter_mut()
                .find(|(i, _, _, _)| *i == 要)
                .ok_or_else(|| format!("没有 id 为 {要} 的文档"))?;
            一份.3 = 正文.to_string();
            drop(文档);
            let mut 版本 = self.版本.lock().unwrap();
            *版本 += 1;
            Ok((要, *版本))
        }
        fn 请求打开(&self, 路径: &str) -> Result<(), String> {
            if 路径 == "/不存在" {
                return Err(format!("路径不存在：{路径}"));
            }
            self.打开过.lock().unwrap().push(路径.to_string());
            Ok(())
        }
    }

    /// 取工具结果里那段文字。
    fn 文字(值: &Value) -> String {
        值["content"][0]["text"].as_str().unwrap_or_default().to_string()
    }

    #[test]
    fn 清单里的每个工具都有名字说明与对象形态的参数() {
        let 名册 = 清单();
        let 工具们 = 名册["tools"].as_array().unwrap();
        assert_eq!(工具们.len(), 5);
        let mut 名们: Vec<&str> = 工具们.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(
            名们,
            vec!["nota_info", "nota_documents", "nota_read", "nota_write", "nota_open"]
        );
        名们.sort_unstable();
        let 去重 = {
            let mut a = 名们.clone();
            a.dedup();
            a
        };
        assert_eq!(名们, 去重, "工具名不许重");
        for t in 工具们 {
            assert!(!t["description"].as_str().unwrap().is_empty(), "{}没有说明", t["name"]);
            let 参数 = &t["inputSchema"];
            assert_eq!(参数["type"], "object", "{}", t["name"]);
            assert!(参数["properties"].is_object(), "{}", t["name"]);
            // ⚠️ 本仓的口径：参数表里**只列认得的**，多给一个字段要报错而不是忽略
            //    （模型瞎编字段时要能当场看出来，见 `取可选id` 那条"不猜"）。
            assert_eq!(参数["additionalProperties"], false, "{}", t["name"]);
        }
    }

    #[test]
    fn 叫不出名字的工具是协议错误() {
        let 这 = 假宿主::建两份();
        let 错 = 跑一个("nota_不存在的", &json!({}), &这).unwrap_err();
        assert!(错.contains("没有叫"), "{错}");
    }

    #[test]
    fn info_报出活动那一份与版本() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_info", &json!({}), &这).unwrap();
        let t: Value = 文字(&值).parse().unwrap();
        assert_eq!(t["app"], "Nota");
        assert_eq!(t["version"], "0.0.0-假");
        assert_eq!(t["open_documents"], 2);
        assert_eq!(t["active"]["id"], 2, "活动那份是乙");
        assert!(t["protocol_versions"].as_array().unwrap().len() >= 3);
        assert_eq!(值["isError"], false);
    }

    #[test]
    fn documents_列出每一份含未存盘的() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_documents", &json!({}), &这).unwrap();
        let t: Value = 文字(&值).parse().unwrap();
        let 们 = t["documents"].as_array().unwrap();
        assert_eq!(们.len(), 2);
        assert_eq!(们[1]["id"], 2);
        assert_eq!(们[1]["path"], Value::Null, "未存盘的那份 path 是 null");
        assert_eq!(们[1]["dirty"], true);
        assert_eq!(们[0]["path"], "/tmp/甲.md");
    }

    #[test]
    fn read_不写id读活动那一份() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_read", &json!({}), &这).unwrap();
        let t: Value = 文字(&值).parse().unwrap();
        assert_eq!(t["id"], 2);
        assert_eq!(t["title"], "乙");
        assert_eq!(t["text"], "");
    }

    #[test]
    fn read_写id读指定那一份() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_read", &json!({ "id": 1 }), &这).unwrap();
        let t: Value = 文字(&值).parse().unwrap();
        assert_eq!(t["id"], 1);
        assert_eq!(t["text"], "第一篇");
    }

    #[test]
    fn read_读不到的那一份是工具错误不是协议错误() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_read", &json!({ "id": 99 }), &这).unwrap();
        assert_eq!(值["isError"], true);
        assert!(文字(&值).contains("99"), "那句话里得有它要的那个 id");
    }

    #[test]
    fn id_写错了就报错不猜() {
        let 这 = 假宿主::建两份();
        for 坏 in [json!({ "id": "1" }), json!({ "id": -1 }), json!({ "id": 1.5 })] {
            let 值 = 跑一个("nota_read", &坏, &这).unwrap();
            assert_eq!(值["isError"], true, "{坏} 该被挡下");
            assert!(文字(&值).contains("id"), "{}", 文字(&值));
        }
    }

    #[test]
    fn write_真的换了正文并报了新版本() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_write", &json!({ "text": "改过的乙" }), &这).unwrap();
        let t: Value = 文字(&值).parse().unwrap();
        assert_eq!(t["id"], 2);
        assert_eq!(t["revision"], 8);
        assert_eq!(t["chars"], 4);
        // 真的落到宿主那份里了——不是"返回了 Ok"
        let 读回 = 跑一个("nota_read", &json!({ "id": 2 }), &这).unwrap();
        let t2: Value = 文字(&读回).parse().unwrap();
        assert_eq!(t2["text"], "改过的乙");
    }

    #[test]
    fn write_少了text是工具错误() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_write", &json!({}), &这).unwrap();
        assert_eq!(值["isError"], true);
        assert!(文字(&值).contains("text"));
        let 值 = 跑一个("nota_write", &json!({ "text": 5 }), &这).unwrap();
        assert_eq!(值["isError"], true);
    }

    #[test]
    fn open_把路径交给了宿主() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_open", &json!({ "path": "/tmp/新.md" }), &这).unwrap();
        assert_eq!(值["isError"], false);
        assert_eq!(这.打开过.lock().unwrap().as_slice(), ["/tmp/新.md"]);
    }

    #[test]
    fn open_路径不在就是工具错误() {
        let 这 = 假宿主::建两份();
        let 值 = 跑一个("nota_open", &json!({ "path": "/不存在" }), &这).unwrap();
        assert_eq!(值["isError"], true);
        assert!(文字(&值).contains("/不存在"), "{}", 文字(&值));
        assert!(这.打开过.lock().unwrap().is_empty(), "错了就不该再往下发");
    }

    #[test]
    fn open_空路径与缺路径都挡下() {
        let 这 = 假宿主::建两份();
        for 坏 in [json!({ "path": "   " }), json!({}), json!({ "path": 7 })] {
            let 值 = 跑一个("nota_open", &坏, &这).unwrap();
            assert_eq!(值["isError"], true, "{坏} 该被挡下");
        }
    }
}
