use serde_json::{json, Value};

use super::host::Host;

pub struct ToolSpec {
    pub name: &'static str,
    pub say_name: &'static str,
    pub args_2: fn() -> Value,
    pub run: fn(&dyn Host, &Value) -> Result<Value, String>,
}

pub const WORK_SENTENCE_TABLE: &[ToolSpec] = &[
    ToolSpec {
        name: "nota_info",
        say_name: "Show the connected Nota version, open document count, and active document without reading content or changing state.",
        args_2: || json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        run: run_info,
    },
    ToolSpec {
        name: "nota_documents",
        say_name: "List the documents currently open in Nota, including unsaved documents. This is not a filesystem listing.",
        args_2: || json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        run: run_documents,
    },
    ToolSpec {
        name: "nota_read",
        say_name: "Read the current Markdown source of a document, including unsaved edits visible in the window.",
        args_2: || {
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "integer", "minimum": 1, "description": "Document ID from nota_documents. Omit it to use the active document." }
                },
                "additionalProperties": false
            })
        },
        run: run_read,
    },
    ToolSpec {
        name: "nota_write",
        say_name: "Replace the entire Markdown source of a document. The user can undo the change with Ctrl+Z. Read the current source before replacing it.",
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
        run: run_write,
    },
    ToolSpec {
        name: "nota_open",
        say_name: "Ask Nota to open a file in a new tab. A `requested` result only means the request was sent; errors appear in Nota.",
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
        run: run_open,
    },
];

pub fn manifest_2() -> Value {
    json!({
        "tools": WORK_SENTENCE_TABLE
            .iter()
            .map(|t| json!({
                "name": t.name,
                "description": t.say_name,
                "inputSchema": (t.args_2)(),
            }))
            .collect::<Vec<_>>()
    })
}

#[cfg(test)]
pub fn run_one(
    name: &str,
    arguments_value: &Value,
    speed_main: &dyn Host,
) -> Result<Value, String> {
    let tool = find_tool(name)?;
    Ok(install_content((tool.run)(speed_main, arguments_value)))
}

pub fn run_tool_raw(
    name: &str,
    arguments_value: &Value,
    speed_main: &dyn Host,
) -> Result<Value, String> {
    (find_tool(name)?.run)(speed_main, arguments_value)
}

fn find_tool(name: &str) -> Result<&'static ToolSpec, String> {
    WORK_SENTENCE_TABLE
        .iter()
        .find(|tool| tool.name == name)
        .ok_or_else(|| format!("Unknown tool: {name}. Use tools/list to inspect available tools."))
}

#[cfg(test)]
fn install_content(result_3: Result<Value, String>) -> Value {
    match result_3 {
        Ok(value_2) => json!({
            "content": [{ "type": "text", "text": ok_see_one_point(&value_2) }],
            "isError": false,
        }),
        Err(position_deep) => json!({
            "content": [{ "type": "text", "text": position_deep }],
            "isError": true,
        }),
    }
}

#[cfg(test)]
fn ok_see_one_point(value_2: &Value) -> String {
    match value_2 {
        Value::String(s) => s.clone(),
        _ => value_2.to_string(),
    }
}

fn get_can_select_id(arguments_value: &Value) -> Result<Option<u64>, String> {
    match arguments_value.get("id") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => n
            .as_u64()
            .ok_or_else(|| format!("id must be a positive integer, received {n}"))
            .map(Some),
        Some(other) => Err(format!("id must be a positive integer, received {other}")),
    }
}

fn run_info(speed_main: &dyn Host, _can: &Value) -> Result<Value, String> {
    let overview_list = speed_main.overview_list();
    let active_dynamic = overview_list.iter().find(|g| g.active);
    Ok(json!({
        "app": "Nota",
        "version": speed_main.app_half_current(),
        "protocol_versions": super::MCP_PROTOCOL_VERSIONS,
        "open_documents": overview_list.len(),
        "active": active_dynamic,
    }))
}

