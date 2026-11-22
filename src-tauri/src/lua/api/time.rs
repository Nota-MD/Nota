use chrono::{DateTime, Datelike, Local, LocalResult, Offset, TimeZone, Timelike};
use mlua::{Lua, Table};

use super::mlua_to_nota;
use crate::error::Result as NotaResult;

pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let now = lua
        .create_function(|lua, ()| install_2(lua, &Local::now()))
        .map_err(mlua_to_nota)?;
    t.set("now", now).map_err(mlua_to_nota)?;

    Ok(t)
}

fn install_2<Tz: TimeZone>(lua: &Lua, xian_zai: &DateTime<Tz>) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("now_ms", xian_zai.timestamp_millis())?;
    t.set("day_start_ms", local_ling_dian_hao_miao(xian_zai))?;
    t.set(
        "ymd",
        format!(
            "{:04}-{:02}-{:02}",
            xian_zai.year(),
            xian_zai.month(),
            xian_zai.day()
        ),
    )?;
    t.set("y", xian_zai.year())?;
    t.set("mo", xian_zai.month())?;
    t.set("d", xian_zai.day())?;
    t.set("hh", xian_zai.hour())?;
    t.set("mi", xian_zai.minute())?;
    t.set("ss", xian_zai.second())?;

    t.set("wday", xian_zai.weekday().num_days_from_monday())?;

    t.set(
        "tz_offset_min",
        xian_zai.offset().fix().local_minus_utc() / 60,
    )?;
    Ok(t)
}

