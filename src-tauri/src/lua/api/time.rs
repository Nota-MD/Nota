//! `nota.time` —— 墙钟，**带本地日期**（2026-09-27 加，给心电图"今日"那一步用）。
//!
//! # 为什么插件自己算不出来
//!
//! 沙箱里没有 `os`、没有 `date`（`src/lua/mod.rs::硬化的_lua()` 的白名单），
//! 插件手上唯一的时间是 [`crate::lua::api::document`] 那个 `clock_ms`——
//! 它是**单调钟**（从应用启动算起的毫秒，见 `document.rs` 里那段）。
//! 单调钟做差值是对的，但**回答不了"现在是哪一天"**：它从 0 开始，
//! 没有时区、没有纪元，跨零点时它照样一格一格往上走。
//!
//! # ⚠️ 为什么必须是**本地**日期，不能像 `plugin/package.rs::今天()` 那样用 UTC
//!
//! 那边那条注释写着"为了一个给人看的栏去引 chrono 不值当"——它的判据是
//! **那一栏没人看**（信任表上的 `added_at`，验签不读、界面不显示），所以
//! UTC 在东八区凌晨 0~8 点差一天，是可以接受的代价。
//!
//! 这里**完全不同**：这个日期会被画进**分享图**，用户会把它发出去。
//! "今天是 9 月 26 日"这句话错一天，用户立刻就看得见，而且是**分享给别人之后**
//! 才被指出来的那种错。所以这一处值当引 chrono（理由与 `Cargo.toml` 里那段一致）。
//!
//! # 不需要任何能力
//!
//! 它不读文档、不读磁盘、不读用户的任何数据——只是把系统时钟报一遍。
//! 判据与 `i18n` / `diff` 那两张表一样（见 `api/mod.rs` 顶上那张清单）。
//! ⚠️ 反过来说：**它给不了插件"用户在哪"**——时区偏移是"这台机器此刻的本地时间"
//! 的副产品，不是一条独立的身份信息。
//!
//! # 一次调用给一整套
//!
//! 分成好几个函数（`now_ms()` / `today()` / `now_hm()`）会让插件在**跨零点**时
//! 拿到自相矛盾的两套值（前一个还昨天、后一个已经今天）。所以只有
//! `nota.time.now()` 一个入口，返回一张表，里面那几格**保证来自同一个瞬间**：
//!
//! | 字段 | 是什么 | 干什么用 |
//! |---|---|---|
//! | `now_ms` | Unix 毫秒（墙钟） | 给记录盖时间戳、算"距今多久" |
//! | `day_start_ms` | **本地**今天 0 点的 Unix 毫秒 | 判断某条记录算不算"今天" |
//! | `ymd` | `"2026-09-27"` | 按天分桶的**键**（字符串比较就够，不用再算） |
//! | `y` `mo` `d` `hh` `mi` `ss` | 本地年月日时分秒（数字） | 拼给人看的日期（插件自己按语言拼） |
//! | `wday` | 星期几，**0 = 周一**……6 = 周日 | 同上 |
//! | `tz_offset_min` | 本地相对 UTC 的分钟数（东八区 = 480） | 排查"日期怎么不对"时一眼看得出机器的时区 |

use chrono::{DateTime, Datelike, Local, LocalResult, Offset, TimeZone, Timelike};
use mlua::{Lua, Table};

use super::mlua_to_nota;
use crate::error::Result as NotaResult;

/// 装 `nota.time`。**永远可用**（理由见文件头）。
pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    // ⚠️ 是**函数**不是值：这张表在插件加载时装一次，而插件要的是"调用那一刻"的时间。
    let now = lua
        .create_function(|lua, ()| 装(lua, &Local::now()))
        .map_err(mlua_to_nota)?;
    t.set("now", now).map_err(mlua_to_nota)?;

    Ok(t)
}