fn run_documents(speed_main: &dyn Host, _can: &Value) -> Result<Value, String> {
    Ok(json!({ "documents": speed_main.overview_list() }))
}

fn run_read(speed_main: &dyn Host, arguments_value: &Value) -> Result<Value, String> {
    let id = get_can_select_id(arguments_value)?;
    let full_document = speed_main.read_2(id)?;
    Ok(json!({
        "id": full_document.overview.id,
        "title": full_document.overview.title,
        "path": full_document.overview.path,
        "dirty": full_document.overview.dirty,
        "revision": full_document.overview.revision,



        "text": full_document.body_2,
    }))
}

fn run_write(speed_main: &dyn Host, arguments_value: &Value) -> Result<Value, String> {
    let body_2 = match arguments_value.get("text") {
        Some(Value::String(s)) => s.clone(),
        Some(other) => return Err(format!("text must be a string, received {other:?}")),
        None => return Err("Missing text: the complete new source is required".to_string()),
    };
    let id = get_can_select_id(arguments_value)?;
    let (document_number, half_current) = speed_main.write_2(id, &body_2)?;
    Ok(json!({
        "id": document_number,
        "revision": half_current,
        "chars": body_2.chars().count(),
        "note": "Written to Nota. The user can undo the change with Ctrl+Z.",
    }))
}

