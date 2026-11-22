use mlua::{Function, Lua};

use super::mlua_to_nota;
use crate::error::NotaError;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FileChunk {
    pub path_3: String,

    pub xin_zeng: bool,

    pub yi_shan: bool,

    pub xing: Vec<DiffLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    TrustedMetadata,

    Header,

    Added,

    Removed,

    Context,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub kind_2: LineKind,

    pub text_2: String,
}

fn kind_dao_op(kind_2: LineKind) -> &'static str {
    match kind_2 {
        LineKind::Added => "add",
        LineKind::Removed => "del",
        LineKind::Context => "ctx",
        LineKind::Header => "hunk",
        LineKind::TrustedMetadata => "meta",
    }
}

pub fn parse_tong_yi(text_2: &str) -> Vec<FileChunk> {
    let mut result_3: Vec<FileChunk> = Vec::new();
    let mut current_2: Option<FileChunk> = None;

    let mut jiu_path = String::new();

    let mut zai_body_li = false;

    let mut er_jin_zhi = false;

    for yuan_shi in text_2.lines() {
        let xing = yuan_shi.strip_suffix('\r').unwrap_or(yuan_shi);

        if let Some(yu) = xing.strip_prefix("diff --git ") {
            receive_3(&mut result_3, &mut current_2);
            current_2 = Some(FileChunk {
                path_3: cai_path(yu),
                ..Default::default()
            });

            tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
            jiu_path.clear();
            zai_body_li = false;
            er_jin_zhi = false;
            continue;
        }

        if er_jin_zhi {
            continue;
        }

        if xing.starts_with("GIT binary patch") {
            er_jin_zhi = true;
            tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
            continue;
        }
        if xing.starts_with("Binary files ") {
            tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
            continue;
        }

        if xing.starts_with("@@") {
            zai_body_li = true;
            tui_yi_xing(&mut current_2, LineKind::Header, xing);
            continue;
        }

        if !zai_body_li && current_2.is_some() {
            if let Some(p) = xing.strip_prefix("--- ") {
                jiu_path = gan_jing_path(p, "a/");
                tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
                continue;
            }
            if let Some(p) = xing.strip_prefix("+++ ") {
                let p = gan_jing_path(p, "b/");
                let kuai_2 = current_2.as_mut().expect("checked above");
                if p == "/dev/null" {
                    kuai_2.path_3 = jiu_path.clone();
                    kuai_2.yi_shan = true;
                } else {
                    kuai_2.xin_zeng = jiu_path == "/dev/null";
                    kuai_2.path_3 = p;
                }
                tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
                continue;
            }
            if let Some(p) = xing.strip_prefix("rename to ") {
                kuai_path(&mut current_2, &gan_jing_path(p, ""));
                tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
                continue;
            }

            tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
            continue;
        }

        if let Some(rest) = xing.strip_prefix('+') {
            tui_yi_xing(&mut current_2, LineKind::Added, rest);
        } else if let Some(rest) = xing.strip_prefix('-') {
            tui_yi_xing(&mut current_2, LineKind::Removed, rest);
        } else if xing.starts_with('\\') {
            tui_yi_xing(&mut current_2, LineKind::TrustedMetadata, xing);
        } else {
            tui_yi_xing(
                &mut current_2,
                LineKind::Context,
                xing.strip_prefix(' ').unwrap_or(xing),
            );
        }
    }

    receive_3(&mut result_3, &mut current_2);
    result_3
}

fn receive_3(result_3: &mut Vec<FileChunk>, current_2: &mut Option<FileChunk>) {
    if let Some(kuai_2) = current_2.take() {
        if !kuai_2.path_3.is_empty() {
            result_3.push(kuai_2);
        }
    }
}

fn tui_yi_xing(current_2: &mut Option<FileChunk>, kind_2: LineKind, text_2: &str) {
    if let Some(kuai_2) = current_2.as_mut() {
        kuai_2.xing.push(DiffLine {
            kind_2,
            text_2: text_2.to_owned(),
        });
    }
}

fn kuai_path(current_2: &mut Option<FileChunk>, path_3: &str) {
    if let Some(kuai_2) = current_2.as_mut() {
        kuai_2.path_3 = path_3.to_owned();
    }
}

fn cai_path(yu: &str) -> String {
    let yu = yu.strip_prefix("a/").unwrap_or(yu);
    match yu.find(" b/") {
        Some(i) => yu[..i].to_owned(),

        None => yu.split('\t').next().unwrap_or(yu).to_owned(),
    }
}

