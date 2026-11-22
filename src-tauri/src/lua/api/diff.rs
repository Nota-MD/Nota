use mlua::{Lua, Table, Value};

use super::{mlua_to_nota, set};
use crate::error::NotaError;

pub const FENCE_START: &str = "```nota-diff";

pub const FENCE_END: &str = "```";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RemovedLines {
    pub delete: Vec<String>,
    pub add_2: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedReview {
    pub body_2: String,

    pub change: Vec<RemovedLines>,

    pub broken_line: usize,
}

pub fn parse_2(return_large: &str) -> ParsedReview {
    let line = cut_line(return_large);

    let mut result_3 = ParsedReview::default();
    let mut body_2: Vec<String> = Vec::new();
    let mut i = 0;

    while i < line.len() {
        if line[i].trim() == FENCE_START {
            let mut delete = Vec::new();
            let mut add_2 = Vec::new();
            i += 1;
            while i < line.len() && line[i].trim() != FENCE_END {
                match match_table_record(&line[i], '-') {
                    Some(content_2) => delete.push(content_2),
                    None => match match_table_record(&line[i], '+') {
                        Some(content_2) => add_2.push(content_2),

                        None => {
                            result_3.broken_line += 1;
                        }
                    },
                }
                i += 1;
            }

            if i < line.len() {
                i += 1;
            }

            if !delete.is_empty() || !add_2.is_empty() {
                result_3.change.push(RemovedLines { delete, add_2 });
            }
        } else {
            body_2.push(line[i].clone());
            i += 1;
        }
    }

    while body_2.first().is_some_and(|l| l.is_empty()) {
        body_2.remove(0);
    }
    while body_2.last().is_some_and(|l| l.is_empty()) {
        body_2.pop();
    }
    result_3.body_2 = body_2.join("\n");
    result_3
}

pub fn app_2(document_2: &str, change: &[RemovedLines]) -> Result<String, String> {
    if change.is_empty() {
        return Err("The change set is empty".to_owned());
    }

    let (mut line, boundary_position_has_replace_line, crlf) =
        cut_line_package_stream_boundary_position(document_2);
    let mut from = 0usize;
    let mut check_into_passed = false;

    for (n, h) in change.iter().enumerate() {
        if h.delete.is_empty() {
            line.extend(h.add_2.iter().cloned());
            check_into_passed = true;
            from = line.len();
            continue;
        }

        let at = find_link_required(&line, &h.delete, from)
            .or_else(|| find_link_required(&line, &h.delete, 0));
        let Some(at) = at else {
            return Err(format!(
                "Could not match change {} against the document text, for example `{}`",
                n + 1,
                match_segment(&h.delete[0], 30)
            ));
        };

        let mut new_line = Vec::with_capacity(line.len() + h.add_2.len());
        new_line.extend(line[..at].iter().cloned());
        new_line.extend(h.add_2.iter().cloned());
        new_line.extend(line[at + h.delete.len()..].iter().cloned());
        from = at + h.add_2.len();
        line = new_line;
    }

    let nl = if crlf { "\r\n" } else { "\n" };
    let mut out = line.join(nl);

    if (boundary_position_has_replace_line || (check_into_passed && !out.is_empty()))
        && !out.is_empty()
    {
        out.push_str(nl);
    }
    Ok(out)
}

fn match_table_record(line: &str, table_record: char) -> Option<String> {
    let mut character_2 = line.chars();
    if character_2.next() != Some(table_record) {
        return None;
    }
    let generate_lower = character_2.as_str();
    Some(
        generate_lower
            .strip_prefix(' ')
            .unwrap_or(generate_lower)
            .to_owned(),
    )
}

fn cut_line(text_2: &str) -> Vec<String> {
    text_2
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l).to_owned())
        .collect()
}