fn local_ling_dian_hao_miao<Tz: TimeZone>(xian_zai: &DateTime<Tz>) -> i64 {
    let ling_dian = xian_zai
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("Midnight is always a valid time");
    match xian_zai.timezone().from_local_datetime(&ling_dian) {
        LocalResult::Single(ling_dian) => ling_dian.timestamp_millis(),

        LocalResult::Ambiguous(zao, _) => zao.timestamp_millis(),

        LocalResult::None => xian_zai.timestamp_millis(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn dong_ba(text_2: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(text_2).expect("\u{7528}\u{4f8b}\u{91cc}\u{7684}\u{65f6}\u{95f4}\u{4e32}\u{90fd}\u{662f}\u{81ea}\u{5df1}\u{5199}\u{7684}")
    }

    #[test]
    fn ri_qi_an_local_suan_er_bu_shi_an_utc_suan() {
        let ba_qu =
            FixedOffset::east_opt(8 * 3600).expect("\u{4e1c}\u{516b}\u{533a}\u{5408}\u{6cd5}");

        let xian_zai = DateTime::parse_from_rfc3339("2026-09-26T16:00:00Z")
            .expect("\u{7528}\u{4f8b}\u{65f6}\u{95f4}\u{5408}\u{6cd5}")
            .with_timezone(&ba_qu);
        let table_2 = ling_dian_yu_chuan(&xian_zai);
        assert_eq!(
            table_2.0, "2026-09-27",
            "\u{5317}\u{4eac}\u{5df2}\u{7ecf}\u{662f} 27 \u{65e5}\u{4e86}"
        );
        assert_eq!(table_2.1, 0, "\u{521a}\u{597d}\u{662f}\u{672c}\u{5730}\u{96f6}\u{70b9}\u{ff0c}\u{8ddd}\u{96f6}\u{70b9} 0 \u{6beb}\u{79d2}");

        let xi_wu =
            FixedOffset::west_opt(5 * 3600).expect("\u{897f}\u{4e94}\u{533a}\u{5408}\u{6cd5}");
        let xian_zai = DateTime::parse_from_rfc3339("2026-09-26T16:00:00Z")
            .expect("\u{7528}\u{4f8b}\u{65f6}\u{95f4}\u{5408}\u{6cd5}")
            .with_timezone(&xi_wu);
        assert_eq!(
            ling_dian_yu_chuan(&xian_zai).0,
            "2026-09-26",
            "\u{7ebd}\u{7ea6}\u{90a3}\u{8fb9}\u{8fd8}\u{662f} 26 \u{65e5}"
        );
    }

    #[test]
    fn ju_ling_dian_hao_miao_shu_shi_local_shi_fen_miao_suan_chu_lai_de() {
        let xian_zai = dong_ba("2026-09-27T22:14:33+08:00");
        let (chuan, ju_jin) = ling_dian_yu_chuan(&xian_zai);
        assert_eq!(chuan, "2026-09-27");
        assert_eq!(ju_jin, 22 * 3_600_000 + 14 * 60_000 + 33 * 1_000);
    }

    #[test]
    fn install_chu_lai_de_table_zi_qia_qie_xing_qi_cong_zhou_yi_qi_suan() {
        let lua = Lua::new();
        let xian_zai = dong_ba("2026-09-27T22:14:33+08:00");
        let t =
            install_2(&lua, &xian_zai).expect("\u{88c5}\u{8868}\u{4e0d}\u{8be5}\u{5931}\u{8d25}");
        assert_eq!(t.get::<String>("ymd").expect("\u{6709} ymd"), "2026-09-27");
        assert_eq!(t.get::<i64>("y").expect("\u{6709} y"), 2026);
        assert_eq!(t.get::<i64>("mo").expect("\u{6709} mo"), 9);
        assert_eq!(t.get::<i64>("d").expect("\u{6709} d"), 27);
        assert_eq!(t.get::<i64>("hh").expect("\u{6709} hh"), 22);
        assert_eq!(t.get::<i64>("mi").expect("\u{6709} mi"), 14);
        assert_eq!(t.get::<i64>("ss").expect("\u{6709} ss"), 33);
        assert_eq!(
            t.get::<i64>("wday").expect("\u{6709} wday"),
            6,
            "\u{5468}\u{65e5}"
        );
        assert_eq!(
            t.get::<i64>("tz_offset_min")
                .expect("\u{6709}\u{504f}\u{79fb}"),
            480,
            "\u{4e1c}\u{516b}\u{533a}"
        );
        let xian_zai_hao_miao = t.get::<i64>("now_ms").expect("\u{6709} now_ms");
        let ling_dian_hao_miao = t.get::<i64>("day_start_ms").expect("\u{6709} day_start_ms");
        assert_eq!(
            xian_zai_hao_miao - ling_dian_hao_miao,
            22 * 3_600_000 + 14 * 60_000 + 33 * 1_000
        );
    }

    #[test]
    fn diao_yi_ci_now_na_dao_de_shi_yi_zheng_tao_dang_xia_de_shi_jian() {
        let lua = Lua::new();
        let t = build(&lua).expect("\u{88c5}\u{8868}\u{4e0d}\u{8be5}\u{5931}\u{8d25}");
        let f: mlua::Function = t.get("now").expect("\u{6709} now");
        let xian_zai: Table = f
            .call(())
            .expect("\u{8c03}\u{4e00}\u{4e0b}\u{4e0d}\u{8be5}\u{5931}\u{8d25}");

        let ling_dian = xian_zai
            .get::<i64>("day_start_ms")
            .expect("\u{6709} day_start_ms");
        let ci_ke = xian_zai.get::<i64>("now_ms").expect("\u{6709} now_ms");
        let cha = ci_ke - ling_dian;
        assert!((0..86_400_000).contains(&cha), "\u{8ddd}\u{672c}\u{5730}\u{96f6}\u{70b9}\u{8be5}\u{5728}\u{4e00}\u{5929}\u{4e4b}\u{5185}\u{ff0c}\u{5b9e}\u{9645} {cha}");

        let chuan: String = xian_zai.get("ymd").expect("\u{6709} ymd");
        let pin = format!(
            "{:04}-{:02}-{:02}",
            xian_zai.get::<i64>("y").expect("\u{6709} y"),
            xian_zai.get::<i64>("mo").expect("\u{6709} mo"),
            xian_zai.get::<i64>("d").expect("\u{6709} d"),
        );
        assert_eq!(chuan, pin, "ymd \u{4e0e}\u{90a3}\u{4e09}\u{4e2a}\u{6570}\u{5b57}\u{8be5}\u{662f}\u{540c}\u{4e00}\u{5957}");
        let xing_qi = xian_zai.get::<i64>("wday").expect("\u{6709} wday");
        assert!(
            (0..=6).contains(&xing_qi),
            "\u{661f}\u{671f}\u{8be5}\u{5728} 0~6\u{ff0c}\u{5b9e}\u{9645} {xing_qi}"
        );
    }

    fn ling_dian_yu_chuan(xian_zai: &DateTime<FixedOffset>) -> (String, i64) {
        let chuan = format!(
            "{:04}-{:02}-{:02}",
            xian_zai.year(),
            xian_zai.month(),
            xian_zai.day()
        );
        (
            chuan,
            xian_zai.timestamp_millis() - local_ling_dian_hao_miao(xian_zai),
        )
    }
}
