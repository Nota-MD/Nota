use mlua::{Lua, Table, Value};

use super::{mlua_to_nota, set};
use crate::error::NotaError;

pub const FENCE_START: &str = "```nota-diff";

pub const FENCE_END: &str = "```";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RemovedLines {
    pub shan: Vec<String>,
    pub jia_2: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedReview {
    pub body_2: String,

    pub change: Vec<RemovedLines>,

    pub huai_xing: usize,
}

pub fn parse_2(hui_da: &str) -> ParsedReview {
    let xing = qie_xing(hui_da);

    let mut result_3 = ParsedReview::default();
    let mut body_2: Vec<String> = Vec::new();
    let mut i = 0;

    while i < xing.len() {
        if xing[i].trim() == FENCE_START {
            let mut shan = Vec::new();
            let mut jia_2 = Vec::new();
            i += 1;
            while i < xing.len() && xing[i].trim() != FENCE_END {
                match qia_biao_ji(&xing[i], '-') {
                    Some(content_2) => shan.push(content_2),
                    None => match qia_biao_ji(&xing[i], '+') {
                        Some(content_2) => jia_2.push(content_2),

                        None => {
                            result_3.huai_xing += 1;
                        }
                    },
                }
                i += 1;
            }

            if i < xing.len() {
                i += 1;
            }

            if !shan.is_empty() || !jia_2.is_empty() {
                result_3.change.push(RemovedLines { shan, jia_2 });
            }
        } else {
            body_2.push(xing[i].clone());
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

    let (mut xing, jie_wei_you_huan_xing, crlf) = qie_xing_bao_liu_jie_wei(document_2);
    let mut from = 0usize;
    let mut cha_ru_guo = false;

    for (n, h) in change.iter().enumerate() {
        if h.shan.is_empty() {
            xing.extend(h.jia_2.iter().cloned());
            cha_ru_guo = true;
            from = xing.len();
            continue;
        }

        let at = zhao_lian_xu(&xing, &h.shan, from).or_else(|| zhao_lian_xu(&xing, &h.shan, 0));
        let Some(at) = at else {
            return Err(format!(
                "Could not match change {} against the document text, for example `{}`",
                n + 1,
                qia_duan(&h.shan[0], 30)
            ));
        };

        let mut xin_xing = Vec::with_capacity(xing.len() + h.jia_2.len());
        xin_xing.extend(xing[..at].iter().cloned());
        xin_xing.extend(h.jia_2.iter().cloned());
        xin_xing.extend(xing[at + h.shan.len()..].iter().cloned());
        from = at + h.jia_2.len();
        xing = xin_xing;
    }

    let nl = if crlf { "\r\n" } else { "\n" };
    let mut out = xing.join(nl);

    if (jie_wei_you_huan_xing || (cha_ru_guo && !out.is_empty())) && !out.is_empty() {
        out.push_str(nl);
    }
    Ok(out)
}

fn qia_biao_ji(xing: &str, biao_ji: char) -> Option<String> {
    let mut zi_2 = xing.chars();
    if zi_2.next() != Some(biao_ji) {
        return None;
    }
    let sheng_xia = zi_2.as_str();
    Some(sheng_xia.strip_prefix(' ').unwrap_or(sheng_xia).to_owned())
}

fn qie_xing(text_2: &str) -> Vec<String> {
    text_2
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l).to_owned())
        .collect()
}

fn qie_xing_bao_liu_jie_wei(document_2: &str) -> (Vec<String>, bool, bool) {
    let crlf = document_2.contains("\r\n");
    let jie_wei_you_huan_xing = document_2.ends_with('\n');

    let xing = if document_2.is_empty() {
        Vec::new()
    } else {
        let zhu_ti = if jie_wei_you_huan_xing {
            &document_2[..document_2.len() - 1]
        } else {
            document_2
        };

        qie_xing(zhu_ti)
    };
    (xing, jie_wei_you_huan_xing, crlf)
}

fn zhao_lian_xu(xing: &[String], yao_shan: &[String], qi_dian: usize) -> Option<usize> {
    let m = yao_shan.len();
    if m == 0 || xing.len() < m {
        return None;
    }
    (qi_dian..=xing.len() - m).find(|&i| &xing[i..i + m] == yao_shan)
}

fn qia_duan(s: &str, shang_xian: usize) -> String {
    if s.chars().count() <= shang_xian {
        return s.to_owned();
    }
    s.chars().take(shang_xian).collect::<String>() + "\u{2026}"
}

pub const DEFAULT_CONTEXT: usize = 3;

pub fn build(lua: &Lua) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let parse = lua
        .create_function(|lua, hui_da: String| {
            let r = parse_2(&hui_da);
            let table_2 = lua.create_table()?;
            table_2.set("text", r.body_2)?;
            table_2.set("bad", r.huai_xing)?;
            let change_men = lua.create_table()?;
            for (i, h) in r.change.iter().enumerate() {
                change_men.set(i + 1, yi_chu_zhuan_table(lua, h)?)?;
            }
            table_2.set("hunks", change_men)?;
            Ok(table_2)
        })
        .map_err(mlua_to_nota)?;
    set(t.set("parse", parse), lua)?;

    let apply = lua
        .create_function(|lua, (document_2, hunks): (String, Table)| {
            let change = table_zhuan_change(&hunks)?;

            match app_2(&document_2, &change) {
                Ok(xin) => Ok((Value::String(lua.create_string(xin)?), Value::Nil)),
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
            |lua, (jiu, xin, shang_xia_wen): (String, String, Option<usize>)| {
                let cha_yi = crate::diff::unified_diff_2(
                    &jiu,
                    &xin,
                    shang_xia_wen.unwrap_or(DEFAULT_CONTEXT),
                );
                let table_2 = lua.create_table()?;
                for (i, xing) in cha_yi.iter().enumerate() {
                    let xing_table = lua.create_table()?;

                    xing_table.set("op", xing.op.as_str())?;
                    xing_table.set("text", xing.text.as_str())?;
                    table_2.set(i + 1, xing_table)?;
                }
                Ok(table_2)
            },
        )
        .map_err(mlua_to_nota)?;
    set(t.set("make", make), lua)?;

    Ok(t)
}

fn yi_chu_zhuan_table(lua: &Lua, h: &RemovedLines) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("del", lua.create_sequence_from(h.shan.iter().cloned())?)?;
    t.set("add", lua.create_sequence_from(h.jia_2.iter().cloned())?)?;
    Ok(t)
}

fn table_zhuan_change(hunks: &Table) -> mlua::Result<Vec<RemovedLines>> {
    let mut out = Vec::new();
    for i in 1..=hunks.raw_len() {
        let Ok(tiao_mu) = hunks.raw_get::<Table>(i) else {
            continue;
        };
        let read_yi_chuan = |jian_2: &str| -> mlua::Result<Vec<String>> {
            let Ok(v) = tiao_mu.raw_get::<Value>(jian_2) else {
                return Ok(Vec::new());
            };
            match v {
                Value::Nil => Ok(Vec::new()),
                Value::Table(t) => {
                    let mut xing = Vec::new();
                    for j in 1..=t.raw_len() {
                        xing.push(t.raw_get::<String>(j)?);
                    }
                    Ok(xing)
                }
                other => Err(mlua::Error::RuntimeError(format!(
                    "`hunks[{i}].{jian_2}` must be an array of strings, received {}",
                    other.type_name()
                ))),
            }
        };
        out.push(RemovedLines {
            shan: read_yi_chuan("del")?,
            jia_2: read_yi_chuan("add")?,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_cheng(hui_da: &str) -> ParsedReview {
        parse_2(hui_da)
    }

    #[test]
    fn yi_duan_pu_tong_text_jia_mo_wei_yi_kuai_change() {
        let hui_da = "\u{6211}\u{628a}\u{7b2c}\u{4e8c}\u{53e5}\u{6539}\u{77ed}\u{4e86}\u{3002}\n\n```nota-diff\n- \u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n+ \u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n```\n";
        let r = parse_cheng(hui_da);
        assert_eq!(r.body_2, "\u{6211}\u{628a}\u{7b2c}\u{4e8c}\u{53e5}\u{6539}\u{77ed}\u{4e86}\u{3002}", "\u{6b63}\u{6587}\u{8be5}\u{662f}\u{56f4}\u{680f}\u{4e4b}\u{5916}\u{90a3}\u{6bb5}\u{ff0c}\u{9996}\u{5c3e}\u{4e0d}\u{7559}\u{7a7a}\u{884c}");
        assert_eq!(r.huai_xing, 0);
        assert_eq!(r.change.len(), 1);
        assert_eq!(
            r.change[0].shan,
            vec!["\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}"]
        );
        assert_eq!(
            r.change[0].jia_2,
            vec!["\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}"]
        );

        let document_2 = "\u{7b2c}\u{4e00}\u{884c}\u{3002}\n\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n\u{7b2c}\u{4e09}\u{884c}\u{3002}\n";
        assert_eq!(
            app_2(document_2, &r.change).expect("\u{8fd9}\u{4e00}\u{6bb5}\u{5728}\u{6587}\u{6863}\u{91cc}\u{ff0c}\u{8be5}\u{80fd}\u{5e94}\u{7528}"),
            "\u{7b2c}\u{4e00}\u{884c}\u{3002}\n\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n\u{7b2c}\u{4e09}\u{884c}\u{3002}\n"
        );
    }

    #[test]
    fn dui_bu_shang_jiu_zheng_ti_fang_qi_bing_shuo_qing_reason() {
        let r = parse_cheng("```nota-diff\n- \u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n+ \u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n```\n");
        let cuo = app_2("\u{5b8c}\u{5168}\u{4e0d}\u{76f8}\u{5e72}\u{7684}\u{4e00}\u{6bb5}\u{8bdd}\u{3002}\n", &r.change).expect_err("\u{6587}\u{6863}\u{91cc}\u{6ca1}\u{6709}\u{90a3}\u{884c}\u{ff0c}\u{8be5}\u{5931}\u{8d25}");
        assert!(
            cuo.contains("Could not match"),
            "expected a missing-text reason: {cuo}"
        );
    }

    #[test]
    fn bu_lian_xu_de_xing_bu_suan_shu() {
        let r = parse_cheng("```nota-diff\n- \u{7532}\u{3002}\n- \u{4e59}\u{3002}\n+ \u{6362}\u{4e86}\u{3002}\n```\n");
        assert!(
            app_2("\u{7532}\u{3002}\n\u{4e2d}\u{95f4}\u{5939}\u{7740}\u{522b}\u{7684}\u{3002}\n\u{4e59}\u{3002}\n", &r.change).is_err(),
            "\u{300c}\u{7532}\u{3002}\u{4e59}\u{3002}\u{300d}\u{5728}\u{6587}\u{6863}\u{91cc}\u{4e0d}\u{6328}\u{7740}\u{ff0c}\u{4e0d}\u{8be5}\u{5339}\u{914d}\u{4e0a}"
        );
    }

    #[test]
    fn zhi_you_jia_hao_jiu_zhui_jia_dao_wen_mo() {
        let r =
            parse_cheng("```nota-diff\n+ \u{65b0}\u{52a0}\u{7684}\u{4e00}\u{884c}\u{3002}\n```\n");
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
    fn liang_kuai_change_an_shun_xu_ge_gai_ge_de() {
        let r = parse_cheng(
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
    fn shun_xu_write_fan_le_ye_hai_neng_yong() {
        let r = parse_cheng("```nota-diff\n- \u{4e19}\u{3002}\n+ C\u{3002}\n```\n```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n");
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
    fn huai_xing_zhi_shu_chu_lai_bu_dang_change() {
        let r = parse_cheng("```nota-diff\n\u{8fd9}\u{91cc}\u{4e0d}\u{8be5}\u{6709}\u{5b57}\u{3002}\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n");
        assert_eq!(
            r.huai_xing, 1,
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
    fn mei_you_wei_lan_jiu_shi_pu_tong_text() {
        let r = parse_cheng(
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
    fn shao_write_receive_wei_wei_lan_ye_ren() {
        let r = parse_cheng("```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n");
        assert_eq!(
            app_2("\u{7532}\u{3002}\n", &r.change)
                .expect("\u{5c11}\u{4e2a}\u{6536}\u{5c3e}\u{4e5f}\u{8be5}\u{8ba4}"),
            "A\u{3002}\n"
        );
    }

    #[test]
    fn kong_change_kuai_dang_mei_write() {
        let r = parse_cheng("\u{4e0d}\u{7528}\u{6539}\u{3002}\n\n```nota-diff\n```\n");
        assert_eq!(r.body_2, "\u{4e0d}\u{7528}\u{6539}\u{3002}");
        assert!(r.change.is_empty());
    }

    #[test]
    fn crlf_document_ye_neng_gai_qie_bu_gai_feng_ge() {
        let r = parse_cheng("```nota-diff\n- \u{7532}\u{3002}\n+ A\u{3002}\n```\n");
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
    fn chun_delete_he_shan_mo_wei_xing() {
        let r = parse_cheng("```nota-diff\n- \u{4e59}\u{3002}\n```\n");
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
    fn shan_kong_xing() {
        let r = parse_cheng("```nota-diff\n-\n```\n");
        assert_eq!(
            r.change[0].shan,
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
    fn make_gei_chu_tong_yi_ge_shi_de_zhu_xing_cha_yi() {
        let lua = Lua::new();
        let f = make(&lua);
        let xing_men: Table = f
            .call(("\u{4e00}\n\u{4e09}\n", "\u{4e00}\n\u{4e8c}\n\u{4e09}\n"))
            .expect("\u{8c03}\u{7528}\u{4e0d}\u{8be5}\u{51fa}\u{9519}");
        assert_eq!(
            xing_men.raw_len(),
            4,
            "\u{4e00}\u{6bb5}\u{5934} + \u{4e09}\u{884c}"
        );

        let duan_tou: Table = xing_men.get(1).unwrap();
        assert_eq!(duan_tou.get::<String>("op").unwrap(), "hunk");
        assert_eq!(duan_tou.get::<String>("text").unwrap(), "@@ -1,2 +1,3 @@");

        let zhong_jian: Table = xing_men.get(3).unwrap();
        assert_eq!(zhong_jian.get::<String>("op").unwrap(), "add");
        assert_eq!(zhong_jian.get::<String>("text").unwrap(), "\u{4e8c}");
    }

    #[test]
    fn make_sheng_lve_shang_xia_wen_shi_shi_default_value_san() {
        let lua = Lua::new();
        let f = make(&lua);
        let jiu = "1\n2\n3\n4\n5\n";
        let xin = "1\n2\nX\n4\n5\n";

        let sheng_lve: Table = f
            .call((jiu, xin))
            .expect("\u{7b2c}\u{4e09}\u{4e2a}\u{53c2}\u{6570}\u{53ef}\u{4ee5}\u{4e0d}\u{7ed9}");
        let gei_le: Table = f
            .call((jiu, xin, 0usize))
            .expect("\u{7ed9}\u{4e86}\u{5c31}\u{7528}\u{7ed9}\u{7684}");
        assert_eq!(sheng_lve.raw_len(), 7, "\u{6bb5}\u{5934} + \u{4e0a}\u{4e0b}\u{5404}\u{4e24}\u{884c} + \u{4e00}\u{5220}\u{4e00}\u{52a0}");
        assert_eq!(gei_le.raw_len(), 3, "\u{4e0a}\u{4e0b}\u{6587} 0\u{ff1a}\u{53ea}\u{5269}\u{6bb5}\u{5934}\u{548c}\u{4e00}\u{5220}\u{4e00}\u{52a0}");

        let duan_tou = |t: &Table| t.get::<Table>(1).unwrap().get::<String>("text").unwrap();
        assert_eq!(
            duan_tou(&sheng_lve),
            "@@ -1,5 +1,5 @@",
            "\u{9ed8}\u{8ba4}\u{90a3}\u{4e2a} 3 \u{5c31}\u{662f} `git diff -U3` \u{7684}\u{90a3}\u{4e2a} 3"
        );
        assert_eq!(
            duan_tou(&gei_le),
            "@@ -3 +3 @@",
            "\u{884c}\u{53f7}\u{8ddf}\u{7740}\u{4e0a}\u{4e0b}\u{6587}\u{53d8}"
        );
    }

    #[test]
    fn make_mei_change_shi_gei_kong_table() {
        let lua = Lua::new();
        let f = make(&lua);
        let mei_gai: Table = f.call(("\u{7532}\n", "\u{7532}\n")).expect("\u{4e24}\u{8fb9}\u{4e00}\u{6837}\u{662f}\u{6b63}\u{5e38}\u{7ed3}\u{679c}\u{ff0c}\u{4e0d}\u{662f}\u{9519}\u{8bef}");
        assert_eq!(
            mei_gai.raw_len(),
            0,
            "\u{6ca1}\u{6539}\u{52a8}\u{5c31}\u{662f}\u{7a7a}\u{8868}"
        );
        let dou_kong: Table = f.call(("", "")).expect("\u{7a7a}\u{8fdb}\u{7a7a}\u{51fa}");
        assert_eq!(
            dou_kong.raw_len(),
            0,
            "\u{4e0d}\u{8bb8}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{4e2a}\u{7a7a}\u{6bb5}\u{5934}"
        );
    }
}
