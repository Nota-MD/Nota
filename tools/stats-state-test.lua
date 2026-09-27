-- 写作统计（原名「写作心电图」）：**无头状态机测试**（跑的是 `plugins/stats/main.lua`）。
--
-- 跑法（在仓库根目录，**要用容器里的 lua**）：
--
-- ```sh
-- podman exec -u 1000 -w "$PWD" tauri-dev lua tools/stats-state-test.lua
-- ```
--
-- 为什么要它：这一批的行为全在"时间怎么走"上（采样、断档、暂停、结算、冻结），
-- 而**开窗点按钮只能看到某一瞬间的画面**——`GAP_MS`（15 秒）与 `MIN_SPAN_MS`
-- （10 秒）那两条分支靠手点几乎摆不出来。这里桩掉 `nota`，时钟由测试自己推，
-- 每条分支都能精确摆到，而且几毫秒跑完。
--
-- ⚠️ **它抓过一个真 bug**：大数字在暂停时本该冻住，第一版却在暂停期间继续往下
-- 掉（69 → 53）——开窗那一帧看着"正常"，只有把两条时间线摆开才看得出来。
-- 第 (10) 段就是它的回归测试。
--
-- ⚠️ 桩里 `i18n.text` 一律返回 `nil` —— 插件那条 `T()` 拿不到译文时**退回原文**，
-- 所以断言里写的就是 `main.lua` 里那串中文。**改文案必须同批改这里**。
--
-- ⚠️⚠️ **标识符一律 ASCII**：中文标识符是 Lua 的语法错误（`main.lua` 头上记着
-- 同一个坑），这份文件第一版就栽在上面。
--
-- ⚠️ 路径**按脚本自己的位置算**（`arg[0]`），不写死仓库绝对路径：谁 clone 到
-- 哪儿都能跑。所以**必须从仓库根目录跑**（上面那条命令就是）。
--
-- ⚠️ 桩里那个 `time` / `data` 得是 `pcall` 收得住的形状：插件那两处都包了
-- `pcall`（"拿不到就别说"，与 `document.stats()` 同规矩）。
--
-- # 两份实例，两条路
--
-- 2026-09-27 加了"今日那本账"（`nota.time` ＋ `nota.data`）之后，插件有了**两条
-- 分支**，而这两条都得测：
--
-- * **第一份实例**（(1)~(11)）：桩里**没有** `time` / `data` —— 就是"拿不到时间
--   来源"那条路。整套"今日"都不该出现（面板上没有那一行、也没有那颗按钮），
--   而本轮照记不误。
-- * **第二份实例**（(12)~）：桩里**有** `time`（假的墙上时间，起点 2026-09-27
--   22:00）与 `data`（假磁盘）。这里测两本账同口径、跨天翻页、两个分享图上的
--   刻度、以及落盘/读回/只留最近七天。

local HERE = (arg and arg[0] or ""):match("^(.*)[/\\][^/\\]*$") or "."
local MAIN = HERE .. "/../plugins/stats/main.lua"

-- ⚠️ `main.lua` 2026-09-27 起会 `require("ticks")`（插件多文件）。在**沙箱里**那个 require
-- 由宿主接管、只在插件自己那个目录里找（`lua/mod.rs` 的 `装require`）；这里是**真的 Lua
-- `require`**，所以得自己把那个目录塞进 `package.path`（默认那条 `./?.lua` 是相对**当前
-- 工作目录**的，从仓库根跑就找不到 `plugins/stats/ticks.lua`）。
package.path = HERE .. "/../plugins/stats/?.lua;" .. package.path

local fails = 0
local function eq(actual, want, what)
  if actual == want then
    print("  ok   " .. what .. " = " .. tostring(actual))
  else
    fails = fails + 1
    print("  FAIL " .. what .. ": want [" .. tostring(want) .. "] got [" .. tostring(actual) .. "]")
  end
end

-- 假的墙上时间：起点 2026-09-27 22:00，`ms` 是插件那个**单调**时钟的读数。
-- ⚠️ 只在 9 月里推（这份测试用不到月末）。
local function wall(ms)
  local total = 22 * 60 + math.floor(ms / 60000)
  local day, mi = math.floor(total / 1440), total % 1440
  return {
    now_ms = ms,
    ymd = string.format("2026-09-%02d", 27 + day),
    y = 2026,
    mo = 9,
    d = 27 + day,
    hh = math.floor(mi / 60),
    mi = mi % 60,
  }
end

