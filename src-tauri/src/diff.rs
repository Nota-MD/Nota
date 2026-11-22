use similar::{DiffTag, TextDiff};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DiffLine {
    pub op: String,

    pub text: String,
}

pub const MAX_DIFF_CONTEXT: usize = 10_000;

pub fn unified_diff_2(jiu: &str, xin: &str, shang_xia_wen: usize) -> Vec<DiffLine> {
    let jiu_xing = qie_xing(jiu);
    let xin_xing = qie_xing(xin);

    if jiu_xing.is_empty() && xin_xing.is_empty() {
        return Vec::new();
    }

    let shang_xia_wen = shang_xia_wen.min(MAX_DIFF_CONTEXT);

    let cha_yi = TextDiff::from_slices(&jiu_xing, &xin_xing);
    let mut result_3: Vec<DiffLine> = Vec::new();

    for zu in cha_yi.grouped_ops(shang_xia_wen) {
        if !zu.iter().any(|o| o.tag() != DiffTag::Equal) {
            continue;
        }

        let jiu_qi = zu.first().map_or(0, |o| o.old_range().start);
        let xin_qi = zu.first().map_or(0, |o| o.new_range().start);
        let jiu_shu: usize = zu.iter().map(|o| o.old_range().len()).sum();
        let xin_shu: usize = zu.iter().map(|o| o.new_range().len()).sum();
        result_3.push(DiffLine {
            op: "hunk".to_owned(),

            text: format!(
                "@@ -{} +{} @@",
                ban_bian(jiu_qi, jiu_shu),
                ban_bian(xin_qi, xin_shu)
            ),
        });

        for op in &zu {
            match op.tag() {
                DiffTag::Equal => tui(&mut result_3, "ctx", &jiu_xing, op.old_range()),
                DiffTag::Delete => tui(&mut result_3, "del", &jiu_xing, op.old_range()),
                DiffTag::Insert => tui(&mut result_3, "add", &xin_xing, op.new_range()),
                DiffTag::Replace => {
                    tui(&mut result_3, "del", &jiu_xing, op.old_range());
                    tui(&mut result_3, "add", &xin_xing, op.new_range());
                }
            }
        }
    }

    result_3
}

fn ban_bian(qi: usize, shu: usize) -> String {
    match shu {
        0 => format!("{qi},0"),
        1 => format!("{}", qi + 1),
        shu => format!("{},{}", qi + 1, shu),
    }
}

fn qie_xing(text_2: &str) -> Vec<&str> {
    text_2
        .lines()
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect()
}

