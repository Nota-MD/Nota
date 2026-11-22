use similar::{DiffTag, TextDiff};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DiffLine {
    pub op: String,

    pub text: String,
}

pub const MAX_DIFF_CONTEXT: usize = 10_000;

pub fn unified_diff_2(old: &str, new: &str, upper_lower_text: usize) -> Vec<DiffLine> {
    let old_line = cut_line(old);
    let new_line = cut_line(new);

    if old_line.is_empty() && new_line.is_empty() {
        return Vec::new();
    }

    let upper_lower_text = upper_lower_text.min(MAX_DIFF_CONTEXT);

    let check_one = TextDiff::from_slices(&old_line, &new_line);
    let mut result_3: Vec<DiffLine> = Vec::new();

    for group in check_one.grouped_ops(upper_lower_text) {
        if !group.iter().any(|o| o.tag() != DiffTag::Equal) {
            continue;
        }

        let old_start = group.first().map_or(0, |o| o.old_range().start);
        let new_start = group.first().map_or(0, |o| o.new_range().start);
        let old_data: usize = group.iter().map(|o| o.old_range().len()).sum();
        let new_data: usize = group.iter().map(|o| o.new_range().len()).sum();
        result_3.push(DiffLine {
            op: "hunk".to_owned(),

            text: format!(
                "@@ -{} +{} @@",
                half_edit(old_start, old_data),
                half_edit(new_start, new_data)
            ),
        });

        for op in &group {
            match op.tag() {
                DiffTag::Equal => derive(&mut result_3, "ctx", &old_line, op.old_range()),
                DiffTag::Delete => derive(&mut result_3, "del", &old_line, op.old_range()),
                DiffTag::Insert => derive(&mut result_3, "add", &new_line, op.new_range()),
                DiffTag::Replace => {
                    derive(&mut result_3, "del", &old_line, op.old_range());
                    derive(&mut result_3, "add", &new_line, op.new_range());
                }
            }
        }
    }

    result_3
}

fn half_edit(start: usize, data: usize) -> String {
    match data {
        0 => format!("{start},0"),
        1 => format!("{}", start + 1),
        data => format!("{},{}", start + 1, data),
    }
}

fn cut_line(text_2: &str) -> Vec<&str> {
    text_2
        .lines()
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect()
}