-- 一个桩。`opts.time` / `opts.data` 为假时**不给**那两个 API：那正是第一份实例
-- 要走的"拿不到时间来源"那条路。`opts.store` 可以塞一份预先写好的"磁盘"进去。
local function make_nota(opts)
  local box = { cmds = {}, store = opts.store or {}, writes = 0, now = 0, words = 100, path = "A" }
  local n = {
    i18n = { text = function() return nil end },
    ui = {
      register_panel = function(spec)
        box.panel, box.id = spec, spec.id
        return spec.id
      end,
      refresh = function() end,
      notify = function() end,
    },
    command = { register = function(name, fn) box.cmds[name] = fn end },
    document = {
      stats = function()
        return { words = box.words, lines = 1, clock_ms = box.now, path = box.path }
      end,
    },
  }
  if opts.time then
    n.time = { now = function() return wall(box.now) end }
  end
  if opts.data then
    n.data = {
      read = function(name) return box.store[name] end,
      write = function(name, text)
        box.store[name] = text
        box.writes = box.writes + 1
        return true
      end,
      remove = function(name) box.store[name] = nil; return true end,
      dir = function() return "/tmp/nota-stats-test" end,
    }
  end
  return n, box
end

local function load(opts)
  local n, box = make_nota(opts)
  -- ⚠️ 清掉那三个**模块级缓存**：沙箱里**每加载一份插件就是一份新的 Lua**（`lua/mod.rs`
  -- 里一次 `硬化的_lua()`），模块缓存本来就不跨实例。不清的话第二份实例拿到的是第一份
  -- 那个已经绑好译文的 `ticks` / `long`（两个都有 `T`），"两份实例互相串味"这类问题就
  -- 测不出来了。⚠️ `ledger` 没有 `T`，但它跟另外两个一样是"每份插件一份"，一起清掉省得
  -- 以后往它里面加状态时忘了这一行。
  package.loaded.ticks = nil
  package.loaded.long = nil
  package.loaded.ledger = nil
  local mod = dofile(MAIN)
  mod.on_load(n)
  return mod, box
end

-- 推时钟 / 改字数 / 换文档，然后拉一次面板（就是宿主那一拍做的事）
local function step(box, t, c, p)
  box.now, box.words = t, c
  if p then box.path = p end
  return box.panel.render()
end

local function blk(blocks, kind)
  for _, b in ipairs(blocks) do
    if b.kind == kind then return b end
  end
end

local function fields(blocks)
  local b, out = blk(blocks, "fields"), {}
  if b then
    for _, it in ipairs(b.items) do out[it.label] = it.value end
  end
  return out
end

local function buttons(blocks)
  local b, out = blk(blocks, "buttons"), {}
  if b then
    for _, it in ipairs(b.items) do table.insert(out, it.label) end
  end
  return table.concat(out, "|")
end

local function bignum(blocks)
  local b = blk(blocks, "chart")
  if not b then return "(no chart)" end
  if b.value == "" then return "-" end
  return b.value
end

local function chartlabel(blocks)
  local b = blk(blocks, "chart")
  return b and b.label or "(no chart)"
end

local function npoints(blocks)
  local b = blk(blocks, "chart")
  return b and #b.points or -1
end

local function hasText(blocks, want)
  for _, b in ipairs(blocks) do
    if b.kind == "text" and b.text == want then return true end
  end
  return false
end

-- 一块图上的刻度写成 "位置=标签|位置=标签"（位置留三位小数），方便一眼比对。
local function ticks(blocks, kind)
  local b = blk(blocks, kind or "chart")
  if not b or not b.x_ticks then return "(no ticks)" end
  local out = {}
  for _, t in ipairs(b.x_ticks) do
    table.insert(out, string.format("%.3f=%s", t.at, t.label))
  end
  return table.concat(out, "|")
end

-- 数一数账本里有几天（`d ` 行的条数）。
-- ⚠️ 不认日期长什么样：(19) 后半段那 405 天用的是**假日期**（`1000-0001` 这种），
--    它们只要够多、够排得开就行——那一段考的是"排序后丢最老的"，日期真不真无关。
local function day_lines(text)
  local n = 0
  for _ in text:gmatch("d %S+ ") do n = n + 1 end
  return n
end