fn tui(result_3: &mut Vec<DiffLine>, op: &str, xing_men: &[&str], fan_wei: std::ops::Range<usize>) {
    for i in fan_wei {
        result_3.push(DiffLine {
            op: op.to_owned(),
            text: xing_men[i].to_owned(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn xing(op: &str, text: &str) -> DiffLine {
        DiffLine {
            op: op.into(),
            text: text.into(),
        }
    }

    #[test]
    fn chun_cha_ru() {
        assert_eq!(
            unified_diff_2("\u{4e00}\n\u{4e09}\n", "\u{4e00}\n\u{4e8c}\n\u{4e09}\n", 3),
            vec![
                xing("hunk", "@@ -1,2 +1,3 @@"),
                xing("ctx", "\u{4e00}"),
                xing("add", "\u{4e8c}"),
                xing("ctx", "\u{4e09}"),
            ]
        );
    }

    #[test]
    fn chun_delete() {
        assert_eq!(
            unified_diff_2("\u{4e00}\n\u{4e8c}\n\u{4e09}\n", "\u{4e00}\n\u{4e09}\n", 3),
            vec![
                xing("hunk", "@@ -1,3 +1,2 @@"),
                xing("ctx", "\u{4e00}"),
                xing("del", "\u{4e8c}"),
                xing("ctx", "\u{4e09}"),
            ]
        );
    }

    #[test]
    fn yi_xing_huan_cheng_yi_xing_de_duan_tou_shi_duan_de_na_ge() {
        assert_eq!(
            unified_diff_2(
                "\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n",
                "\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n",
                3
            ),
            vec![
                xing("hunk", "@@ -1 +1 @@"),
                xing(
                    "del",
                    "\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}"
                ),
                xing("add", "\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}"),
            ]
        );
    }

    #[test]
    fn yi_yang_de_liang_fen_gei_kong_table() {
        assert!(unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\n\u{4e59}\n", 3).is_empty());
        assert!(
            unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\n\u{4e59}\n", 0).is_empty(),
            "\u{4e0a}\u{4e0b}\u{6587} 0 \u{4e5f}\u{4e0d}\u{8bb8}\u{6324}\u{51fa}\u{7a7a}\u{6bb5}\u{5934}"
        );
    }

    #[test]
    fn kong_jin_kong_chu_bu_zao_kong_duan_tou() {
        assert!(unified_diff_2("", "", 3).is_empty());
        assert!(unified_diff_2("", "", 0).is_empty());

        assert_eq!(
            unified_diff_2("", "\u{7532}\n\u{4e59}\n", 3),
            vec![
                xing("hunk", "@@ -0,0 +1,2 @@"),
                xing("add", "\u{7532}"),
                xing("add", "\u{4e59}"),
            ]
        );

        assert_eq!(
            unified_diff_2("\u{7532}\n", "", 3),
            vec![xing("hunk", "@@ -1 +0,0 @@"), xing("del", "\u{7532}")]
        );
    }

    #[test]
    fn receive_wei_huan_xing_cha_bu_chu_yi_xing() {
        assert!(unified_diff_2("\u{7532}\n", "\u{7532}", 3).is_empty());
        assert!(unified_diff_2("\u{7532}", "\u{7532}\n", 3).is_empty());

        assert_eq!(
            unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\n\n\u{4e59}\n", 3),
            vec![
                xing("hunk", "@@ -1,2 +1,3 @@"),
                xing("ctx", "\u{7532}"),
                xing("add", ""),
                xing("ctx", "\u{4e59}"),
            ]
        );
    }

    #[test]
    fn crlf_bu_gei_xing_wei_liu_xia_hui_che() {
        assert_eq!(
            unified_diff_2("\u{7532}\r\n\u{4e59}\r\n", "\u{7532}\r\n\u{4e19}\r\n", 3),
            vec![
                xing("hunk", "@@ -1,2 +1,2 @@"),
                xing("ctx", "\u{7532}"),
                xing("del", "\u{4e59}"),
                xing("add", "\u{4e19}"),
            ],
            "`\\r` \u{4e0d}\u{6390}\u{7684}\u{8bdd}\u{ff0c}\u{754c}\u{9762}\u{4e0a}\u{6bcf}\u{884c}\u{884c}\u{5c3e}\u{591a}\u{4e00}\u{4e2a}\u{65b9}\u{5757}"
        );

        assert!(unified_diff_2("\u{7532}\n\u{4e59}\n", "\u{7532}\r\n\u{4e59}\r\n", 3).is_empty());
    }

    #[test]
    fn shang_xia_wen_ling_he_san_shi_liang_fen_bu_tong_de_duan_tou() {
        let jiu = "1\n2\n3\n4\n5\n";
        let xin = "1\n2\nX\n4\n5\n";

        assert_eq!(
            unified_diff_2(jiu, xin, 3),
            vec![
                xing("hunk", "@@ -1,5 +1,5 @@"),
                xing("ctx", "1"),
                xing("ctx", "2"),
                xing("del", "3"),
                xing("add", "X"),
                xing("ctx", "4"),
                xing("ctx", "5"),
            ]
        );

        assert_eq!(
            unified_diff_2(jiu, xin, 0),
            vec![
                xing("hunk", "@@ -3 +3 @@"),
                xing("del", "3"),
                xing("add", "X")
            ]
        );
    }

    #[test]
    fn zhi_you_yi_xing_bu_tong() {
        assert_eq!(
            unified_diff_2("\u{7532}", "\u{4e59}", 3),
            vec![
                xing("hunk", "@@ -1 +1 @@"),
                xing("del", "\u{7532}"),
                xing("add", "\u{4e59}")
            ]
        );
    }

    #[test]
    fn ge_de_yuan_de_liang_chu_change_shi_liang_ge_duan_tou() {
        let jiu = "\u{7b2c}\u{4e00}\u{7ae0}\n\u{7b2c}\u{4e00}\u{53e5}\n\u{7b2c}\u{4e8c}\u{53e5}\n\u{7b2c}\u{4e09}\u{53e5}\n\u{7b2c}\u{56db}\u{53e5}\n\u{7b2c}\u{4e94}\u{53e5}\n\u{7b2c}\u{516d}\u{53e5}\n\u{7b2c}\u{4e03}\u{53e5}\n\u{7b2c}\u{516b}\u{53e5}\n\u{7b2c}\u{4e5d}\u{53e5}\n\u{7b2c}\u{5341}\u{53e5}\n";
        let xin = "\u{7b2c}\u{4e00}\u{7ae0}\n\u{5f00}\u{5934}\u{4e00}\u{53e5}\n\u{7b2c}\u{4e8c}\u{53e5}\n\u{7b2c}\u{4e09}\u{53e5}\n\u{7b2c}\u{56db}\u{53e5}\n\u{7b2c}\u{4e94}\u{53e5}\n\u{7b2c}\u{516d}\u{53e5}\n\u{7b2c}\u{4e03}\u{53e5}\n\u{7b2c}\u{516b}\u{53e5}\n\u{7b2c}\u{4e5d}\u{53e5}\n\u{6536}\u{5c3e}\u{4e00}\u{53e5}\n";

        let result_3 = unified_diff_2(jiu, xin, 3);
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
                xing("hunk", "@@ -8,4 +8,4 @@"),
                xing("ctx", "\u{7b2c}\u{4e03}\u{53e5}"),
                xing("ctx", "\u{7b2c}\u{516b}\u{53e5}"),
                xing("ctx", "\u{7b2c}\u{4e5d}\u{53e5}"),
                xing("del", "\u{7b2c}\u{5341}\u{53e5}"),
                xing("add", "\u{6536}\u{5c3e}\u{4e00}\u{53e5}"),
            ],
            "\u{6574}\u{4efd}\u{ff1a}{:?}",
            result_3
        );
    }

    #[test]
    fn ai_de_jin_de_liang_chu_change_bing_cheng_yi_duan() {
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
            xing("hunk", "@@ -1,4 +1,4 @@"),
            "\u{5e76}\u{8d77}\u{6765}\u{4e4b}\u{540e}\u{884c}\u{53f7}\u{662f}\u{6574}\u{7bc7}\u{7684}\u{ff1a}{:?}",
            result_3
        );
    }

    #[test]
    fn text_li_bu_han_xing_shou_biao_ji() {
        assert_eq!(
            unified_diff_2("+ \u{8fd9}\u{4e00}\u{884c}\u{4ee5}\u{52a0}\u{53f7}\u{5f00}\u{5934}\n-- \u{5206}\u{9694}\u{7ebf}\n", "", 3),
            vec![
                xing("hunk", "@@ -1,2 +0,0 @@"),
                xing("del", "+ \u{8fd9}\u{4e00}\u{884c}\u{4ee5}\u{52a0}\u{53f7}\u{5f00}\u{5934}"),
                xing("del", "-- \u{5206}\u{9694}\u{7ebf}"),
            ]
        );
    }

    #[test]
    fn si_ge_zi_mian_liang_he_qian_duan_dui_qi() {
        let result_3 = unified_diff_2(
            "\u{4e00}\n\u{4e8c}\n\u{4e09}\n",
            "\u{4e00}\n\u{6539}\n\u{4e09}\n",
            3,
        );
        let jian_guo_de: Vec<&str> = result_3.iter().map(|l| l.op.as_str()).collect();
        assert_eq!(jian_guo_de, vec!["hunk", "ctx", "del", "add", "ctx"]);
        for op in jian_guo_de {
            assert!(
                ["del", "add", "ctx", "hunk"].contains(&op),
                "`{op}` \u{4e0d}\u{5728}\u{524d}\u{7aef}\u{8ba4}\u{5f97}\u{7684}\u{5b57}\u{9762}\u{91cf}\u{91cc}\u{ff08}\u{90a3}\u{8fb9}\u{4f1a}\u{9759}\u{9ed8}\u{753b}\u{6210}\u{7eff}\u{7684}\u{ff09}"
            );
        }
    }

    #[test]
    fn duan_tou_shi_zheng_xing_yuan_yang() {
        let result_3 = unified_diff_2("\u{4e00}\n\u{4e8c}\n", "\u{4e00}\n\u{6539}\n", 3);
        assert_eq!(result_3[0].op, "hunk");
        assert!(result_3[0].text.starts_with("@@ -"), "{}", result_3[0].text);
        assert!(result_3[0].text.ends_with(" @@"), "{}", result_3[0].text);
    }

    #[test]
    fn shang_xia_wen_gei_dao_tian_shang_ye_bu_zha() {
        assert_eq!(
            unified_diff_2("\u{4e00}\n\u{4e8c}\n", "\u{4e00}\n\u{6539}\n", usize::MAX),
            vec![
                xing("hunk", "@@ -1,2 +1,2 @@"),
                xing("ctx", "\u{4e00}"),
                xing("del", "\u{4e8c}"),
                xing("add", "\u{6539}"),
            ]
        );
    }
}
