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

fn install_2<Tz: TimeZone>(lua: &Lua, now: &DateTime<Tz>) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("now_ms", now.timestamp_millis())?;
    t.set("day_start_ms", local_zero_point_number_description(now))?;
    t.set(
        "ymd",
        format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day()),
    )?;
    t.set("y", now.year())?;
    t.set("mo", now.month())?;
    t.set("d", now.day())?;
    t.set("hh", now.hour())?;
    t.set("mi", now.minute())?;
    t.set("ss", now.second())?;

    t.set("wday", now.weekday().num_days_from_monday())?;

    t.set("tz_offset_min", now.offset().fix().local_minus_utc() / 60)?;
    Ok(t)
}

fn local_zero_point_number_description<Tz: TimeZone>(now: &DateTime<Tz>) -> i64 {
    let zero_point = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("Midnight is always a valid time");
    match now.timezone().from_local_datetime(&zero_point) {
        LocalResult::Single(zero_point) => zero_point.timestamp_millis(),

        LocalResult::Ambiguous(create, _) => create.timestamp_millis(),

        LocalResult::None => now.timestamp_millis(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn dynamic_handle(text_2: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(text_2).expect("\u{7528}\u{4f8b}\u{91cc}\u{7684}\u{65f6}\u{95f4}\u{4e32}\u{90fd}\u{662f}\u{81ea}\u{5df1}\u{5199}\u{7684}")
    }

    #[test]
    fn date_start_by_local_compute_two_not_is_by_utc_compute() {
        let handle_get =
            FixedOffset::east_opt(8 * 3600).expect("\u{4e1c}\u{516b}\u{533a}\u{5408}\u{6cd5}");

        let now = DateTime::parse_from_rfc3339("2026-09-26T16:00:00Z")
            .expect("\u{7528}\u{4f8b}\u{65f6}\u{95f4}\u{5408}\u{6cd5}")
            .with_timezone(&handle_get);
        let table_2 = zero_point_and_stream(&now);
        assert_eq!(
            table_2.0, "2026-09-27",
            "\u{5317}\u{4eac}\u{5df2}\u{7ecf}\u{662f} 27 \u{65e5}\u{4e86}"
        );
        assert_eq!(table_2.1, 0, "\u{521a}\u{597d}\u{662f}\u{672c}\u{5730}\u{96f6}\u{70b9}\u{ff0c}\u{8ddd}\u{96f6}\u{70b9} 0 \u{6beb}\u{79d2}");

        let system_none =
            FixedOffset::west_opt(5 * 3600).expect("\u{897f}\u{4e94}\u{533a}\u{5408}\u{6cd5}");
        let now = DateTime::parse_from_rfc3339("2026-09-26T16:00:00Z")
            .expect("\u{7528}\u{4f8b}\u{65f6}\u{95f4}\u{5408}\u{6cd5}")
            .with_timezone(&system_none);
        assert_eq!(
            zero_point_and_stream(&now).0,
            "2026-09-26",
            "\u{7ebd}\u{7ea6}\u{90a3}\u{8fb9}\u{8fd8}\u{662f} 26 \u{65e5}"
        );
    }

    #[test]
    fn sentence_zero_point_number_description_data_is_local_is_part_description_compute_out_incoming(
    ) {
        let now = dynamic_handle("2026-09-27T22:14:33+08:00");
        let (stream, sentence_enter) = zero_point_and_stream(&now);
        assert_eq!(stream, "2026-09-27");
        assert_eq!(sentence_enter, 22 * 3_600_000 + 14 * 60_000 + 33 * 1_000);
    }

    #[test]
    fn install_out_incoming_table_character_match_cut_line_start_from_cycle_one_start_compute() {
        let lua = Lua::new();
        let now = dynamic_handle("2026-09-27T22:14:33+08:00");
        let t = install_2(&lua, &now).expect("\u{88c5}\u{8868}\u{4e0d}\u{8be5}\u{5931}\u{8d25}");
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
        let thread_at_number_description = t.get::<i64>("now_ms").expect("\u{6709} now_ms");
        let zero_point_number_description =
            t.get::<i64>("day_start_ms").expect("\u{6709} day_start_ms");
        assert_eq!(
            thread_at_number_description - zero_point_number_description,
            22 * 3_600_000 + 14 * 60_000 + 33 * 1_000
        );
    }

    #[test]
    fn drop_one_word_now_that_to_is_one_validate_escape_when_lower_is_check() {
        let lua = Lua::new();
        let t = build(&lua).expect("\u{88c5}\u{8868}\u{4e0d}\u{8be5}\u{5931}\u{8d25}");
        let f: mlua::Function = t.get("now").expect("\u{6709} now");
        let now: Table = f
            .call(())
            .expect("\u{8c03}\u{4e00}\u{4e0b}\u{4e0d}\u{8be5}\u{5931}\u{8d25}");

        let zero_point = now
            .get::<i64>("day_start_ms")
            .expect("\u{6709} day_start_ms");
        let word_can = now.get::<i64>("now_ms").expect("\u{6709} now_ms");
        let check = word_can - zero_point;
        assert!((0..86_400_000).contains(&check), "\u{8ddd}\u{672c}\u{5730}\u{96f6}\u{70b9}\u{8be5}\u{5728}\u{4e00}\u{5929}\u{4e4b}\u{5185}\u{ff0c}\u{5b9e}\u{9645} {check}");

        let stream: String = now.get("ymd").expect("\u{6709} ymd");
        let spell = format!(
            "{:04}-{:02}-{:02}",
            now.get::<i64>("y").expect("\u{6709} y"),
            now.get::<i64>("mo").expect("\u{6709} mo"),
            now.get::<i64>("d").expect("\u{6709} d"),
        );
        assert_eq!(stream, spell, "ymd \u{4e0e}\u{90a3}\u{4e09}\u{4e2a}\u{6570}\u{5b57}\u{8be5}\u{662f}\u{540c}\u{4e00}\u{5957}");
        let line_start = now.get::<i64>("wday").expect("\u{6709} wday");
        assert!(
            (0..=6).contains(&line_start),
            "\u{661f}\u{671f}\u{8be5}\u{5728} 0~6\u{ff0c}\u{5b9e}\u{9645} {line_start}"
        );
    }

    fn zero_point_and_stream(now: &DateTime<FixedOffset>) -> (String, i64) {
        let stream = format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day());
        (
            stream,
            now.timestamp_millis() - local_zero_point_number_description(now),
        )
    }
}