fn cut_line_package_stream_boundary_position(document_2: &str) -> (Vec<String>, bool, bool) {
    let crlf = document_2.contains("\r\n");
    let boundary_position_has_replace_line = document_2.ends_with('\n');

    let line = if document_2.is_empty() {
        Vec::new()
    } else {
        let main_question = if boundary_position_has_replace_line {
            &document_2[..document_2.len() - 1]
        } else {
            document_2
        };

        cut_line(main_question)
    };
    (line, boundary_position_has_replace_line, crlf)
}

fn find_link_required(
    line: &[String],
    need_delete: &[String],
    start_point: usize,
) -> Option<usize> {
    let m = need_delete.len();
    if m == 0 || line.len() < m {
        return None;
    }
    (start_point..=line.len() - m).find(|&i| &line[i..i + m] == need_delete)
}

fn match_segment(s: &str, upper_thread: usize) -> String {
    if s.chars().count() <= upper_thread {
        return s.to_owned();
    }
    s.chars().take(upper_thread).collect::<String>() + "\u{2026}"
}

pub const DEFAULT_CONTEXT: usize = 3;

pub fn build(lua: &Lua) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let parse = lua
        .create_function(|lua, return_large: String| {
            let r = parse_2(&return_large);
            let table_2 = lua.create_table()?;
            table_2.set("text", r.body_2)?;
            table_2.set("bad", r.broken_line)?;
            let change_list = lua.create_table()?;
            for (i, h) in r.change.iter().enumerate() {
                change_list.set(i + 1, one_out_convert_table(lua, h)?)?;
            }
            table_2.set("hunks", change_list)?;
            Ok(table_2)
        })
        .map_err(mlua_to_nota)?;
    set(t.set("parse", parse), lua)?;

    let apply = lua
        .create_function(|lua, (document_2, hunks): (String, Table)| {
            let change = table_convert_change(&hunks)?;

            match app_2(&document_2, &change) {
                Ok(new) => Ok((Value::String(lua.create_string(new)?), Value::Nil)),
                Err(reason_2) => Ok((Value::Nil, Value::String(lua.create_string(reason_2)?))),
            }
        })
        .map_err(mlua_to_nota)?;
    set(t.set("apply", apply), lua)?;

    set(
        t.set("parse_unified", super::unified_diff::build(lua)?),
        lua,
    )?;

    let make = lua
        .create_function(
            |lua, (old, new, upper_lower_text): (String, String, Option<usize>)| {
                let check_one = crate::diff::unified_diff_2(
                    &old,
                    &new,
                    upper_lower_text.unwrap_or(DEFAULT_CONTEXT),
                );
                let table_2 = lua.create_table()?;
                for (i, line) in check_one.iter().enumerate() {
                    let line_table = lua.create_table()?;

                    line_table.set("op", line.op.as_str())?;
                    line_table.set("text", line.text.as_str())?;
                    table_2.set(i + 1, line_table)?;
                }
                Ok(table_2)
            },
        )
        .map_err(mlua_to_nota)?;
    set(t.set("make", make), lua)?;

    Ok(t)
}

fn one_out_convert_table(lua: &Lua, h: &RemovedLines) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("del", lua.create_sequence_from(h.delete.iter().cloned())?)?;
    t.set("add", lua.create_sequence_from(h.add_2.iter().cloned())?)?;
    Ok(t)
}