/// 把一刻时间装成 Lua 表。见文件头那张表。
fn 装<Tz: TimeZone>(lua: &Lua, 现在: &DateTime<Tz>) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("now_ms", 现在.timestamp_millis())?;
    t.set("day_start_ms", 本地零点毫秒(现在))?;
    t.set(
        "ymd",
        format!("{:04}-{:02}-{:02}", 现在.year(), 现在.month(), 现在.day()),
    )?;
    t.set("y", 现在.year())?;
    t.set("mo", 现在.month())?;
    t.set("d", 现在.day())?;
    t.set("hh", 现在.hour())?;
    t.set("mi", 现在.minute())?;
    t.set("ss", 现在.second())?;
    // `num_days_from_monday()` 是 0 = 周一。**钉死这个口径**：Lua 那边要用它查表，
    // 换个起点就会让"周三"整体挪一天，而那种错只在特定日期看得出来。
    t.set("wday", 现在.weekday().num_days_from_monday())?;
    // ⚠️ `fix()` 那一步不能省：`local_minus_utc` 是 `FixedOffset` 上的方法，
    // 而泛型这儿的 `Tz::Offset` 只知道"能变回一个固定偏移"。对 `Local` 来说
    // 它返回的是**此刻**那个偏移（夏令时的那一天上午下午不一样）。
    t.set("tz_offset_min", 现在.offset().fix().local_minus_utc() / 60)?;
    Ok(t)
}