fn gan_jing_path(yuan_shi: &str, qian_zhui: &str) -> String {
    let s = yuan_shi.split('\t').next().unwrap_or(yuan_shi);
    s.strip_prefix(qian_zhui).unwrap_or(s).to_owned()
}

pub fn build(lua: &Lua) -> Result<Function, NotaError> {
    lua.create_function(|lua, text_2: String| {
        let files_2 = lua.create_table()?;
        for (i, f) in parse_tong_yi(&text_2).iter().enumerate() {
            let table_2 = lua.create_table()?;
            table_2.set("path", f.path_3.as_str())?;
            table_2.set("added", f.xin_zeng)?;
            table_2.set("deleted", f.yi_shan)?;
            let xing_men = lua.create_table()?;
            for (j, l) in f.xing.iter().enumerate() {
                let xing_table = lua.create_table()?;

                xing_table.set("op", kind_dao_op(l.kind_2))?;
                xing_table.set("text", l.text_2.as_str())?;
                xing_men.set(j + 1, xing_table)?;
            }
            table_2.set("lines", xing_men)?;
            files_2.set(i + 1, table_2)?;
        }
        Ok(files_2)
    })
    .map_err(mlua_to_nota)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn xing(kind_2: LineKind, text_2: &str) -> DiffLine {
        DiffLine {
            kind_2,
            text_2: text_2.into(),
        }
    }

    fn change_tiao_shu(kuai_2: &FileChunk) -> usize {
        kuai_2
            .xing
            .iter()
            .filter(|l| matches!(l.kind_2, LineKind::Added | LineKind::Removed))
            .count()
    }

    const DIFF_SAMPLE: &str = "diff --git a/\u{4e00}\u{7ae0}.md b/\u{4e00}\u{7ae0}.md\nindex 1111111..2222222 100644\n--- a/\u{4e00}\u{7ae0}.md\n+++ b/\u{4e00}\u{7ae0}.md\n@@ -1,4 +1,4 @@ \u{5f00}\u{5934}\n \u{4e0a}\u{6587}\n-\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}\n+\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}\n \u{4e0b}\u{6587}\ndiff --git a/\u{4e8c}\u{7ae0}.md b/\u{4e8c}\u{7ae0}.md\nnew file mode 100644\nindex 0000000..3333333\n--- /dev/null\n+++ b/\u{4e8c}\u{7ae0}.md\n@@ -0,0 +1,2 @@\n+\u{65b0}\u{7684}\u{4e00}\u{7ae0}\n+\u{7b2c}\u{4e8c}\u{884c}\n";

    #[test]
    fn liang_ge_file_ge_gui_ge_de() {
        let file_3 = parse_tong_yi(DIFF_SAMPLE);
        assert_eq!(
            file_3.len(),
            2,
            "\u{5e94}\u{5f53}\u{8ba4}\u{51fa}\u{4e24}\u{4e2a}\u{6587}\u{4ef6}"
        );
        assert_eq!(file_3[0].path_3, "\u{4e00}\u{7ae0}.md");
        assert_eq!(file_3[0].xin_zeng, false);
        assert_eq!(file_3[0].yi_shan, false);
        assert_eq!(
            file_3[0].xing,
            vec![
                xing(
                    LineKind::TrustedMetadata,
                    "diff --git a/\u{4e00}\u{7ae0}.md b/\u{4e00}\u{7ae0}.md"
                ),
                xing(LineKind::TrustedMetadata, "index 1111111..2222222 100644"),
                xing(LineKind::TrustedMetadata, "--- a/\u{4e00}\u{7ae0}.md"),
                xing(LineKind::TrustedMetadata, "+++ b/\u{4e00}\u{7ae0}.md"),
                xing(LineKind::Header, "@@ -1,4 +1,4 @@ \u{5f00}\u{5934}"),
                xing(LineKind::Context, "\u{4e0a}\u{6587}"),
                xing(
                    LineKind::Removed,
                    "\u{4ed6}\u{6162}\u{6162}\u{5730}\u{8d70}\u{4e86}\u{8fc7}\u{6765}\u{3002}"
                ),
                xing(LineKind::Added, "\u{4ed6}\u{8d70}\u{8fc7}\u{6765}\u{3002}"),
                xing(LineKind::Context, "\u{4e0b}\u{6587}"),
            ]
        );
        assert_eq!(file_3[1].path_3, "\u{4e8c}\u{7ae0}.md");
        assert!(
            file_3[1].xin_zeng,
            "`--- /dev/null` = \u{65b0}\u{6587}\u{4ef6}"
        );
        assert_eq!(
            file_3[1].xing,
            vec![
                xing(
                    LineKind::TrustedMetadata,
                    "diff --git a/\u{4e8c}\u{7ae0}.md b/\u{4e8c}\u{7ae0}.md"
                ),
                xing(LineKind::TrustedMetadata, "new file mode 100644"),
                xing(LineKind::TrustedMetadata, "index 0000000..3333333"),
                xing(LineKind::TrustedMetadata, "--- /dev/null"),
                xing(LineKind::TrustedMetadata, "+++ b/\u{4e8c}\u{7ae0}.md"),
                xing(LineKind::Header, "@@ -0,0 +1,2 @@"),
                xing(LineKind::Added, "\u{65b0}\u{7684}\u{4e00}\u{7ae0}"),
                xing(LineKind::Added, "\u{7b2c}\u{4e8c}\u{884c}"),
            ]
        );
    }

    #[test]
    fn hunk_li_kong_chu_lai_de_na_xing_suan_shang_xia_wen_bu_suan_file_tou() {
        let text_2 = "diff --git a/x.md b/x.md\n\
                    --- a/x.md\n\
                    +++ b/x.md\n\
                    @@ -1,3 +1,3 @@\n\
                    \n\
                    -\u{65e7}\n\
                    +\u{65b0}\n\
                    \x20\u{5c3e}\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(
            file_3[0].xing.last(),
            Some(&xing(LineKind::Context, "\u{5c3e}")),
            "\u{6700}\u{540e}\u{90a3}\u{884c}\u{662f}\u{4e0a}\u{4e0b}\u{6587}\u{ff1a}{:?}",
            file_3[0].xing
        );
        assert_eq!(
            file_3[0].xing[4],
            xing(LineKind::Context, ""),
            "\u{7a7a}\u{884c}\u{4e5f}\u{662f}\u{4e0a}\u{4e0b}\u{6587}\u{ff1a}{:?}",
            file_3[0].xing
        );
        assert_eq!(change_tiao_shu(&file_3[0]), 2);
    }

    #[test]
    fn wu_kind_ge_zi_de_yang_zi_dou_ren_de_chu_lai() {
        let file_3 = parse_tong_yi(DIFF_SAMPLE);
        let mut jian_guo = Vec::new();
        for l in &file_3[0].xing {
            jian_guo.push(kind_dao_op(l.kind_2));
        }
        assert_eq!(
            jian_guo,
            vec!["meta", "meta", "meta", "meta", "hunk", "ctx", "del", "add", "ctx"]
        );
    }

    #[test]
    fn bei_shan_diao_de_yi_xing_zhang_de_xiang_file_tou_ye_bu_neng_ren_cheng_file_tou() {
        let text_2 = "diff --git a/x.md b/x.md\n\
                    --- a/x.md\n\
                    +++ b/x.md\n\
                    @@ -1,3 +1,2 @@\n\
                    \x20\u{4e0a}\u{6587}\n\
                    --- \u{5206}\u{9694}\u{7ebf}\n\
                    \x20\u{4e0b}\u{6587}\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(file_3.len(), 1, "\u{4e0d}\u{8be5}\u{628a}\u{88ab}\u{5220}\u{7684}\u{884c}\u{5f53}\u{6210}\u{7b2c}\u{4e8c}\u{4e2a}\u{6587}\u{4ef6}\u{ff1a}{file_3:?}");
        assert_eq!(file_3[0].path_3, "x.md");
        assert_eq!(
            change_tiao_shu(&file_3[0]),
            1,
            "\u{53ea}\u{6709}\u{4e00}\u{884c}\u{662f}\u{6539}\u{52a8}\u{ff1a}{:?}",
            file_3[0].xing
        );
        assert_eq!(
            file_3[0].xing.last(),
            Some(&xing(LineKind::Context, "\u{4e0b}\u{6587}")),
            "\u{6700}\u{540e}\u{90a3}\u{884c}\u{4ecd}\u{662f}\u{4e0a}\u{4e0b}\u{6587}"
        );
        let na_yi_xing = file_3[0]
            .xing
            .iter()
            .find(|l| l.kind_2 == LineKind::Removed)
            .expect("\u{5220}\u{6389}\u{7684}\u{90a3}\u{884c}\u{8981}\u{5728}");
        assert_eq!(
            na_yi_xing.text_2, "-- \u{5206}\u{9694}\u{7ebf}",
            "\u{884c}\u{9996}\u{7684}\u{6807}\u{8bb0}\u{53ea}\u{6390}\u{4e00}\u{4e2a}"
        );
    }

    #[test]
    fn shan_diao_de_file_yong_jiu_path() {
        let text_2 = "diff --git a/\u{65e7}.md b/\u{65e7}.md\n\
                    deleted file mode 100644\n\
                    --- a/\u{65e7}.md\n\
                    +++ /dev/null\n\
                    @@ -1 +0,0 @@\n\
                    -\u{53ea}\u{5269}\u{8fd9}\u{4e00}\u{884c}\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(file_3.len(), 1);
        assert_eq!(file_3[0].path_3, "\u{65e7}.md");
        assert!(file_3[0].yi_shan);
        assert!(!file_3[0].xin_zeng);
        assert_eq!(change_tiao_shu(&file_3[0]), 1);
        assert_eq!(
            file_3[0].xing.last(),
            Some(&xing(
                LineKind::Removed,
                "\u{53ea}\u{5269}\u{8fd9}\u{4e00}\u{884c}"
            )),
            "\u{5220}\u{6389}\u{7684}\u{6587}\u{4ef6}\u{90a3}\u{884c}\u{662f}\u{5220}\u{ff1a}{:?}",
            file_3[0].xing
        );
    }

    #[test]
    fn er_jin_zhi_he_zhi_you_mo_shi_bian_hua_dou_ren_chu_lai_le_zhi_shi_mei_you_zeng_shan_de_xing()
    {
        let er_jin_zhi = "diff --git a/\u{56fe}.png b/\u{56fe}.png\n\
                      index 111..222 100644\n\
                      Binary files a/\u{56fe}.png and b/\u{56fe}.png differ\n";
        let file_3 = parse_tong_yi(er_jin_zhi);
        assert_eq!(file_3.len(), 1, "\u{4e8c}\u{8fdb}\u{5236}\u{6587}\u{4ef6}\u{4e5f}\u{8981}\u{51fa}\u{73b0}\u{ff0c}\u{4e0d}\u{80fd}\u{6084}\u{6084}\u{4e0d}\u{753b}");
        assert_eq!(file_3[0].path_3, "\u{56fe}.png");
        assert_eq!(
            change_tiao_shu(&file_3[0]),
            0,
            "\u{4e8c}\u{8fdb}\u{5236}\u{6ca1}\u{6709}\u{589e}\u{5220}\u{7684}\u{884c}"
        );
        assert_eq!(
            file_3[0].xing.len(),
            3,
            "\u{4f46} git \u{81ea}\u{5df1}\u{90a3}\u{4e09}\u{884c}\u{8981}\u{7167}\u{753b}"
        );
        assert!(file_3[0]
            .xing
            .iter()
            .all(|l| l.kind_2 == LineKind::TrustedMetadata));

        let mo_shi = "diff --git a/\u{811a}\u{672c}.sh b/\u{811a}\u{672c}.sh\n\
                    old mode 100644\n\
                    new mode 100755\n";
        let file_3 = parse_tong_yi(mo_shi);
        assert_eq!(file_3.len(), 1);
        assert_eq!(
            file_3[0].path_3, "\u{811a}\u{672c}.sh",
            "\u{6ca1}\u{6709} `+++` \u{884c}\u{65f6}\u{8981}\u{80fd}\u{4ece} `diff --git` \u{731c}\u{51fa}\u{6765}"
        );
        assert_eq!(change_tiao_shu(&file_3[0]), 0);
        assert_eq!(
            file_3[0].xing.last(),
            Some(&xing(LineKind::TrustedMetadata, "new mode 100755"))
        );
    }

    #[test]
    fn git_de_er_jin_zhi_bu_ding_ti_bu_dang_body() {
        let text_2 = "diff --git a/x.bin b/x.bin\n\
                    index 111..222 100644\n\
                    GIT binary patch\n\
                    literal 12\n\
                    +abc\n\
                    -def\n\
                    diff --git a/y.md b/y.md\n\
                    --- a/y.md\n\
                    +++ b/y.md\n\
                    @@ -1 +1 @@\n\
                    -\u{65e7}\n\
                    +\u{65b0}\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(file_3.len(), 2);
        assert_eq!(
            file_3[0].xing,
            vec![
                xing(LineKind::TrustedMetadata, "diff --git a/x.bin b/x.bin"),
                xing(LineKind::TrustedMetadata, "index 111..222 100644"),
                xing(LineKind::TrustedMetadata, "GIT binary patch"),
            ],
            "\u{53ea}\u{5269}\u{6587}\u{4ef6}\u{5934}\u{90a3}\u{4e09}\u{884c}\u{ff1a}base85 \u{4e00}\u{6bb5}\u{90fd}\u{522b}\u{8fdb}\u{6765}"
        );
        assert!(
            file_3[0].xing.iter().all(|l| !l.text_2.contains("abc")),
            "base85 \u{90a3}\u{51e0}\u{884c}\u{4e00}\u{4e2a}\u{5b57}\u{90fd}\u{4e0d}\u{8bb8}\u{8fdb}\u{6765}\u{ff1a}{:?}",
            file_3[0].xing
        );
        assert_eq!(
            change_tiao_shu(&file_3[1]),
            2,
            "\u{4e0b}\u{4e00}\u{4e2a}\u{6587}\u{4ef6}\u{4e0d}\u{53d7}\u{5f71}\u{54cd}"
        );
    }

    #[test]
    fn mo_wei_mei_huan_xing_na_xing_bu_suan_change() {
        let text_2 = "diff --git a/x.md b/x.md\n\
                    --- a/x.md\n\
                    +++ b/x.md\n\
                    @@ -1 +1 @@\n\
                    -\u{65e7}\n\
                    +\u{65b0}\n\
                    \\ No newline at end of file\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(change_tiao_shu(&file_3[0]), 2);
        assert_eq!(
            file_3[0].xing.last(),
            Some(&xing(LineKind::TrustedMetadata, "\\ No newline at end of file")),
            "\u{8fd9}\u{53e5}\u{662f}\u{63d0}\u{793a}\u{ff0c}\u{4e0d}\u{662f}\u{6539}\u{52a8}\u{ff0c}\u{4e5f}\u{4e0d}\u{662f}\u{4e0a}\u{4e0b}\u{6587}\u{ff1a}{:?}",
            file_3[0].xing
        );
    }

    #[test]
    fn path_hou_mian_na_ge_zhi_table_fu_yao_qia_diao() {
        let text_2 = "diff --git a/\u{6211}\u{7684} \u{6587}\u{7a3f}.md b/\u{6211}\u{7684} \u{6587}\u{7a3f}.md\n\
                    --- a/\u{6211}\u{7684} \u{6587}\u{7a3f}.md\t\n\
                    +++ b/\u{6211}\u{7684} \u{6587}\u{7a3f}.md\t2026-09-25 10:00:00\n\
                    @@ -1 +1 @@\n\
                    -\u{65e7}\n\
                    +\u{65b0}\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(file_3[0].path_3, "\u{6211}\u{7684} \u{6587}\u{7a3f}.md");
    }

    #[test]
    fn chun_gai_ming_yong_xin_name() {
        let text_2 = "diff --git a/\u{65e7}\u{540d}.md b/\u{65b0}\u{540d}.md\n\
                    similarity index 100%\n\
                    rename from \u{65e7}\u{540d}.md\n\
                    rename to \u{65b0}\u{540d}.md\n";
        let file_3 = parse_tong_yi(text_2);
        assert_eq!(file_3[0].path_3, "\u{65b0}\u{540d}.md", "\u{6539}\u{52a8}\u{5217}\u{8868}\u{91cc}\u{663e}\u{793a}\u{7684}\u{662f}\u{65b0}\u{540d}\u{5b57}\u{ff0c}\u{8fd9}\u{91cc}\u{8981}\u{5bf9}\u{4e0a}");
        assert_eq!(
            change_tiao_shu(&file_3[0]),
            0,
            "\u{7eaf}\u{6539}\u{540d}\u{6ca1}\u{6709}\u{589e}\u{5220}\u{7684}\u{884c}"
        );
        assert_eq!(
            file_3[0].xing.last(),
            Some(&xing(
                LineKind::TrustedMetadata,
                "rename to \u{65b0}\u{540d}.md"
            ))
        );
    }

    #[test]
    fn bu_shi_diff_de_text_gei_kong_table() {
        assert!(parse_tong_yi("\u{8fd9}\u{662f}\u{4e00}\u{6bb5}\u{666e}\u{901a}\u{7684}\u{6587}\u{5b57}\u{3002}\n--- \u{4e00}\u{6761}\u{5206}\u{9694}\u{7ebf}\n+++ \u{53e6}\u{4e00}\u{6761}\n").is_empty());
        assert!(parse_tong_yi("").is_empty());
    }

    #[test]
    fn mei_you_name_de_na_kuai_bu_hua() {
        let text_2 = "diff --git \n@@ -1 +1 @@\n-\u{65e7}\n+\u{65b0}\n";
        assert!(parse_tong_yi(text_2).is_empty());
    }
}