-- `n` → `YYYY-MM-DD`（Howard Hinnant 的 `civil_from_days`，与 `ticks.day_number` 互逆）。
-- ⚠️ 测试这一份**故意自己写一遍**：拿 `ticks.day_number` 反推的话，那个函数里错一个符号
--    会两边一起错、什么也测不出来。下面 (21) 里那几个硬写死的数字来自另一套实现
--    （Python 的 `datetime.date`），两边对得上才算真的对。
local function civil_text(n)
  local z = n + 719468
  local era = math.floor(z / 146097)
  local doe = z - era * 146097
  local yoe = math.floor((doe - math.floor(doe / 1460) + math.floor(doe / 36524) - math.floor(doe / 146096)) / 365)
  local y = yoe + era * 400
  local doy = doe - (365 * yoe + math.floor(yoe / 4) - math.floor(yoe / 100))
  local mp = math.floor((5 * doy + 2) / 153)
  local d = doy - math.floor((153 * mp + 2) / 5) + 1
  local m = mp + (mp < 10 and 3 or -9)
  if m <= 2 then y = y + 1 end
  return string.format("%04d-%02d-%02d", y, m, d)
end

-- ============ 第一份实例：桩里没有 time / data ==========================

local _, box1 = load({})
local panel, cmds = box1.panel, box1.cmds

print("-- (1) idle --")
assert(panel ~= nil, "panel not registered")
-- ⚠️ 面板 id 是 `stats`：2026-09-27 跟着插件改名一起从 `heartbeat` 换掉了
--    （当时还没有用户，所以没写一次性搬家，见 `plugins/stats/plugin.toml` 头上那段）。
assert(box1.id == "stats", "panel id")
assert(panel.live == true, "live is not true")
local s = step(box1, 0, 100)
eq(buttons(s), "开始记录", "buttons (no time source -> no day card to make)")
eq(fields(s)["整份文档"], "100 字", "whole doc")
eq(fields(s)["今天"], nil, "no 今天 line without a time source")
eq(bignum(s), "(no chart)", "bignum (idle draws no chart)")

print("-- (2) start -> sampling --")
cmds.start()
s = step(box1, 2000, 100)
eq(buttons(s), "暂停|终止", "buttons")
eq(fields(s)["本轮写了"], "0 字", "written right after start")
s = step(box1, 4000, 110)
s = step(box1, 6000, 125)
s = step(box1, 8000, 140)
eq(fields(s)["本轮写了"], "40 字", "written")
eq(fields(s)["记录时长"], "6 秒", "elapsed")
eq(fields(s)["整份文档"], "140 字", "whole doc")
eq(npoints(s), 3, "plot points")

print("-- (3) switch document -> auto pause --")
s = step(box1, 10000, 5, "B")
eq(buttons(s), "继续|终止", "buttons")
eq(fields(s)["本轮写了"], "40 字", "written (unchanged)")
eq(fields(s)["记录时长"], "6 秒", "elapsed (unchanged)")
eq(hasText(s, "已暂停。这期间打的字不算进这一轮——按「继续」接着算。"), true, "pause notice")

print("-- (4) typing while paused does not count --")
s = step(box1, 14000, 60, "B")
eq(fields(s)["本轮写了"], "40 字", "written (55 words typed while paused)")
eq(fields(s)["记录时长"], "6 秒", "elapsed")

print("-- (5) resume --")
cmds.resume()
s = step(box1, 16000, 60, "B")
s = step(box1, 18000, 70, "B")
eq(buttons(s), "暂停|终止", "buttons")
eq(fields(s)["本轮写了"], "50 字", "written (only the 10 after resume)")
eq(fields(s)["记录时长"], "8 秒", "elapsed")
eq(npoints(s), 4, "plot points")

print("-- (6) gap -> accumulate but no point, no peak --")
-- The gap deliberately carries a HUGE delta (+1000): "accumulate only" and
-- "also plot it" differ only in the peak, so a small delta would not test it.
s = step(box1, 60000, 1070, "B")
eq(fields(s)["本轮写了"], "1050 字", "written (gap counted)")
eq(fields(s)["记录时长"], "50 秒", "elapsed (gap counted)")
eq(npoints(s), 4, "plot points (this tick left no point)")
eq(fields(s)["峰值速度"], "450 字/分钟", "peak (would be 1428 if the gap were plotted)")

print("-- (7) stop -> summary --")
cmds.stop()
s = step(box1, 62000, 1070, "B")
eq(buttons(s), "再来一轮|制作本轮分享图", "buttons (round card offered, day card not)")
eq(chartlabel(s), "本轮平均速度", "chart label switches to whole round")
eq(bignum(s), "1260", "bignum = round average (1050 words / 50 s)")
eq(fields(s)["本轮写了"], "1050 字", "written")
eq(fields(s)["记录时长"], "50 秒", "elapsed")
eq(fields(s)["峰值速度"], "450 字/分钟", "peak")
eq(hasText(s, "这一轮，你写下了 1,050 个字。"), true, "summary line (thousands separator)")
eq(ticks(s), "0.000=-58 秒|0.500=-29 秒|1.000=现在", "live chart x ticks")