/// 这一刻所在**本地日**的 0 点，Unix 毫秒。
///
/// ⚠️ 抽成泛型是为了能用 `FixedOffset` 写用例——`Local` 读的是这台机器的时区，
/// 拿它写断言等于"在测试里复述一遍实现"（而且换台机器就飘）。
fn 本地零点毫秒<Tz: TimeZone>(现在: &DateTime<Tz>) -> i64 {
    let 零点 = 现在
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("0 点 0 分 0 秒一定是合法时刻");
    match 现在.timezone().from_local_datetime(&零点) {
        LocalResult::Single(零点) => 零点.timestamp_millis(),
        // 夏令时**回拨**的那一天 0 点出现两次（例：巴西旧制）。取早的那个：
        // 它才是"这一天开始"的那一刻。
        LocalResult::Ambiguous(早, _) => 早.timestamp_millis(),
        // 夏令时**前拨**跳过 0 点（极罕见，一年最多一次，只在个别时区）。
        // 退化成"今天从此刻开始"——那天早些时候的记录会被算进前一天。
        // 这是**有意的**兜底：宁可差一天，也不能 panic（面板每秒都在拉这一枪）。
        LocalResult::None => 现在.timestamp_millis(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    /// 东八区那一刻。
    fn 东八(文本: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(文本).expect("用例里的时间串都是自己写的")
    }

    /// **本地日**才是"今天"，不是 UTC 日。
    ///
    /// ⚠️ 这条是整件事的判据：UTC+8 的用户在北京时间 0 点到 8 点之间写的字，
    /// 用 UTC 算会落到"昨天"——分享图上那句日期就错了。
    #[test]
    fn 日期按本地算而不是按utc算() {
        let 八区 = FixedOffset::east_opt(8 * 3600).expect("东八区合法");
        // UTC 还是 9 月 26 日 16:00，北京已经是 9 月 27 日 0:00。
        let 现在 = DateTime::parse_from_rfc3339("2026-09-26T16:00:00Z")
            .expect("用例时间合法")
            .with_timezone(&八区);
        let 表 = 零点与串(&现在);
        assert_eq!(表.0, "2026-09-27", "北京已经是 27 日了");
        assert_eq!(表.1, 0, "刚好是本地零点，距零点 0 毫秒");

        // 同一个瞬间，换成西五区是 26 日 11:00。
        let 西五 = FixedOffset::west_opt(5 * 3600).expect("西五区合法");
        let 现在 = DateTime::parse_from_rfc3339("2026-09-26T16:00:00Z")
            .expect("用例时间合法")
            .with_timezone(&西五);
        assert_eq!(零点与串(&现在).0, "2026-09-26", "纽约那边还是 26 日");
    }

    /// 距零点多久 = 本地时分秒算出来的那个差，**不是** UTC 的。
    #[test]
    fn 距零点毫秒数是本地时分秒算出来的() {
        let 现在 = 东八("2026-09-27T22:14:33+08:00");
        let (串, 距今) = 零点与串(&现在);
        assert_eq!(串, "2026-09-27");
        assert_eq!(距今, 22 * 3_600_000 + 14 * 60_000 + 33 * 1_000);
    }

    /// 整张表发出去之后，那几个字段**自洽**，而且 `wday` 的起点是周一。
    ///
    /// 2026-09-27 是**周日**，所以 `wday` 该是 6（`num_days_from_monday`）。
    #[test]
    fn 装出来的表自洽且星期从周一起算() {
        let lua = Lua::new();
        let 现在 = 东八("2026-09-27T22:14:33+08:00");
        let t = 装(&lua, &现在).expect("装表不该失败");
        assert_eq!(t.get::<String>("ymd").expect("有 ymd"), "2026-09-27");
        assert_eq!(t.get::<i64>("y").expect("有 y"), 2026);
        assert_eq!(t.get::<i64>("mo").expect("有 mo"), 9);
        assert_eq!(t.get::<i64>("d").expect("有 d"), 27);
        assert_eq!(t.get::<i64>("hh").expect("有 hh"), 22);
        assert_eq!(t.get::<i64>("mi").expect("有 mi"), 14);
        assert_eq!(t.get::<i64>("ss").expect("有 ss"), 33);
        assert_eq!(t.get::<i64>("wday").expect("有 wday"), 6, "周日");
        assert_eq!(t.get::<i64>("tz_offset_min").expect("有偏移"), 480, "东八区");
        let 现在毫秒 = t.get::<i64>("now_ms").expect("有 now_ms");
        let 零点毫秒 = t.get::<i64>("day_start_ms").expect("有 day_start_ms");
        assert_eq!(现在毫秒 - 零点毫秒, 22 * 3_600_000 + 14 * 60_000 + 33 * 1_000);
    }

    /// `nota.time.now()` 真的能调，而且报出来的就是"此刻"。
    ///
    /// ⚠️ 断言只钉**不变量**（随机器时区变，但任何时区都成立的那几条）：
    /// 距本地零点在 `[0, 24h)` 之内、`ymd` 与那三个数字拼得上。钉死具体值
    /// 等于把用例绑在这台机器的时区上。
    #[test]
    fn 调一次now拿到的是一整套当下的时间() {
        let lua = Lua::new();
        let t = build(&lua).expect("装表不该失败");
        let f: mlua::Function = t.get("now").expect("有 now");
        let 现在: Table = f.call(()).expect("调一下不该失败");

        let 零点 = 现在.get::<i64>("day_start_ms").expect("有 day_start_ms");
        let 此刻 = 现在.get::<i64>("now_ms").expect("有 now_ms");
        let 差 = 此刻 - 零点;
        assert!((0..86_400_000).contains(&差), "距本地零点该在一天之内，实际 {差}");

        let 串: String = 现在.get("ymd").expect("有 ymd");
        let 拼 = format!(
            "{:04}-{:02}-{:02}",
            现在.get::<i64>("y").expect("有 y"),
            现在.get::<i64>("mo").expect("有 mo"),
            现在.get::<i64>("d").expect("有 d"),
        );
        assert_eq!(串, 拼, "ymd 与那三个数字该是同一套");
        let 星期 = 现在.get::<i64>("wday").expect("有 wday");
        assert!((0..=6).contains(&星期), "星期该在 0~6，实际 {星期}");
    }

    /// 把一刻时间换成 `(本地日期串, 距本地零点多少毫秒)`，给上面几条断言用。
    fn 零点与串(现在: &DateTime<FixedOffset>) -> (String, i64) {
        let 串 = format!(
            "{:04}-{:02}-{:02}",
            现在.year(),
            现在.month(),
            现在.day()
        );
        (串, 现在.timestamp_millis() - 本地零点毫秒(现在))
    }
}
