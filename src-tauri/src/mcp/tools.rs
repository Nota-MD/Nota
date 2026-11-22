use serde_json::{json, Value};

use super::host::Host;

pub struct ToolSpec {
    pub ming: &'static str,
    pub shuo_ming: &'static str,
    pub args_2: fn() -> Value,
    pub pao: fn(&dyn Host, &Value) -> Result<Value, String>,
}

pub const GONG_JU_TABLE: &[ToolSpec] = &[
    ToolSpec {
        ming: "nota_info",
        shuo_ming: "Show the connected Nota version, open document count, and active document without reading content or changing state.",
        args_2: || json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        pao: pao_info,
    },
    ToolSpec {
        ming: "nota_documents",
        shuo_ming: "List the documents currently open in Nota, including unsaved documents. This is not a filesystem listing.",
        args_2: || json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        pao: pao_documents,
    },
    ToolSpec {
        ming: "nota_read",
        shuo_ming: "Read the current Markdown source of a document, including unsaved edits visible in the window.",
        args_2: || {
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "integer", "minimum": 1, "description": "Document ID from nota_documents. Omit it to use the active document." }
                },
                "additionalProperties": false
            })
        },
        pao: pao_read,
    },
    ToolSpec {
        ming: "nota_write",
        shuo_ming: "Replace the entire Markdown source of a document. The user can undo the change with Ctrl+Z. Read the current source before replacing it.",
        args_2: || {
            json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "New complete Markdown source without a code fence" },
                    "id": { "type": "integer", "minimum": 1, "description": "Document ID. Omit it to use the active document." }
                },
                "required": ["text"],
                "additionalProperties": false
            })
        },
        pao: pao_write,
    },
    ToolSpec {
        ming: "nota_open",
        shuo_ming: "Ask Nota to open a file in a new tab. A `requested` result only means the request was sent; errors appear in Nota.",
        args_2: || {
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute file path" }
                },
                "required": ["path"],
                "additionalProperties": false
            })
        },
        pao: pao_open,
    },
];

pub fn manifest_2() -> Value {
    json!({
        "tools": GONG_JU_TABLE
            .iter()
            .map(|t| json!({
                "name": t.ming,
                "description": t.shuo_ming,
                "inputSchema": (t.args_2)(),
            }))
            .collect::<Vec<_>>()
    })
}

#[cfg(test)]
pub fn pao_yi_ge(ming: &str, can_2: &Value, su_zhu: &dyn Host) -> Result<Value, String> {
    let tool = find_tool(ming)?;
    Ok(install_content((tool.pao)(su_zhu, can_2)))
}

pub fn run_tool_raw(ming: &str, can_2: &Value, su_zhu: &dyn Host) -> Result<Value, String> {
    (find_tool(ming)?.pao)(su_zhu, can_2)
}

fn find_tool(name: &str) -> Result<&'static ToolSpec, String> {
    GONG_JU_TABLE
        .iter()
        .find(|tool| tool.ming == name)
        .ok_or_else(|| format!("Unknown tool: {name}. Use tools/list to inspect available tools."))
}

#[cfg(test)]
fn install_content(result_3: Result<Value, String>) -> Value {
    match result_3 {
        Ok(value_2) => json!({
            "content": [{ "type": "text", "text": ok_kan_yi_dian(&value_2) }],
            "isError": false,
        }),
        Err(wei_shen_me) => json!({
            "content": [{ "type": "text", "text": wei_shen_me }],
            "isError": true,
        }),
    }
}

#[cfg(test)]
fn ok_kan_yi_dian(value_2: &Value) -> String {
    match value_2 {
        Value::String(s) => s.clone(),
        _ => value_2.to_string(),
    }
}

fn qu_ke_xuan_id(can_2: &Value) -> Result<Option<u64>, String> {
    match can_2.get("id") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => n
            .as_u64()
            .ok_or_else(|| format!("id must be a positive integer, received {n}"))
            .map(Some),
        Some(other) => Err(format!("id must be a positive integer, received {other}")),
    }
}

fn pao_info(su_zhu: &dyn Host, _can: &Value) -> Result<Value, String> {
    let overview_men = su_zhu.overview_men();
    let huo_dong = overview_men.iter().find(|g| g.active);
    Ok(json!({
        "app": "Nota",
        "version": su_zhu.app_ban_ben(),
        "protocol_versions": super::MCP_PROTOCOL_VERSIONS,
        "open_documents": overview_men.len(),
        "active": huo_dong,
    }))
}

fn pao_documents(su_zhu: &dyn Host, _can: &Value) -> Result<Value, String> {
    Ok(json!({ "documents": su_zhu.overview_men() }))
}