print("-- (8) done accumulates nothing (and doc switch does not pause) --")
s = step(box1, 120000, 9999, "B")
eq(fields(s)["本轮写了"], "1050 字", "written (frozen)")
eq(fields(s)["记录时长"], "50 秒", "elapsed (frozen)")
s = step(box1, 200000, 9999, "C")
eq(buttons(s), "再来一轮|制作本轮分享图", "buttons (done + doc switch is not a pause)")

print("-- (9) start another round -> reset --")
cmds.start()
s = step(box1, 202000, 9999, "C")
eq(fields(s)["本轮写了"], "0 字", "written")
eq(fields(s)["记录时长"], "0 秒", "elapsed")
eq(bignum(s), "-", "bignum (not enough samples yet)")

print("-- (10) bignum freezes while paused (regression: it used to keep sliding) --")
-- NOTE: start from 9999, the length step (9) left behind. Starting from a smaller
-- number makes the first tick look like a deletion (clamped to 0) and the count
-- comes out one sample short.
local t, c = 202000, 9999
for _ = 1, 8 do
  t, c = t + 2000, c + 20
  s = step(box1, t, c, "C")
end
eq(bignum(s), "600", "live reading (20 words every 2 s)")
cmds.pause()
s = step(box1, t + 2000, c, "C")
eq(bignum(s), "600", "right after pause")
s = step(box1, t + 22000, c, "C")
eq(bignum(s), "600", "still 600 twenty seconds later")

print("-- (11) still does not count while paused; resume counts only new --")
s = step(box1, t + 40000, c + 100, "C")
eq(fields(s)["本轮写了"], "160 字", "written (the 100 typed while paused do not count)")
cmds.resume()
s = step(box1, t + 42000, c + 100, "C")
s = step(box1, t + 44000, c + 130, "C")
eq(fields(s)["本轮写了"], "190 字", "written (the 30 after resume count)")

-- ============ 第二份实例：有 time ＋ data（今日那本账、分享图、刻度）======

local _, box2 = load({ time = true, data = true })
local cmds2 = box2.cmds

print("-- (12) 今日那本账：同一支代码、同一口径 --")
s = step(box2, 0, 100)
eq(fields(s)["今天"], nil, "0 字的今天不占地方（那条记录已经建好了）")
cmds2.start()
eq(box2.writes, 1, "start flushes once (rounds +1)")
s = step(box2, 10000, 110) -- ⚠️ 这一枪只是重新立基线（「开始」把基线清了），+10 不算
s = step(box2, 20000, 130) -- +20，同一分钟（22:00）
eq(fields(s)["今天"], "20 字 · 1 轮", "today's line")
eq(fields(s)["本轮写了"], "20 字", "round total is the same number")
eq(box2.writes, 1, "plain ticks do not write to disk")
s = step(box2, 440000, 190) -- 断档 7 分钟：+60 只累加
eq(fields(s)["今天"], "80 字 · 1 轮", "gap still counts into today")
s = step(box2, 450000, 200) -- +10，22:07
s = step(box2, 460000, 210) -- +10，22:07
eq(fields(s)["今天"], "100 字 · 1 轮", "today total")
eq(fields(s)["本轮写了"], "100 字", "round total (same accrual)")

print("-- (13) 暂停期间今日那本账也不动 --")
cmds2.pause()
s = step(box2, 470000, 310) -- 暂停里打 100 字
eq(fields(s)["今天"], "100 字 · 1 轮", "today unchanged while paused")
cmds2.resume()
cmds2.stop()

print("-- (14) 落盘：days.txt 的格式与内容 --")
local f = box2.store["days.txt"]
eq(type(f) == "string", true, "days.txt written")
eq(f:match("^v1\n") ~= nil, true, "first line is the version")
eq(f:match("d 2026%-09%-27 100 450000 120 1\n") ~= nil, true, "d line: ymd words ms peak rounds")
eq(f:match("m 2026%-09%-27 1320 20\n") ~= nil, true, "m line: 22:00 -> 20 words")
eq(f:match("m 2026%-09%-27 1327 20\n") ~= nil, true, "m line: 22:07 -> 20 words")