fn run_open(speed_main: &dyn Host, arguments_value: &Value) -> Result<Value, String> {
    let path_3 = match arguments_value.get("path") {
        Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
        Some(Value::String(_)) => return Err("path is empty".to_string()),
        Some(other) => return Err(format!("path must be a string, received {other:?}")),
        None => return Err("Missing path".to_string()),
    };
    speed_main.request_request_open(&path_3)?;
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
        active_dynamic: Mutex<Option<u64>>,
        half_current: Mutex<u64>,
        open_passed: Mutex<Vec<String>>,
    }

    impl TestAppHost {
        fn check_two_part() -> Self {
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
            *zhe.active_dynamic.lock().unwrap() = Some(2);
            *zhe.half_current.lock().unwrap() = 7;
            zhe
        }
    }

    impl Host for TestAppHost {
        fn app_half_current(&self) -> String {
            "0.0.0-\u{5047}".into()
        }
        fn overview_list(&self) -> Vec<HostOverview> {
            let active_dynamic = *self.active_dynamic.lock().unwrap();
            self.document_2
                .lock()
                .unwrap()
                .iter()
                .map(|(id, table_question, path_3, _)| HostOverview {
                    id: *id,
                    title: table_question.clone(),
                    path: path_3.clone(),
                    dirty: *id == 2,
                    revision: *self.half_current.lock().unwrap(),
                    active: active_dynamic == Some(*id),
                })
                .collect()
        }
        fn read_2(&self, id: Option<u64>) -> Result<FullDocument, String> {
            let need = id
                .or(*self.active_dynamic.lock().unwrap())
                .ok_or("\u{6ca1}\u{6709}\u{6d3b}\u{52a8}\u{6587}\u{6863}")?;
            let overview = self
                .overview_list()
                .into_iter()
                .find(|g| g.id == need)
                .ok_or_else(|| {
                    format!("\u{6ca1}\u{6709} id \u{4e3a} {need} \u{7684}\u{6587}\u{6863}")
                })?;
            let body_2 = self
                .document_2
                .lock()
                .unwrap()
                .iter()
                .find(|(i, _, _, _)| *i == need)
                .map(|(_, _, _, t)| t.clone())
                .unwrap_or_default();
            Ok(FullDocument { overview, body_2 })
        }
        fn write_2(&self, id: Option<u64>, body_2: &str) -> Result<(u64, u64), String> {
            let need = id
                .or(*self.active_dynamic.lock().unwrap())
                .ok_or("\u{6ca1}\u{6709}\u{6d3b}\u{52a8}\u{6587}\u{6863}")?;
            let mut document_2 = self.document_2.lock().unwrap();
            let one_part = document_2
                .iter_mut()
                .find(|(i, _, _, _)| *i == need)
                .ok_or_else(|| {
                    format!("\u{6ca1}\u{6709} id \u{4e3a} {need} \u{7684}\u{6587}\u{6863}")
                })?;
            one_part.3 = body_2.to_string();
            drop(document_2);
            let mut half_current = self.half_current.lock().unwrap();
            *half_current += 1;
            Ok((need, *half_current))
        }
        fn request_request_open(&self, path_3: &str) -> Result<(), String> {
            if path_3 == "/\u{4e0d}\u{5b58}\u{5728}" {
                return Err(format!(
                    "\u{8def}\u{5f84}\u{4e0d}\u{5b58}\u{5728}\u{ff1a}{path_3}"
                ));
            }
            self.open_passed.lock().unwrap().push(path_3.to_string());
            Ok(())
        }
    }

    fn text_value(value_2: &Value) -> String {
        value_2["content"][0]["text"]
            .as_str()
            .unwrap_or_default()
            .to_string()
    }

    #[test]
    fn manifest_inner_each_work_sentence_all_has_name_say_name_and_pair_item_line_platform_args() {
        let name_side = manifest_2();
        let work_sentence_list = name_side["tools"].as_array().unwrap();
        assert_eq!(work_sentence_list.len(), 5);
        let mut name_list: Vec<&str> = work_sentence_list
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            name_list,
            vec![
                "nota_info",
                "nota_documents",
                "nota_read",
                "nota_write",
                "nota_open"
            ]
        );
        name_list.sort_unstable();
        let get_middle = {
            let mut a = name_list.clone();
            a.dedup();
            a
        };
        assert_eq!(
            name_list, get_middle,
            "\u{5de5}\u{5177}\u{540d}\u{4e0d}\u{8bb8}\u{91cd}"
        );
        for t in work_sentence_list {
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
    fn call_not_out_name_work_sentence_is_write_one_error() {
        let zhe = TestAppHost::check_two_part();
        let error = run_one("nota_\u{4e0d}\u{5b58}\u{5728}\u{7684}", &json!({}), &zhe).unwrap_err();
        assert!(error.contains("Unknown tool"), "{error}");
    }

    #[test]
    fn info_package_out_active_dynamic_that_one_part_and_half_current() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_info", &json!({}), &zhe).unwrap();
        let t: Value = text_value(&value_2).parse().unwrap();
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
    fn documents_list_out_each_one_part_contain_position_store_parse() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_documents", &json!({}), &zhe).unwrap();
        let t: Value = text_value(&value_2).parse().unwrap();
        let list = t["documents"].as_array().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[1]["id"], 2);
        assert_eq!(
            list[1]["path"],
            Value::Null,
            "\u{672a}\u{5b58}\u{76d8}\u{7684}\u{90a3}\u{4efd} path \u{662f} null"
        );
        assert_eq!(list[1]["dirty"], true);
        assert_eq!(list[0]["path"], "/tmp/\u{7532}.md");
    }

    #[test]
    fn read_not_write_id_read_active_dynamic_that_one_part() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_read", &json!({}), &zhe).unwrap();
        let t: Value = text_value(&value_2).parse().unwrap();
        assert_eq!(t["id"], 2);
        assert_eq!(t["title"], "\u{4e59}");
        assert_eq!(t["text"], "");
    }

    #[test]
    fn read_write_id_read_only_define_that_one_part() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_read", &json!({ "id": 1 }), &zhe).unwrap();
        let t: Value = text_value(&value_2).parse().unwrap();
        assert_eq!(t["id"], 1);
        assert_eq!(t["text"], "\u{7b2c}\u{4e00}\u{7bc7}");
    }

    #[test]
    fn read_read_not_to_that_one_part_is_work_sentence_error_not_is_write_one_error() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_read", &json!({ "id": 99 }), &zhe).unwrap();
        assert_eq!(value_2["isError"], true);
        assert!(text_value(&value_2).contains("99"), "\u{90a3}\u{53e5}\u{8bdd}\u{91cc}\u{5f97}\u{6709}\u{5b83}\u{8981}\u{7684}\u{90a3}\u{4e2a} id");
    }

    #[test]
    fn id_write_error_old_package_error_not_extract() {
        let zhe = TestAppHost::check_two_part();
        for broken in [
            json!({ "id": "1" }),
            json!({ "id": -1 }),
            json!({ "id": 1.5 }),
        ] {
            let value_2 = run_one("nota_read", &broken, &zhe).unwrap();
            assert_eq!(
                value_2["isError"], true,
                "{broken} \u{8be5}\u{88ab}\u{6321}\u{4e0b}"
            );
            assert!(
                text_value(&value_2).contains("id"),
                "{}",
                text_value(&value_2)
            );
        }
    }

    #[test]
    fn raw_results_are_not_mcp_envelopes() {
        let host = TestAppHost::check_two_part();
        let value = run_tool_raw("nota_documents", &json!({}), &host).unwrap();
        assert!(value.get("documents").is_some());
        assert!(value.get("content").is_none());
    }

    #[test]
    fn write_real_replace_body_and_package_new_half_current() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one(
            "nota_write",
            &json!({ "text": "\u{6539}\u{8fc7}\u{7684}\u{4e59}" }),
            &zhe,
        )
        .unwrap();
        let t: Value = text_value(&value_2).parse().unwrap();
        assert_eq!(t["id"], 2);
        assert_eq!(t["revision"], 8);
        assert_eq!(t["chars"], 4);

        let read_return = run_one("nota_read", &json!({ "id": 2 }), &zhe).unwrap();
        let t2: Value = text_value(&read_return).parse().unwrap();
        assert_eq!(t2["text"], "\u{6539}\u{8fc7}\u{7684}\u{4e59}");
    }

    #[test]
    fn write_few_text_is_work_sentence_error() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_write", &json!({}), &zhe).unwrap();
        assert_eq!(value_2["isError"], true);
        assert!(text_value(&value_2).contains("text"));
        let value_2 = run_one("nota_write", &json!({ "text": 5 }), &zhe).unwrap();
        assert_eq!(value_2["isError"], true);
    }

    #[test]
    fn open_handle_path_call_give_speed_main() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one("nota_open", &json!({ "path": "/tmp/\u{65b0}.md" }), &zhe).unwrap();
        assert_eq!(value_2["isError"], false);
        assert_eq!(
            zhe.open_passed.lock().unwrap().as_slice(),
            ["/tmp/\u{65b0}.md"]
        );
    }

    #[test]
    fn open_path_not_at_old_is_work_sentence_error() {
        let zhe = TestAppHost::check_two_part();
        let value_2 = run_one(
            "nota_open",
            &json!({ "path": "/\u{4e0d}\u{5b58}\u{5728}" }),
            &zhe,
        )
        .unwrap();
        assert_eq!(value_2["isError"], true);
        assert!(
            text_value(&value_2).contains("/\u{4e0d}\u{5b58}\u{5728}"),
            "{}",
            text_value(&value_2)
        );
        assert!(
            zhe.open_passed.lock().unwrap().is_empty(),
            "\u{9519}\u{4e86}\u{5c31}\u{4e0d}\u{8be5}\u{518d}\u{5f80}\u{4e0b}\u{53d1}"
        );
    }

    #[test]
    fn open_empty_path_and_missing_path_all_when_lower() {
        let zhe = TestAppHost::check_two_part();
        for broken in [json!({ "path": "   " }), json!({}), json!({ "path": 7 })] {
            let value_2 = run_one("nota_open", &broken, &zhe).unwrap();
            assert_eq!(
                value_2["isError"], true,
                "{broken} \u{8be5}\u{88ab}\u{6321}\u{4e0b}"
            );
        }
    }
}