fn pao_read(su_zhu: &dyn Host, can_2: &Value) -> Result<Value, String> {
    let id = qu_ke_xuan_id(can_2)?;
    let fulldocument = su_zhu.read_2(id)?;
    Ok(json!({
        "id": fulldocument.overview.id,
        "title": fulldocument.overview.title,
        "path": fulldocument.overview.path,
        "dirty": fulldocument.overview.dirty,
        "revision": fulldocument.overview.revision,



        "text": fulldocument.body_2,
    }))
}

fn pao_write(su_zhu: &dyn Host, can_2: &Value) -> Result<Value, String> {
    let body_2 = match can_2.get("text") {
        Some(Value::String(s)) => s.clone(),
        Some(bie_de) => return Err(format!("text must be a string, received {bie_de}")),
        None => return Err("Missing text: the complete new source is required".to_string()),
    };
    let id = qu_ke_xuan_id(can_2)?;
    let (document_hao, ban_ben) = su_zhu.write_2(id, &body_2)?;
    Ok(json!({
        "id": document_hao,
        "revision": ban_ben,
        "chars": body_2.chars().count(),
        "note": "Written to Nota. The user can undo the change with Ctrl+Z.",
    }))
}

fn pao_open(su_zhu: &dyn Host, can_2: &Value) -> Result<Value, String> {
    let path_3 = match can_2.get("path") {
        Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
        Some(Value::String(_)) => return Err("path is empty".to_string()),
        Some(bie_de) => return Err(format!("path must be a string, received {bie_de}")),
        None => return Err("Missing path".to_string()),
    };
    su_zhu.qing_qiu_open(&path_3)?;
    Ok(json!({
        "requested": path_3,
        "note": "The request was sent to Nota; open errors appear in the Nota interface",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::host::{FullDocument, HostOverview};
    use std::sync::Mutex;

    #[derive(Default)]
    struct TestAppHost {
        document_2: Mutex<Vec<(u64, String, Option<String>, String)>>,
        huo_dong: Mutex<Option<u64>>,
        ban_ben: Mutex<u64>,
        open_guo: Mutex<Vec<String>>,
    }

    impl TestAppHost {
        fn jian_liang_fen() -> Self {
            let zhe = Self::default();
            zhe.document_2.lock().unwrap().push((
                1,
                "\u{7532}".into(),
                Some("/tmp/\u{7532}.md".into()),
                "\u{7b2c}\u{4e00}\u{7bc7}".into(),
            ));
            zhe.document_2
                .lock()
                .unwrap()
                .push((2, "\u{4e59}".into(), None, "".into()));
            *zhe.huo_dong.lock().unwrap() = Some(2);
            *zhe.ban_ben.lock().unwrap() = 7;
            zhe
        }
    }

    impl Host for TestAppHost {
        fn app_ban_ben(&self) -> String {
            "0.0.0-\u{5047}".into()
        }
        fn overview_men(&self) -> Vec<HostOverview> {
            let huo_dong = *self.huo_dong.lock().unwrap();
            self.document_2
                .lock()
                .unwrap()
                .iter()
                .map(|(id, biao_ti, path_3, _)| HostOverview {
                    id: *id,
                    title: biao_ti.clone(),
                    path: path_3.clone(),
                    dirty: *id == 2,
                    revision: *self.ban_ben.lock().unwrap(),
                    active: huo_dong == Some(*id),
                })
                .collect()
        }
        fn read_2(&self, id: Option<u64>) -> Result<FullDocument, String> {
            let yao = id
                .or(*self.huo_dong.lock().unwrap())
                .ok_or("\u{6ca1}\u{6709}\u{6d3b}\u{52a8}\u{6587}\u{6863}")?;
            let overview = self
                .overview_men()
                .into_iter()
                .find(|g| g.id == yao)
                .ok_or_else(|| {
                    format!("\u{6ca1}\u{6709} id \u{4e3a} {yao} \u{7684}\u{6587}\u{6863}")
                })?;
            let body_2 = self
                .document_2
                .lock()
                .unwrap()
                .iter()
                .find(|(i, _, _, _)| *i == yao)
                .map(|(_, _, _, t)| t.clone())
                .unwrap_or_default();
            Ok(FullDocument { overview, body_2 })
        }
        fn write_2(&self, id: Option<u64>, body_2: &str) -> Result<(u64, u64), String> {
            let yao = id
                .or(*self.huo_dong.lock().unwrap())
                .ok_or("\u{6ca1}\u{6709}\u{6d3b}\u{52a8}\u{6587}\u{6863}")?;
            let mut document_2 = self.document_2.lock().unwrap();
            let yi_fen = document_2
                .iter_mut()
                .find(|(i, _, _, _)| *i == yao)
                .ok_or_else(|| {
                    format!("\u{6ca1}\u{6709} id \u{4e3a} {yao} \u{7684}\u{6587}\u{6863}")
                })?;
            yi_fen.3 = body_2.to_string();
            drop(document_2);
            let mut ban_ben = self.ban_ben.lock().unwrap();
            *ban_ben += 1;
            Ok((yao, *ban_ben))
        }
        fn qing_qiu_open(&self, path_3: &str) -> Result<(), String> {
            if path_3 == "/\u{4e0d}\u{5b58}\u{5728}" {
                return Err(format!(
                    "\u{8def}\u{5f84}\u{4e0d}\u{5b58}\u{5728}\u{ff1a}{path_3}"
                ));
            }
            self.open_guo.lock().unwrap().push(path_3.to_string());
            Ok(())
        }
    }

    fn wen_zi(value_2: &Value) -> String {
        value_2["content"][0]["text"]
            .as_str()
            .unwrap_or_default()
            .to_string()
    }

    #[test]
    fn manifest_li_de_mei_ge_gong_ju_dou_you_name_shuo_ming_yu_dui_xiang_xing_tai_de_args() {
        let ming_ce = manifest_2();
        let gong_ju_men = ming_ce["tools"].as_array().unwrap();
        assert_eq!(gong_ju_men.len(), 5);
        let mut ming_men: Vec<&str> = gong_ju_men
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            ming_men,
            vec![
                "nota_info",
                "nota_documents",
                "nota_read",
                "nota_write",
                "nota_open"
            ]
        );
        ming_men.sort_unstable();
        let qu_zhong = {
            let mut a = ming_men.clone();
            a.dedup();
            a
        };
        assert_eq!(
            ming_men, qu_zhong,
            "\u{5de5}\u{5177}\u{540d}\u{4e0d}\u{8bb8}\u{91cd}"
        );
        for t in gong_ju_men {
            assert!(
                !t["description"].as_str().unwrap().is_empty(),
                "{}\u{6ca1}\u{6709}\u{8bf4}\u{660e}",
                t["name"]
            );
            let args_2 = &t["inputSchema"];
            assert_eq!(args_2["type"], "object", "{}", t["name"]);
            assert!(args_2["properties"].is_object(), "{}", t["name"]);

            assert_eq!(args_2["additionalProperties"], false, "{}", t["name"]);
        }
    }

    #[test]
    fn jiao_bu_chu_name_de_gong_ju_shi_xie_yi_error() {
        let zhe = TestAppHost::jian_liang_fen();
        let cuo = pao_yi_ge("nota_\u{4e0d}\u{5b58}\u{5728}\u{7684}", &json!({}), &zhe).unwrap_err();
        assert!(cuo.contains("Unknown tool"), "{cuo}");
    }

    #[test]
    fn info_bao_chu_huo_dong_na_yi_fen_yu_ban_ben() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_info", &json!({}), &zhe).unwrap();
        let t: Value = wen_zi(&value_2).parse().unwrap();
        assert_eq!(t["app"], "Nota");
        assert_eq!(t["version"], "0.0.0-\u{5047}");
        assert_eq!(t["open_documents"], 2);
        assert_eq!(
            t["active"]["id"], 2,
            "\u{6d3b}\u{52a8}\u{90a3}\u{4efd}\u{662f}\u{4e59}"
        );
        assert!(t["protocol_versions"].as_array().unwrap().len() >= 3);
        assert_eq!(value_2["isError"], false);
    }

    #[test]
    fn documents_lie_chu_mei_yi_fen_han_wei_cun_pan_de() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_documents", &json!({}), &zhe).unwrap();
        let t: Value = wen_zi(&value_2).parse().unwrap();
        let men = t["documents"].as_array().unwrap();
        assert_eq!(men.len(), 2);
        assert_eq!(men[1]["id"], 2);
        assert_eq!(
            men[1]["path"],
            Value::Null,
            "\u{672a}\u{5b58}\u{76d8}\u{7684}\u{90a3}\u{4efd} path \u{662f} null"
        );
        assert_eq!(men[1]["dirty"], true);
        assert_eq!(men[0]["path"], "/tmp/\u{7532}.md");
    }

    #[test]
    fn read_bu_write_id_read_huo_dong_na_yi_fen() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_read", &json!({}), &zhe).unwrap();
        let t: Value = wen_zi(&value_2).parse().unwrap();
        assert_eq!(t["id"], 2);
        assert_eq!(t["title"], "\u{4e59}");
        assert_eq!(t["text"], "");
    }

    #[test]
    fn read_write_id_read_zhi_ding_na_yi_fen() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_read", &json!({ "id": 1 }), &zhe).unwrap();
        let t: Value = wen_zi(&value_2).parse().unwrap();
        assert_eq!(t["id"], 1);
        assert_eq!(t["text"], "\u{7b2c}\u{4e00}\u{7bc7}");
    }

    #[test]
    fn read_read_bu_dao_de_na_yi_fen_shi_gong_ju_error_bu_shi_xie_yi_error() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_read", &json!({ "id": 99 }), &zhe).unwrap();
        assert_eq!(value_2["isError"], true);
        assert!(wen_zi(&value_2).contains("99"), "\u{90a3}\u{53e5}\u{8bdd}\u{91cc}\u{5f97}\u{6709}\u{5b83}\u{8981}\u{7684}\u{90a3}\u{4e2a} id");
    }

    #[test]
    fn id_write_cuo_le_jiu_bao_cuo_bu_cai() {
        let zhe = TestAppHost::jian_liang_fen();
        for huai in [
            json!({ "id": "1" }),
            json!({ "id": -1 }),
            json!({ "id": 1.5 }),
        ] {
            let value_2 = pao_yi_ge("nota_read", &huai, &zhe).unwrap();
            assert_eq!(
                value_2["isError"], true,
                "{huai} \u{8be5}\u{88ab}\u{6321}\u{4e0b}"
            );
            assert!(wen_zi(&value_2).contains("id"), "{}", wen_zi(&value_2));
        }
    }

    #[test]
    fn raw_results_are_not_mcp_envelopes() {
        let host = TestAppHost::jian_liang_fen();
        let value = run_tool_raw("nota_documents", &json!({}), &host).unwrap();
        assert!(value.get("documents").is_some());
        assert!(value.get("content").is_none());
    }

    #[test]
    fn write_zhen_de_huan_le_body_bing_bao_le_xin_ban_ben() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge(
            "nota_write",
            &json!({ "text": "\u{6539}\u{8fc7}\u{7684}\u{4e59}" }),
            &zhe,
        )
        .unwrap();
        let t: Value = wen_zi(&value_2).parse().unwrap();
        assert_eq!(t["id"], 2);
        assert_eq!(t["revision"], 8);
        assert_eq!(t["chars"], 4);

        let read_hui = pao_yi_ge("nota_read", &json!({ "id": 2 }), &zhe).unwrap();
        let t2: Value = wen_zi(&read_hui).parse().unwrap();
        assert_eq!(t2["text"], "\u{6539}\u{8fc7}\u{7684}\u{4e59}");
    }

    #[test]
    fn write_shao_le_text_shi_gong_ju_error() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_write", &json!({}), &zhe).unwrap();
        assert_eq!(value_2["isError"], true);
        assert!(wen_zi(&value_2).contains("text"));
        let value_2 = pao_yi_ge("nota_write", &json!({ "text": 5 }), &zhe).unwrap();
        assert_eq!(value_2["isError"], true);
    }

    #[test]
    fn open_ba_path_jiao_gei_le_su_zhu() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge("nota_open", &json!({ "path": "/tmp/\u{65b0}.md" }), &zhe).unwrap();
        assert_eq!(value_2["isError"], false);
        assert_eq!(
            zhe.open_guo.lock().unwrap().as_slice(),
            ["/tmp/\u{65b0}.md"]
        );
    }

    #[test]
    fn open_path_bu_zai_jiu_shi_gong_ju_error() {
        let zhe = TestAppHost::jian_liang_fen();
        let value_2 = pao_yi_ge(
            "nota_open",
            &json!({ "path": "/\u{4e0d}\u{5b58}\u{5728}" }),
            &zhe,
        )
        .unwrap();
        assert_eq!(value_2["isError"], true);
        assert!(
            wen_zi(&value_2).contains("/\u{4e0d}\u{5b58}\u{5728}"),
            "{}",
            wen_zi(&value_2)
        );
        assert!(
            zhe.open_guo.lock().unwrap().is_empty(),
            "\u{9519}\u{4e86}\u{5c31}\u{4e0d}\u{8be5}\u{518d}\u{5f80}\u{4e0b}\u{53d1}"
        );
    }

    #[test]
    fn open_kong_path_yu_que_path_dou_dang_xia() {
        let zhe = TestAppHost::jian_liang_fen();
        for huai in [json!({ "path": "   " }), json!({}), json!({ "path": 7 })] {
            let value_2 = pao_yi_ge("nota_open", &huai, &zhe).unwrap();
            assert_eq!(
                value_2["isError"], true,
                "{huai} \u{8be5}\u{88ab}\u{6321}\u{4e0b}"
            );
        }
    }
}