fn table_convert_change(hunks: &Table) -> mlua::Result<Vec<RemovedLines>> {
    let mut out = Vec::new();
    for i in 1..=hunks.raw_len() {
        let Ok(item_target) = hunks.raw_get::<Table>(i) else {
            continue;
        };
        let read_one_stream = |value_2: &str| -> mlua::Result<Vec<String>> {
            let Ok(v) = item_target.raw_get::<Value>(value_2) else {
                return Ok(Vec::new());
            };
            match v {
                Value::Nil => Ok(Vec::new()),
                Value::Table(t) => {
                    let mut line = Vec::new();
                    for j in 1..=t.raw_len() {
                        line.push(t.raw_get::<String>(j)?);
                    }
                    Ok(line)
                }
                other => Err(mlua::Error::RuntimeError(format!(
                    "`hunks[{i}].{value_2}` must be an array of strings, received {}",
                    other.type_name()
                ))),
            }
        };
        out.push(RemovedLines {
            delete: read_one_stream("del")?,
            add_2: read_one_stream("add")?,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_success(return_large: &str) -> ParsedReview {
        parse_2(return_large)
    }

    #[test]
    fn one_segment_plain_same_text_add_suffix_position_one_block_change() {
        let return_large = "\u{6211}\u{628a}\u{7b2c}\u{4e8c}\u{53e5}\u{6539}\u{77ed}\u{4e86}\u{3002}\n\n```nota-diff\n- \u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n+ \u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n```\n";
        let r = parse_success(return_large);
        assert_eq!(r.body_2, "\u{6211}\u{628a}\u{7b2c}\u{4e8c}\u{53e5}\u{6539}\u{77ed}\u{4e86}\u{3002}", "\u{6b63}\u{6587}\u{8be5}\u{662f}\u{56f4}\u{680f}\u{4e4b}\u{5916}\u{90a3}\u{6bb5}\u{ff0c}\u{9996}\u{5c3e}\u{4e0d}\u{7559}\u{7a7a}\u{884c}");
        assert_eq!(r.broken_line, 0);
        assert_eq!(r.change.len(), 1);
        assert_eq!(
            r.change[0].delete,
            vec!["\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}"]
        );
        assert_eq!(
            r.change[0].add_2,
            vec!["\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}"]
        );

        let document_2 = "\u{7b2c}\u{4e00}\u{884c}\u{3002}\n\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n\u{7b2c}\u{4e09}\u{884c}\u{3002}\n";
        assert_eq!(
            app_2(document_2, &r.change).expect("\u{8fd9}\u{4e00}\u{6bb5}\u{5728}\u{6587}\u{6863}\u{91cc}\u{ff0c}\u{8be5}\u{80fd}\u{5e94}\u{7528}"),
            "\u{7b2c}\u{4e00}\u{884c}\u{3002}\n\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n\u{7b2c}\u{4e09}\u{884c}\u{3002}\n"
        );
    }

    #[test]
    fn pair_not_upper_old_validate_question_method_start_and_say_request_reason() {
        let r = parse_success("```nota-diff\n- \u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n+ \u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n```\n");
        let error = app_2("\u{5b8c}\u{5168}\u{4e0d}\u{76f8}\u{5e72}\u{7684}\u{4e00}\u{6bb5}\u{8bdd}\u{3002}\n", &r.change).expect_err("\u{6587}\u{6863}\u{91cc}\u{6ca1}\u{6709}\u{90a3}\u{884c}\u{ff0c}\u{8be5}\u{5931}\u{8d25}");
        assert!(
            error.contains("Could not match"),
            "expected a missing-text reason: {error}"
        );
    }

    #[test]
    fn not_link_required_line_not_compute_data() {
        let r = parse_success("```nota-diff\n- \u{7532}\u{3002}\n- \u{4e59}\u{3002}\n+ \u{6362}\u{4e86}\u{3002}\n```\n");
        assert!(
            app_2("\u{7532}\u{3002}\n\u{4e2d}\u{95f4}\u{5939}\u{7740}\u{522b}\u{7684}\u{3002}\n\u{4e59}\u{3002}\n", &r.change).is_err(),
            "\u{300c}\u{7532}\u{3002}\u{4e59}\u{3002}\u{300d}\u{5728}\u{6587}\u{6863}\u{91cc}\u{4e0d}\u{6328}\u{7740}\u{ff0c}\u{4e0d}\u{8be5}\u{5339}\u{914d}\u{4e0a}"
        );
    }

    #[test]
    fn only_has_add_number_old_append_add_to_text_suffix() {
        let r = parse_success(
            "```nota-diff\n+ \u{65b0}\u{52a0}\u{7684}\u{4e00}\u{884c}\u{3002}\n```\n",
        );
        assert_eq!(
            app_2("\u{6b63}\u{6587}\u{3002}\n", &r.change)
                .expect("\u{7eaf}\u{63d2}\u{5165}\u{8be5}\u{6210}\u{529f}"),
            "\u{6b63}\u{6587}\u{3002}\n\u{65b0}\u{52a0}\u{7684}\u{4e00}\u{884c}\u{3002}\n"
        );

        assert_eq!(
            app_2("", &r.change).expect("\u{7a7a}\u{6587}\u{6863}\u{8be5}\u{80fd}\u{63d2}\u{5165}"),
            "\u{65b0}\u{52a0}\u{7684}\u{4e00}\u{884c}\u{3002}\n"
        );
    }

    #[test]
    fn two_block_change_by_sequence_required_change() {
        let r = parse_success(
            "```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n\u{4e2d}\u{95f4}\u{8fd8}\u{6709}\u{8bdd}\u{8bf4}\u{3002}\n```nota-diff\n- \u{4e19}\u{3002}\n+ C\u{3002}\n```\n",
        );
        assert_eq!(
            r.body_2, "\u{4e2d}\u{95f4}\u{8fd8}\u{6709}\u{8bdd}\u{8bf4}\u{3002}",
            "\u{4e24}\u{5757}\u{4e4b}\u{95f4}\u{7684}\u{5b57}\u{662f}\u{6b63}\u{6587}"
        );
        assert_eq!(r.change.len(), 2);
        assert_eq!(
            app_2(
                "\u{7532}\u{3002}\n\u{4e59}\u{3002}\n\u{4e19}\u{3002}\n",
                &r.change
            )
            .expect("\u{4e24}\u{5757}\u{90fd}\u{8be5}\u{5e94}\u{7528}\u{4e0a}"),
            "A\u{3002}\n\u{4e59}\u{3002}\nC\u{3002}\n"
        );
    }

    #[test]
    fn sequence_required_write_reverse_page_still_can_use() {
        let r = parse_success("```nota-diff\n- \u{4e19}\u{3002}\n+ C\u{3002}\n```\n```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n");
        assert_eq!(
            app_2(
                "\u{7532}\u{3002}\n\u{4e59}\u{3002}\n\u{4e19}\u{3002}\n",
                &r.change
            )
            .expect("\u{987a}\u{5e8f}\u{53cd}\u{4e86}\u{4e5f}\u{8be5}\u{80fd}\u{5e94}\u{7528}"),
            "A\u{3002}\n\u{4e59}\u{3002}\nC\u{3002}\n"
        );
    }

    #[test]
    fn broken_line_only_data_out_incoming_not_when_change() {
        let r = parse_success("```nota-diff\n\u{8fd9}\u{91cc}\u{4e0d}\u{8be5}\u{6709}\u{5b57}\u{3002}\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n");
        assert_eq!(
            r.broken_line, 1,
            "\u{90a3}\u{4e00}\u{884c}\u{8be5}\u{88ab}\u{6570}\u{6210}\u{574f}\u{884c}"
        );
        assert_eq!(
            app_2("\u{7532}\u{3002}\n", &r.change).expect(
                "\u{574f}\u{884c}\u{4e0d}\u{8be5}\u{5f71}\u{54cd}\u{540e}\u{9762}\u{90a3}\u{5bf9}"
            ),
            "A\u{3002}\n"
        );
    }

    #[test]
    fn each_has_position_panel_old_is_plain_same_text() {
        let r = parse_success(
            "\u{8fd9}\u{6761}\u{6211}\u{4e0d}\u{7528}\u{6539}\u{6587}\u{6863}\u{3002}\n",
        );
        assert_eq!(
            r.body_2,
            "\u{8fd9}\u{6761}\u{6211}\u{4e0d}\u{7528}\u{6539}\u{6587}\u{6863}\u{3002}"
        );
        assert!(r.change.is_empty());
        assert_eq!(
            app_2("\u{539f}\u{6587}\u{3002}\n", &r.change)
                .expect_err("\u{7a7a}\u{7684}\u{6539}\u{52a8}\u{8be5}\u{88ab}\u{6321}\u{4e0b}"),
            "The change set is empty"
        );
    }

    #[test]
    fn few_write_receive_position_position_panel_page_person() {
        let r = parse_success("```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n");
        assert_eq!(
            app_2("\u{7532}\u{3002}\n", &r.change)
                .expect("\u{5c11}\u{4e2a}\u{6536}\u{5c3e}\u{4e5f}\u{8be5}\u{8ba4}"),
            "A\u{3002}\n"
        );
    }

    #[test]
    fn empty_change_block_when_each_write() {
        let r = parse_success("\u{4e0d}\u{7528}\u{6539}\u{3002}\n\n```nota-diff\n```\n");
        assert_eq!(r.body_2, "\u{4e0d}\u{7528}\u{6539}\u{3002}");
        assert!(r.change.is_empty());
    }

    #[test]
    fn crlf_document_page_can_change_cut_not_change_style() {
        let r = parse_success("```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n");
        assert_eq!(
            app_2("\u{7532}\u{3002}\r\n\u{4e59}\u{3002}\r\n", &r.change).expect("CRLF \u{6587}\u{6863}\u{4e5f}\u{8be5}\u{80fd}\u{6539}"),
            "A\u{3002}\r\n\u{4e59}\u{3002}\r\n",
            "\u{6539}\u{5b8c}\u{8981}\u{4fdd}\u{6301}\u{539f}\u{6765}\u{7684} CRLF\u{ff0c}\u{4e0d}\u{80fd}\u{628a}\u{6574}\u{7bc7}\u{6587}\u{6863}\u{7edf}\u{4e00}\u{6210} LF"
        );

        assert_eq!(
            app_2("\u{7532}\u{3002}\n\u{4e59}\u{3002}\n", &r.change).unwrap(),
            "A\u{3002}\n\u{4e59}\u{3002}\n"
        );
    }

    #[test]
    fn pure_delete_and_delete_suffix_position_line() {
        let r = parse_success("```nota-diff\n- \u{4e59}\u{3002}\n```\n");
        assert_eq!(
            app_2(
                "\u{7532}\u{3002}\n\u{4e59}\u{3002}\n\u{4e19}\u{3002}\n",
                &r.change
            )
            .unwrap(),
            "\u{7532}\u{3002}\n\u{4e19}\u{3002}\n"
        );
        assert_eq!(
            app_2("\u{7532}\u{3002}\n\u{4e59}\u{3002}\n", &r.change).unwrap(),
            "\u{7532}\u{3002}\n"
        );

        assert_eq!(
            app_2("\u{7532}\u{3002}\n\u{4e59}\u{3002}", &r.change).unwrap(),
            "\u{7532}\u{3002}"
        );
    }

    #[test]
    fn delete_empty_line() {
        let r = parse_success("```nota-diff\n-\n```\n");
        assert_eq!(
            r.change[0].delete,
            vec![""],
            "`-` \u{5355}\u{72ec}\u{4e00}\u{884c} = \u{5220}\u{4e00}\u{4e2a}\u{7a7a}\u{884c}"
        );
        assert_eq!(
            app_2("\u{7532}\u{3002}\n\n\u{4e59}\u{3002}\n", &r.change).unwrap(),
            "\u{7532}\u{3002}\n\u{4e59}\u{3002}\n"
        );
    }

    fn make(lua: &Lua) -> mlua::Function {
        let t = build(lua)
            .expect("\u{7eaf}\u{51fd}\u{6570}\u{8868}\u{4e0d}\u{8be5}\u{88c5}\u{4e0d}\u{4e0a}");
        t.get("make")
            .expect("`make` \u{8981}\u{6302}\u{5728} `nota.diff` \u{4e0b}\u{9762}")
    }

    #[test]
    fn make_give_out_same_one_is_main_line_check_one() {
        let lua = Lua::new();
        let f = make(&lua);
        let line_list: Table = f
            .call(("\u{4e00}\n\u{4e09}\n", "\u{4e00}\n\u{4e8c}\n\u{4e09}\n"))
            .expect("\u{8c03}\u{7528}\u{4e0d}\u{8be5}\u{51fa}\u{9519}");
        assert_eq!(
            line_list.raw_len(),
            4,
            "\u{4e00}\u{6bb5}\u{5934} + \u{4e09}\u{884c}"
        );

        let segment_header: Table = line_list.get(1).unwrap();
        assert_eq!(segment_header.get::<String>("op").unwrap(), "hunk");
        assert_eq!(
            segment_header.get::<String>("text").unwrap(),
            "@@ -1,2 +1,3 @@"
        );

        let middle_check: Table = line_list.get(3).unwrap();
        assert_eq!(middle_check.get::<String>("op").unwrap(), "add");
        assert_eq!(middle_check.get::<String>("text").unwrap(), "\u{4e8c}");
    }

    #[test]
    fn make_generate_ignore_upper_lower_text_is_is_default_value_three() {
        let lua = Lua::new();
        let f = make(&lua);
        let old = "1\n2\n3\n4\n5\n";
        let new = "1\n2\nX\n4\n5\n";

        let generate_ignore: Table = f
            .call((old, new))
            .expect("\u{7b2c}\u{4e09}\u{4e2a}\u{53c2}\u{6570}\u{53ef}\u{4ee5}\u{4e0d}\u{7ed9}");
        let give: Table = f
            .call((old, new, 0usize))
            .expect("\u{7ed9}\u{4e86}\u{5c31}\u{7528}\u{7ed9}\u{7684}");
        assert_eq!(generate_ignore.raw_len(), 7, "\u{6bb5}\u{5934} + \u{4e0a}\u{4e0b}\u{5404}\u{4e24}\u{884c} + \u{4e00}\u{5220}\u{4e00}\u{52a0}");
        assert_eq!(give.raw_len(), 3, "\u{4e0a}\u{4e0b}\u{6587} 0\u{ff1a}\u{53ea}\u{5269}\u{6bb5}\u{5934}\u{548c}\u{4e00}\u{5220}\u{4e00}\u{52a0}");

        let segment_header = |t: &Table| t.get::<Table>(1).unwrap().get::<String>("text").unwrap();
        assert_eq!(
            segment_header(&generate_ignore),
            "@@ -1,5 +1,5 @@",
            "\u{9ed8}\u{8ba4}\u{90a3}\u{4e2a} 3 \u{5c31}\u{662f} `git diff -U3` \u{7684}\u{90a3}\u{4e2a} 3"
        );
        assert_eq!(
            segment_header(&give),
            "@@ -3 +3 @@",
            "\u{884c}\u{53f7}\u{8ddf}\u{7740}\u{4e0a}\u{4e0b}\u{6587}\u{53d8}"
        );
    }

    #[test]
    fn make_each_change_is_give_empty_table() {
        let lua = Lua::new();
        let f = make(&lua);
        let each_change: Table = f.call(("\u{7532}\n", "\u{7532}\n")).expect("\u{4e24}\u{8fb9}\u{4e00}\u{6837}\u{662f}\u{6b63}\u{5e38}\u{7ed3}\u{679c}\u{ff0c}\u{4e0d}\u{662f}\u{9519}\u{8bef}");
        assert_eq!(
            each_change.raw_len(),
            0,
            "\u{6ca1}\u{6539}\u{52a8}\u{5c31}\u{662f}\u{7a7a}\u{8868}"
        );
        let all_empty: Table = f.call(("", "")).expect("\u{7a7a}\u{8fdb}\u{7a7a}\u{51fa}");
        assert_eq!(
            all_empty.raw_len(),
            0,
            "\u{4e0d}\u{8bb8}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{4e2a}\u{7a7a}\u{6bb5}\u{5934}"
        );
    }
}