fn derive(
    result_3: &mut Vec<DiffLine>,
    op: &str,
    line_list: &[&str],
    reverse_position: std::ops::Range<usize>,
) {
    for i in reverse_position {
        result_3.push(DiffLine {
            op: op.to_owned(),
            text: line_list[i].to_owned(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(op: &str, text: &str) -> DiffLine {
        DiffLine {
            op: op.into(),
            text: text.into(),
        }
    }

    #[test]
    fn pure_check_into() {
        assert_eq!(
            unified_diff_2("\u{4e00}\n\u{4e09}\n", "\u{4e00}\n\u{4e8c}\n\u{4e09}\n", 3),
            vec![
                line("hunk", "@@ -1,2 +1,3 @@"),
                line("ctx", "\u{4e00}"),
                line("add", "\u{4e8c}"),
                line("ctx", "\u{4e09}"),
            ]
        );
    }

    #[test]
    fn pure_delete() {
        assert_eq!(
            unified_diff_2("\u{4e00}\n\u{4e8c}\n\u{4e09}\n", "\u{4e00}\n\u{4e09}\n", 3),
            vec![
                line("hunk", "@@ -1,3 +1,2 @@"),
                line("ctx", "\u{4e00}"),
                line("del", "\u{4e8c}"),
                line("ctx", "\u{4e09}"),
            ]
        );
    }

    #[test]
    fn one_line_replace_success_one_line_segment_header_is_segment_that() {
        assert_eq!(
            unified_diff_2(
                "\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n",
                "\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n",
                3
            ),
            vec![
                line("hunk", "@@ -1 +1 @@"),
                line(
                    "del",
                    "\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}"
                ),
                line("add", "\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}"),
            ]
        );
    }

    #[test]
    fn one_sample_two_part_give_empty_table() {
        assert!(unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\n\u{4e59}\n", 3).is_empty());
        assert!(
            unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\n\u{4e59}\n", 0).is_empty(),
            "\u{4e0a}\u{4e0b}\u{6587} 0 \u{4e5f}\u{4e0d}\u{8bb8}\u{6324}\u{51fa}\u{7a7a}\u{6bb5}\u{5934}"
        );
    }

    #[test]
    fn empty_enter_empty_out_not_create_empty_segment_header() {
        assert!(unified_diff_2("", "", 3).is_empty());
        assert!(unified_diff_2("", "", 0).is_empty());

        assert_eq!(
            unified_diff_2("", "\u{7532}\n\u{4e59}\n", 3),
            vec![
                line("hunk", "@@ -0,0 +1,2 @@"),
                line("add", "\u{7532}"),
                line("add", "\u{4e59}"),
            ]
        );

        assert_eq!(
            unified_diff_2("\u{7532}\n", "", 3),
            vec![line("hunk", "@@ -1 +0,0 @@"), line("del", "\u{7532}")]
        );
    }

    #[test]
    fn receive_position_replace_line_check_not_out_one_line() {
        assert!(unified_diff_2("\u{7532}\n", "\u{7532}", 3).is_empty());
        assert!(unified_diff_2("\u{7532}", "\u{7532}\n", 3).is_empty());

        assert_eq!(
            unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\n\n\u{4e59}\n", 3),
            vec![
                line("hunk", "@@ -1,2 +1,3 @@"),
                line("ctx", "\u{7532}"),
                line("add", ""),
                line("ctx", "\u{4e59}"),
            ]
        );
    }

    #[test]
    fn crlf_not_give_line_position_stream_lower_return_carrier() {
        assert_eq!(
            unified_diff_2("\u{7532}\r\n\u{4e59}\r\n", "\u{7532}\r\n\u{4e19}\r\n", 3),
            vec![
                line("hunk", "@@ -1,2 +1,2 @@"),
                line("ctx", "\u{7532}"),
                line("del", "\u{4e59}"),
                line("add", "\u{4e19}"),
            ],
            "`\\r` \u{4e0d}\u{6390}\u{7684}\u{8bdd}\u{ff0c}\u{754c}\u{9762}\u{4e0a}\u{6bcf}\u{884c}\u{884c}\u{5c3e}\u{591a}\u{4e00}\u{4e2a}\u{65b9}\u{5757}"
        );

        assert!(unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\r\n\u{4e59}\r\n", 3).is_empty());
    }

    #[test]
    fn upper_lower_text_zero_and_three_is_two_part_not_same_segment_header() {
        let old = "1\n2\n3\n4\n5\n";
        let new = "1\n2\nX\n4\n5\n";

        assert_eq!(
            unified_diff_2(old, new, 3),
            vec![
                line("hunk", "@@ -1,5 +1,5 @@"),
                line("ctx", "1"),
                line("ctx", "2"),
                line("del", "3"),
                line("add", "X"),
                line("ctx", "4"),
                line("ctx", "5"),
            ]
        );

        assert_eq!(
            unified_diff_2(old, new, 0),
            vec![
                line("hunk", "@@ -3 +3 @@"),
                line("del", "3"),
                line("add", "X")
            ]
        );
    }

    #[test]
    fn only_has_one_line_not_same() {
        assert_eq!(
            unified_diff_2("\u{7532}", "\u{4e59}", 3),
            vec![
                line("hunk", "@@ -1 +1 @@"),
                line("del", "\u{7532}"),
                line("add", "\u{4e59}")
            ]
        );
    }

    #[test]
    fn source_two_out_change_is_two_segment_header() {
        let old = "\u{7b2c}\u{4e00}\u{7ae0}\n\u{7b2c}\u{4e00}\u{53e5}\n\u{7b2c}\u{4e8c}\u{53e5}\n\u{7b2c}\u{4e09}\u{53e5}\n\u{7b2c}\u{56db}\u{53e5}\n\u{7b2c}\u{4e94}\u{53e5}\n\u{7b2c}\u{516d}\u{53e5}\n\u{7b2c}\u{4e03}\u{53e5}\n\u{7b2c}\u{516b}\u{53e5}\n\u{7b2c}\u{4e5d}\u{53e5}\n\u{7b2c}\u{5341}\u{53e5}\n";
        let new = "\u{7b2c}\u{4e00}\u{7ae0}\n\u{5f00}\u{5934}\u{4e00}\u{53e5}\n\u{7b2c}\u{4e8c}\u{53e5}\n\u{7b2c}\u{4e09}\u{53e5}\n\u{7b2c}\u{56db}\u{53e5}\n\u{7b2c}\u{4e94}\u{53e5}\n\u{7b2c}\u{516d}\u{53e5}\n\u{7b2c}\u{4e03}\u{53e5}\n\u{7b2c}\u{516b}\u{53e5}\n\u{7b2c}\u{4e5d}\u{53e5}\n\u{6536}\u{5c3e}\u{4e00}\u{53e5}\n";

        let result_3 = unified_diff_2(old, new, 3);
        assert_eq!(
            result_3
                .iter()
                .filter(|l| l.op == "hunk")
                .map(|l| l.text.as_str())
                .collect::<Vec<_>>(),
            vec!["@@ -1,5 +1,5 @@", "@@ -8,4 +8,4 @@"],
            "\u{7a7a}\u{9699}\u{6709} 8 \u{884c} > 2\u{d7}3\u{ff0c}\u{5207}\u{4e24}\u{6bb5}\u{ff1a}{:?}",
            result_3
        );
        assert_eq!(
            result_3.len(),
            13,
            "\u{7b2c}\u{4e00}\u{6bb5} 1+6 \u{884c}\u{3001}\u{7b2c}\u{4e8c}\u{6bb5} 1+5 \u{884c}"
        );

        assert_eq!(
            result_3[7..].to_vec(),
            vec![
                line("hunk", "@@ -8,4 +8,4 @@"),
                line("ctx", "\u{7b2c}\u{4e03}\u{53e5}"),
                line("ctx", "\u{7b2c}\u{516b}\u{53e5}"),
                line("ctx", "\u{7b2c}\u{4e5d}\u{53e5}"),
                line("del", "\u{7b2c}\u{5341}\u{53e5}"),
                line("add", "\u{6536}\u{5c3e}\u{4e00}\u{53e5}"),
            ],
            "\u{6574}\u{4efd}\u{ff1a}{:?}",
            result_3
        );
    }

    #[test]
    fn ai_enter_two_out_change_and_success_one_segment() {
        let result_3 = unified_diff_2(
            "\u{7532}\n\u{4e59}\n\u{4e19}\n\u{4e01}\n",
            "\u{6539}\u{7532}\n\u{4e59}\n\u{4e19}\n\u{6539}\u{4e01}\n",
            3,
        );
        assert_eq!(
            result_3.iter().filter(|l| l.op == "hunk").count(),
            1,
            "\u{8be5}\u{5e76}\u{6210}\u{4e00}\u{6bb5}\u{ff1a}{:?}",
            result_3
        );
        assert_eq!(
            result_3[0],
            line("hunk", "@@ -1,4 +1,4 @@"),
            "\u{5e76}\u{8d77}\u{6765}\u{4e4b}\u{540e}\u{884c}\u{53f7}\u{662f}\u{6574}\u{7bc7}\u{7684}\u{ff1a}{:?}",
            result_3
        );
    }

    #[test]
    fn text_inner_not_contain_line_receive_table_record() {
        assert_eq!(
            unified_diff_2("+ \u{8fd9}\u{4e00}\u{884c}\u{4ee5}\u{52a0}\u{53f7}\u{5f00}\u{5934}\n-- \u{5206}\u{9694}\u{7ebf}\n", "", 3),
            vec![
                line("hunk", "@@ -1,2 +0,0 @@"),
                line("del", "+ \u{8fd9}\u{4e00}\u{884c}\u{4ee5}\u{52a0}\u{53f7}\u{5f00}\u{5934}"),
                line("del", "-- \u{5206}\u{9694}\u{7ebf}"),
            ]
        );
    }

    #[test]
    fn four_character_surface_two_and_before_segment_pair_start() {
        let result_3 = unified_diff_2(
            "\u{4e00}\n\u{4e8c}\n\u{4e09}\n",
            "\u{4e00}\n\u{6539}\n\u{4e09}\n",
            3,
        );
        let check_passed: Vec<&str> = result_3.iter().map(|l| l.op.as_str()).collect();
        assert_eq!(check_passed, vec!["hunk", "ctx", "del", "add", "ctx"]);
        for op in check_passed {
            assert!(
                ["del", "add", "ctx", "hunk"].contains(&op),
                "`{op}` \u{4e0d}\u{5728}\u{524d}\u{7aef}\u{8ba4}\u{5f97}\u{7684}\u{5b57}\u{9762}\u{91cf}\u{91cc}\u{ff08}\u{90a3}\u{8fb9}\u{4f1a}\u{9759}\u{9ed8}\u{753b}\u{6210}\u{7eff}\u{7684}\u{ff09}"
            );
        }
    }

    #[test]
    fn segment_header_is_validate_line_source_sample() {
        let result_3 = unified_diff_2("\u{4e00}\n\u{4e8c}\n", "\u{4e00}\n\u{6539}\n", 3);
        assert_eq!(result_3[0].op, "hunk");
        assert!(result_3[0].text.starts_with("@@ -"), "{}", result_3[0].text);
        assert!(result_3[0].text.ends_with(" @@"), "{}", result_3[0].text);
    }

    #[test]
    fn upper_lower_text_give_to_field_upper_page_not_click() {
        assert_eq!(
            unified_diff_2("\u{4e00}\n\u{4e8c}\n", "\u{4e00}\n\u{6539}\n", usize::MAX),
            vec![
                line("hunk", "@@ -1,2 +1,2 @@"),
                line("ctx", "\u{4e00}"),
                line("del", "\u{4e8c}"),
                line("add", "\u{6539}"),
            ]
        );
    }
}