print("-- (15) 本轮分享图：字段、点数、刻度 --")
cmds2.share_round()
s = step(box2, 460000, 210)
local card = blk(s, "share")
eq(card ~= nil, true, "share screen is up")
eq(buttons(s), "返回", "share screen has one button")
eq(card.title, "写作统计", "title")
eq(card.subtitle, "Writing Stats", "subtitle")
eq(card.date, "2026年9月27日 22:07", "date line")
eq(card.label, "本轮平均速度", "big number label")
eq(card.value, "13", "round average (100 words / 450 s)")
eq(card.unit, "字 / 分钟", "unit")
eq(#card.points, 8, "8 round-minutes (0..7)")
eq(card.points[1], 20, "minute 0")
eq(card.points[2], 0, "minute 1 is a zero, not skipped")
eq(card.points[8], 20, "minute 7")
eq(ticks(s, "share"), "0.000=开始|0.571=4 分|1.000=结束", "round card x ticks")
eq(card.stats[1].k .. card.stats[1].v .. card.stats[1].small, "总字数100字", "stat 1")
eq(card.stats[2].k .. card.stats[2].v, "时长7:30", "stat 2 (colon clock, not 7 分 30 秒)")
eq(card.stats[3].k .. card.stats[3].v .. card.stats[3].small, "峰值120字/分", "stat 3")
eq(card.foot, "这一轮，你写下了 100 个字", "foot")
eq(card.file, "nota-stats-round-20260927-2207.png", "file name")

print("-- (16) 今日分享图：钟点刻度、补 0、文件名带日期 --")
cmds2.share_close()
cmds2.share_day()
s = step(box2, 460000, 210)
card = blk(s, "share")
eq(card.label, "今日平均速度", "big number label")
eq(card.value, "13", "today average")
eq(#card.points, 8, "8 numbers of the day (22:00..22:07)")
eq(card.points[1], 20, "22:00")
eq(card.points[2], 0, "22:01 is a zero (the panel was not open)")
eq(card.points[8], 20, "22:07")
eq(ticks(s, "share"), "0.000=22:00|0.571=22:04|1.000=22:07", "day card x ticks are clock times")
eq(card.stats[1].k .. card.stats[1].v .. card.stats[1].small, "今日写了100字", "stat 1")
eq(card.stats[3].k .. card.stats[3].v .. card.stats[3].small, "今日峰值120字/分", "stat 3")
eq(card.foot, "今天，你写下了 100 个字", "foot")
eq(card.file, "nota-stats-day-2026-09-27.png", "file name carries the date")
cmds2.share_close()
s = step(box2, 460000, 210)
eq(buttons(s), "再来一轮|制作本轮分享图|制作今日分享图", "back to the done screen")

print("-- (17) 跨天：翻页不是清零 --")
cmds2.start() -- 新一轮（此刻还是 09-27，所以那一轮记在 09-27 头上）
s = step(box2, 470000, 210) -- 这一枪只是重新立基线
eq(fields(s)["今天"], "100 字 · 2 轮", "rounds counter went up on the day it started")
s = step(box2, 7260000, 240) -- 2026-09-28 00:01（断档 1 小时 53 分）：+30 记到新的一天
eq(fields(s)["今天"], "30 字 · 0 轮", "the new day starts its own account")
eq(fields(s)["本轮写了"], "30 字", "the round carried over midnight")
cmds2.stop()
f = box2.store["days.txt"]
eq(f:match("d 2026%-09%-27 100 450000 120 2\n") ~= nil, true, "yesterday's line is still there")
eq(f:match("d 2026%-09%-28 30 ") ~= nil, true, "and today's line is appended")
eq(f:match("^v1\nd 2026%-09%-27") ~= nil, true, "days are written in date order")

print("-- (18) 重新加载：账读得回来（含分钟格）--")
local _, box3 = load({ time = true, data = true, store = box2.store })
s = box3.panel.render() -- 这个实例的时钟又回到 2026-09-27 22:00
eq(fields(s)["今天"], "100 字 · 2 轮", "yesterday's account came back from disk")
box3.cmds.share_day()
s = box3.panel.render()
card = blk(s, "share")
eq(#card.points, 8, "the minute buckets came back too")
eq(card.points[1], 20, "22:00")
eq(card.points[8], 20, "22:07")

print("-- (19) 账本的两刀：日账留 400 天，分钟账只留最近 7 天 --")
-- ⚠️ 2026-09-27 之前是"整天只留 7 天"。热力图要的是长期（用户：「记录长期数据」），
--    所以日账那一行改留 400 天，而**分钟账**（一天最多 1440 行）仍然只留 7 天——
--    两刀分开算，常量与理由在 `ledger.lua` 头上。
local lines, seed = { "v1" }, {}
for day = 1, 9 do
  table.insert(lines, string.format("d 2026-09-%02d 10 60000 60 1", day))
  -- 每天都塞一格分钟账：这样才看得出哪几天被抹掉了。
  table.insert(lines, string.format("m 2026-09-%02d 600 5", day))
end
seed["days.txt"] = table.concat(lines, "\n") .. "\n"
local _, box4 = load({ time = true, data = true, store = seed })
box4.panel.render() -- 立"今天"那条（09-27）
box4.cmds.start() -- 脏了 → 落盘
local f4 = box4.store["days.txt"]
eq(day_lines(f4), 10, "day rows are all kept (ten days is far below 400)")
eq(f4:match("d 2026%-09%-01") ~= nil, true, "the oldest seeded day still has its day row")
eq(f4:match("d 2026%-09%-27") ~= nil, true, "today is there too")
-- 分钟账那一刀：`keys` 升序排完只留最后 7 天（09-04..09-09 ＋ 09-27），前面三天
-- **只丢分钟账、日账留着**（那句"那天写了多少字"在 `d` 行里，热力图还要用）。
eq(f4:match("m 2026%-09%-03") == nil, true, "an old day's minute buckets are dropped")
eq(f4:match("m 2026%-09%-04") ~= nil, true, "the newest seven days keep theirs")
eq(f4:match("m 2026%-09%-09") ~= nil, true, "09-09 keeps its minute bucket")
eq(f4:match("d 2026%-09%-03") ~= nil, true, "…and that old day's day row survives")

-- 日账那一刀的另一半：超过 400 天时从**最老**那头丢。⚠️ 这一段用**假日期**
-- （`1000-0001`）：它只考"排完序丢掉最老的几个"，而真造 405 个真日期要在测试里
-- 再写一遍日历；假日期全排在 `2026-09-27` 前面（字典序），该丢的必然是最老那头。
local lines400 = { "v1" }
for k = 1, 405 do
  table.insert(lines400, string.format("d 1000-%04d 10 60000 60 1", k))
end
local _, box4b = load({
  time = true,
  data = true,
  store = { ["days.txt"] = table.concat(lines400, "\n") .. "\n" },
})
box4b.panel.render()
box4b.cmds.start()
local f4b = box4b.store["days.txt"]
eq(day_lines(f4b), 400, "the day rows are capped at 400")
eq(f4b:match("d 1000%-0001") == nil, true, "the oldest rows are the ones dropped")
eq(f4b:match("d 1000%-0405") ~= nil, true, "the newest seeded row survives")
eq(f4b:match("d 2026%-09%-27") ~= nil, true, "and today is there too")

print("-- (20) 全天：横轴变整点标尺（大一号），并且带上小格 --")
-- 用户 2026-09-27：「如果是全天的话，那就一个小时为一个单位的横坐标标尺」＋「到小时就用
-- 稍微大一点的字体标出来是几小时」。这里摆一个**十小时**的一天（09:00~19:00，每 10 秒
-- 十个字）——装的是 `ticks.day_ticks` 那条分支，也是"整点"唯一摆得出来的跨度。
-- ⚠️ `wall()` 的起点是 09-27 22:00，所以"第二天早上九点" = (1440+540-1320) 分钟。
-- ⚠️ **一枪只推 10 秒**（不是半小时）：两次采样隔得比 `GAP_MS`（15 秒）久就是断档，
--    那种枪只累加总数、**不落分钟格**（`take_sample` 里那条分支）——半小时一枪的话，
--    这一整天的分钟账全是空的，图也就画不出来。第一版就是这么摆错的。
local _, box5 = load({ time = true, data = true })
box5.cmds.start()
local nine_am = (1440 + 540 - 1320) * 60000
for k = 0, 3600 do -- 3600 × 10 秒 = 10 小时
  step(box5, nine_am + k * 10000, 100 + 10 * k) -- 每 10 秒 +10 字
end
box5.cmds.stop()
box5.cmds.share_day()
s = box5.panel.render()
card = blk(s, "share")
eq(card.x_ticks[1].at, 0, "the first hour tick sits at the left edge")
eq(card.x_ticks[1].label, "09:00", "hour labels are clock times")
eq(card.x_ticks[1].big, true, "and they are marked big (大单位)")
eq(#card.x_ticks, 11, "09:00..19:00 is 11 ticks (<= 13, the host's cap)")
eq(card.x_ticks[11].label, "19:00", "the last tick is the last whole hour")
eq(card.x_minor, 4, "quarter-hour minor ticks between the hours")
-- ⚠️ 每一档都必须是整点：有一条不整就说明 `day_ticks` 是从 `first` 起数的（那样每一档
--    都是 09:07 这种数，读起来全是噪音）。
local all_whole = true
for _, t in ipairs(card.x_ticks) do
  if not t.label:match("^%d%d:00$") then all_whole = false end
end
eq(all_whole, true, "every tick lands on a whole hour")
-- 本轮那张卡片也带小格（那半同样是"仪器的标尺"）。
box5.cmds.share_round()
s = box5.panel.render()
eq(blk(s, "share").x_minor, 4, "the round card has minor ticks too")

print("-- (21) 长期那本账：窗口、三个数、热力图那张卡 --")
-- 先单独验两个纯算术的工具（`ticks.lua` 尾巴上那一段）。⚠️ 期望值**硬写死**，
-- 来自另一套实现（Python 的 `datetime.date`）：2026-09-27 是周日、距 1970-01-01
-- 20723 天，本周周一是 09-21（20717）。
local ticks = require("ticks")
eq(ticks.day_number(2026, 9, 27), 20723, "day_number agrees with Python's calendar")
eq(ticks.day_number(2000, 2, 29), 11016, "leap day")
eq(ticks.day_number(1970, 1, 1), 0, "the epoch itself")
eq(ticks.day_number(2026, 13, 1), nil, "month 13 is not a date")
eq(ticks.day_number(2026, 0, 1), nil, "month 0 is not a date")
eq(ticks.ymd_number("2026-09-27"), 20723, "ymd_number reads the ledger's format")
eq(ticks.ymd_number("2026-9-27"), nil, "but the ledger's format is fixed-width")
eq(ticks.ymd_number(20723), nil, "and it only takes strings")
eq(ticks.monday_of(20723), 20717, "2026-09-27 is a Sunday — its Monday is 09-21")
eq(ticks.monday_of(20719), 20717, "Wednesday 09-23 is in the same week")
eq(ticks.monday_of(20717), 20717, "a Monday is its own Monday")
eq(civil_text(ticks.day_number(2026, 9, 27)), "2026-09-27", "…and the round trip closes")
eq(ticks.group_text(128400), "128,400", "thousands separators")
eq(ticks.group_text(999), "999", "no leading comma when the digits divide by three")
eq(ticks.group_text(1000), "1,000", "four digits")
eq(ticks.group_text(0), "0", "zero")

-- 一本**像真的**账：从 2026-05-11（周一）写到 09-26，五天里有四天动笔，工作日多、
-- 周末少。五天里有四天动笔 → 139 天里 105 天有字。
--
-- ⚠️ 另外塞一条**老账**（2026-01-01，9999 字）：这一条把两件事一起考了——
--
--   1. 窗口按"**最早那条有字的记录**"起算，于是它一路顶到 26 周那个**天花板**
--      （用户要的是"长期"，但半年那张图铺满一屏就到头了）；
--   2. 顶到天花板之后，这条老账**自己反倒落在窗口外**：它一个数都不许进
--      （账本留 400 天，比 26 周长得多）。"图上有几格"与"总字数算哪些天"
--      必须是同一段窗口,不然数对不上图。
local rows21, lines21 = {}, { "v1" }
local FIRST_N, TODAY_N = 20584, 20723 -- 2026-05-11 … 2026-09-27（硬写死的两个端点）
local WINDOW_N = 20542 -- 2026-03-30：26 周那个上限下窗口的第一天
for k = 0, 138 do
  local n = FIRST_N + k
  local words
  if k % 4 == 3 then
    words = 0
  elseif k % 7 >= 5 then
    words = 200 + (k * 7) % 300
  else
    words = 1200 + (k * 37) % 1800
  end
  table.insert(rows21, { n = n, words = words })
  table.insert(lines21, string.format("d %s %d 600000 60 1", civil_text(n), words))
end
table.insert(lines21, "d 2026-01-01 9999 600000 60 1")
local _, box6 = load({
  time = true,
  data = true,
  store = { ["days.txt"] = table.concat(lines21, "\n") .. "\n" },
})
local s6 = box6.panel.render()

local want_total, want_held, want_max = 0, 0, 0
for _, row in ipairs(rows21) do
  want_total = want_total + row.words
  if row.words > 0 then want_held = want_held + 1 end
  if row.words > want_max then want_max = row.words end
end

local view = blk(s6, "heatmap")
eq(view ~= nil, true, "the panel shows the long-term block")
eq(view.weeks, 26, "the window tops out at 26 weeks (half a year)")
eq(view.to, "2026-09-27", "…and ends today")
eq(view.title, "长期记录", "the block's title")
eq(view.unit, "字", "the block's unit (the cell tooltips use it)")
eq(view.days:sub(1, 10), civil_text(FIRST_N), "the string starts at the first day of the window")
eq(view.days:find(civil_text(FIRST_N) .. ":" .. rows21[1].words, 1, true) ~= nil, true, "…with that day's count")
eq(view.days:find(civil_text(FIRST_N + 3) .. ":0", 1, true) ~= nil, true, "zero days are sent too")
eq(view.days:find("2026-01-01", 1, true) == nil, true, "a row outside the window is not")
eq(select(2, view.days:gsub(":%d+", "")), 140, "140 days in the window (139 + today)")
eq(view.days:sub(-12), "2026-09-27:0", "and the last one is today")
eq(WINDOW_N < FIRST_N, true, "the window starts before the first row we seeded (that is the point)")
eq(ticks.ymd_number("2026-01-01") < WINDOW_N, true, "…and the stray January row falls before it")

-- 那一句人话（面板上那行字与卡片页脚是**同一份**）。
eq(
  hasText(s6, string.format("最近 26 周，你在 %d 天里写下了 %s 个字", want_held, ticks.group_text(want_total))),
  true,
  "the panel says the same numbers the grid draws"
)

box6.cmds.share_long()
s6 = box6.panel.render()
local heat = blk(s6, "share")
eq(heat.shape, "heat", "the long card is the heatmap shape")
eq(heat.weeks, 26, "…with the same window")
eq(heat.days == view.days, true, "the card and the panel use one window, not two")
eq(heat.less, "少", "the low end of the legend")
eq(heat.more, "多", "the high end of the legend")
eq(heat.label, "长期总字数", "the big number's label")
eq(heat.value, ticks.group_text(want_total), "the total is the window's total")
eq(heat.unit, "字", "…in 字")
eq(heat.stats[1].v, tostring(want_held), "days with writing")
eq(heat.stats[2].v, ticks.group_text(math.floor(want_total / want_held + 0.5)), "daily average")
eq(heat.stats[3].v, ticks.group_text(want_max), "busiest day")
eq(heat.foot, string.format("最近 26 周，你在 %d 天里写下了 %s 个字", want_held, ticks.group_text(want_total)), "the footer")
eq(heat.file, "nota-stats-long-2026-09-27.png", "the file name carries today")
-- ⚠️ 极值是 0 字那一天之前算出来的：那一天的格子仍然是**空格**（不是最浅那一档），
--    所以档位是拿"有字那些天"的最大值分的——由宿主那边分档（`ui/heatmap.ts`）。
eq(want_max > 0, true, "the fixture really does have writing")

print("-- (22) 账本刚开张：窗口兜底 8 周；一个字没写就不画那一块 --")
local _, box7 = load({
  time = true,
  data = true,
  store = { ["days.txt"] = "v1\nd 2026-09-26 0 0 0 0\n" },
})
local s7 = box7.panel.render()
eq(blk(s7, "heatmap") == nil, true, "a ledger with nothing written draws no heatmap")
eq(hasText(s7, "还没开始。按「开始记录」，这一轮写了多少字、用了多久、什么速度，就都算起来了。"), true, "the idle screen is untouched")
box7.cmds.share_long() -- needs = "long" 不成立 → 不进那一屏
s7 = box7.panel.render()
eq(blk(s7, "share") == nil, true, "and the long card does not open")

local two = {}
for k = 0, 1 do
  two[#two + 1] = string.format("d 2026-09-%02d 800 60000 60 1", 25 + k)
end
local _, box8 = load({
  time = true,
  data = true,
  store = { ["days.txt"] = "v1\n" .. table.concat(two, "\n") .. "\n" },
})
local s8 = box8.panel.render()
local v8 = blk(s8, "heatmap")
eq(v8 ~= nil, true, "two days of writing is enough for the long block")
eq(v8.weeks, 8, "a brand-new ledger still gets the 8-week floor")
eq(v8.to, "2026-09-27", "…ending today")
eq(select(2, v8.days:gsub(":%d+", "")), 3, "and only three days have rows in it")
box8.cmds.share_long()
s8 = box8.panel.render()
local small = blk(s8, "share")
eq(small.shape, "heat", "the long card opens once two days have writing")
eq(small.value, "1,600", "both days counted")
eq(small.stats[1].v, "2", "two days with writing")

print("")
if fails == 0 then
  print("ALL PASS")
else
  print(fails .. " FAILED")
  os.exit(1)
end
