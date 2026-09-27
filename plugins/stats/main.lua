-- 写作统计（原名「写作心电图」，2026-09-27 用户要求改名）。
--
-- 用户 2026-09-26（当时叫「写作心电图」）：「写作心电图。统计打字速度，实时显示，
-- 大红字数字/分钟，下方 s-t 图」
-- ＋「参考运动手表的运动记录，有一个开始、暂停、终止」；2026-09-27：「分享支持全日状态，
-- 也应该支持某一次的记录的状态。另外横纵坐标的刻度要标」。
--
-- ⚠️ **逐块的长篇说明在 `docs/13` §14.4**（每一处"为什么这么做"，连"哪条分支手点摆不出来"
-- 都在）。这里只留**写代码时手边必须有**的四件事：状态图、时序三条口径、两本账、ASCII 规矩。
--
-- ⚠️ 第二轮之前它**自动连续计时**（面板一开着就采），用户点名运动手表那套之后改成**显式的一轮**：
--
-- ```text
--   idle ──「开始记录」──▶ running ──「暂停」──▶ paused
--                            ▲                    │
--                            └─────「继续」────────┘
--                            │                    │
--                            └────「终止」─────────┴──▶ done ──「再来一轮」──▶ running
-- ```
--
-- ⚠️ `done` 是**留着结果给人看**，不是清零（清零那一下在「再来一轮」）。
--
-- **时序口径**：① **换文档 = 自动暂停**（不是终止），因为数的原料是**当前这一份文档**的
-- 「字/词」数，切走了就与本轮开头无关——⚠️ 两个都没存过盘的新文档 `path` 都是空串、分不出来，这时
-- 不暂停（已知的粗糙处）；② **面板没开着就不采点**（前端只拉活动页）：那段时间照旧算进**总数
-- 与时长**，但不画点、不算峰值——中间没有采样，画出来是假尖刺；③ 时间只有 `stats().clock_ms`
-- （自 Nota 启动起算的**单调**毫秒，沙箱里没有 `os`），所以「记录时长」是累加出来的。
--
-- **数的是什么**：`stats().words`（当前文档的**「字/词」数**）比上次多了多少——**不读键盘**。
-- 别的窗口里打的字不算；删字不算（负增量按 0）；**粘一大段也算**。
--
-- ⚠️ **2026-09-27 之前这里读的是 `stats().chars`（码点数）**，用户那天点名改了
-- （「注意，**如果是英文的话要统计词**…如果 token 拆分器写的代码量太多的话就不用用了」）：
-- 码点那条口径对中文是对的、对英文是错的（`hello` 算 5 个字，写一句英文读数虚高
-- 四五倍）。现在这一条数的是宿主 `nota.document.stats().words`，规则是
-- **中文一个字算一个 ＋ 一段连续的英文/数字算一个词**（没有分词器，见
-- `src-tauri/src/lua/api/document.rs::词数` 顶上那张规则表）。
-- ⚠️ 于是**历史那几天的账和今天以后不是一个口径**（`days.txt` 里的老数字是码点）。
-- 用户还没有正式用户、`days.txt` 也是本机自己的记录，所以**不做换算、也不加版本字段**；
-- 但**别拿老数据和今天的比**——记录在 `docs/13` §14.4。
--
-- **两本账**（后一本是 2026-09-27 加的）：
--
-- | 账 | 什么时候累加 | 存在哪儿 | 用来画什么 |
-- |---|---|---|---|
-- | **本轮** | 只在 `running` 时 | 内存（`total_add` / `round_mins`） | 面板曲线 ＋ 本轮分享图 |
-- | **今日** | 同上（**同一支代码**） | `nota.data` 的 `days.txt` | 面板的「今天…」 ＋ 今日分享图 |
--
-- ⚠️ 两本账数的是同一件事，只是**键不一样**（本轮按"本轮第几分钟"，今日按"当天第几分钟"）。
-- ⚠️ **只有今日那本落盘**（`data.own`，纯文本，删了只是今天的账从头开始）；本轮是"刚才那场运动"，重启之后还在才是怪的。
--
-- ⚠️ **分享图这边只给字段**（`kind = "share"`：标题、大数字、三格数、点、横轴刻度），
-- 画成什么样是前端的事（`src/ui/share-card.ts`）——理由与"宿主不认识 Markdown"同一条。
--
-- ⚠️⚠️ **变量名一律用 ASCII，中文只许出现在注释和字符串里。** Lua 的标识符不许有非
-- ASCII 字符，写了是**语法错误**——症状是整份插件加载失败、面板和菜单一起消失
-- （`plugins/README.md` 里记过这个坑）。

local M = {}

-- 面板 id。⚠️ 2026-09-27 跟着插件改名一起从 `"heartbeat"` 改成了 `"stats"`——那时
-- 还没有用户，所以没写一次性搬家（`plugin.toml` 顶上那一段写着这件事）。
local PANEL_ID = "stats"

-- 历史和曲线留这么久（毫秒）。三分钟：260px 宽的一栏里每秒一个点就是 180 个。
local KEEP_MS = 180000

-- 算"最近一分钟"那个大数字用的滑动窗口（毫秒）。
local WINDOW_MS = 60000

-- 数据跨度短于这么久就**不给数字**（画一个破折号）。
-- ⚠️ 不是"算不出来"，是**样本太少时那个数没有意义**：两秒钟打了三个字，乘出来是 90 字/分钟，而那不是任何人的写作速度，是一个除法。
-- ⚠️ `running`（最近一分钟）与 `done`（整轮）**两处都用它**。
local MIN_SPAN_MS = 10000

-- 两次采样隔得比这久 = 中间断档（面板没开着）。
-- ⚠️ 第二轮起它**不再重置本轮**（一轮是由"开始/终止"划的），只决定"这一枪要不要画到曲线上"——见文件头那段与 `tick`。
local GAP_MS = 15000

-- 图上最多给多少个点。前端还有一道同样的上限（`ui/panel-nodes.ts::每块上限`）。
local MAX_POINTS = 200

-- 本轮的状态（状态图见文件头）。⚠️ 用字符串而不是数字：日志里"3 是什么"是记不住的。
-- ⚠️ 它是**模块级**的：整份插件活着它就活着，**应用一重启就没了**（本轮不落盘）。
local phase = "idle"

-- 采样序列，一项 = `{ t = 时刻, dt = 这一段有多久, add = 这一段长了几个字 }`。
-- ⚠️ 存 `dt` / `add` 而**不是**存算好的速度（理由见 `docs/13` §14.4「加权怎么算」）。
local samples = {}

-- **本轮**每分钟的字/词数（键 = 本轮第几分钟，从 0 起，值 = 那一分钟写了多少「字/词」）。
-- ⚠️ 面板曲线用 `samples`（最近三分钟、逐秒），**分享图用这一份**（整轮）。两份只是
-- 粒度不同，不是两个真相源——都在 `take_sample` 那一处累加。
local round_mins = {}

-- 上一次采样。`nil` = 还没有基线（刚开始，或者刚「继续」）。
local last_t = nil
local last_words = nil

-- 上一次看到的文档路径。用来认"用户换文档了"（→ 自动暂停）。
local last_path = nil

-- 本轮累计：写了多少字、跑了多久、峰值。
-- ⚠️ 是**累加**出来的，不是 `words - 起点词数`：后者会把**暂停期间**打的字也算进来。
local total_add = 0
local elapsed_ms = 0
local peak_rate = 0

-- `paused` 时冻结的那个读数（**为什么必须冻**见 `docs/13` §14.4「冻结」那一行）。
-- ⚠️ 它由 `panel_content` 每一枪更新，不在 `take_sample` 里再写一遍（两个真相源）。
local frozen_rate = nil

-- ── 今日那本账（跨轮、落盘）────────────────────────────────────────────────
--
-- ⚠️ **文件格式那一半 2026-09-27 搬去了 `ledger.lua`**（`require`，插件多文件的
-- 第三个用户）：长期那块并进来之后这份文件顶到 1033 行，而本仓 `.lua` 的硬上限是
-- 1000（`docs/09` §4）。文件名、两个保留上限、`M.new_day` / `M.prune` /
-- `M.load` / `M.save` 都在那边，**这一侧只剩下面几行转接**（名字与调用点一个没动）。
--
-- 切法看"认不认识状态"：那边只认"这些行长什么样"，状态留在这一侧。

-- `[ymd] = 记录`，一条记录 = 一天。字段与 `days.txt` 一一对应：
--
-- ```text
-- v1
-- d 2026-09-27 1284 754000 210 3    -- 日期 字/词数 毫秒 峰值 轮数
-- m 2026-09-27 1334 42              -- 日期 当天第几分钟 那一分钟写了多少
-- ⚠️ 第二格是 `words`（中文字数 ＋ 英文词数，见文件头），**不是码点数**。
-- ```
--
-- ⚠️ 分钟账**只记有字的那一分钟**（稀疏）：一整天写满要 1440 行，而绝大多数是 0。
-- 曲线上的空档由 `spread` 补回来（补 0，不是跳过）。
local days = {}

-- 此刻在记的那一条（`days[ymd]` 里的**同一个表**，不是副本）。
-- ⚠️ `nil` = 还没有时间来源（`nota.time` 拿不到），那时整套"今日"都不出现。
local today = nil

-- 内存里的账与磁盘上那份不一致（有东西没写回）。
local dirty = false

-- `on_unload` 拿不到 `nota`（宿主就是不传，`lua/mod.rs` 那边写着），所以在 `on_load` 里留一份——落盘的最后一枪靠它。
local saved_nota = nil

-- 拍了拍数：每 30 拍（≈30 秒）落一次盘。⚠️ 崩溃/强杀最多丢半分钟，而写一次是"几个 KB 的文本覆盖"，比每秒都写划算得多。
local ticks_since_save = 0
local SAVE_EVERY = 30

-- 分享那一屏正开着看哪一本账：`nil` = 没开，`round` / `day`。⚠️ 它**不是第五个
-- phase**，是一层盖在 `phase` 之上的显示状态：关掉它，原来那一屏原样回来。
local share_scope = nil

-- 这一拍拿到的**墙上时间**（`nota.time.now()` 那份，`nil` = 拿不到）。
-- ⚠️ 每拍都重新问一次，而且**存下来给同一拍里后面几处复用**（今日账、卡片日期、文件名）：一次采样里问两遍，跨零点那一瞬间就会得到两份不一致的时间。
local nowinfo = nil
-- 文案取用器。`on_load` 里重新绑一次——`nota` 要到那时才到手。
-- ⚠️ 在那之前调它只会拿到原文，这是对的（模块级的字符串本来就不该等 `nota`）。
local T = function(s) return s end

--- 把这一轮整个清掉（`idle` 与「再来一轮」都走它）。
local function reset_round()
  samples = {}
  round_mins = {}
  last_t = nil
  last_words = nil
  last_path = nil
  total_add = 0
  elapsed_ms = 0
  peak_rate = 0
  frozen_rate = nil
end

-- ── 今日那本账：读、写、翻页 ─────────────────────────────────────────────
--
-- 真正干活的四个函数在 `ledger.lua`（理由见上面那段）；这里是**转接**，为的是
-- 这一侧剩下的代码一个字都不用改。⚠️ 转接里**带 `days`**：账本是这一侧的状态。

local ledger = require("ledger")

local function new_day(ymd)
  return ledger.new_day(ymd)
end

local function prune_days()
  ledger.prune(days)
end

local function load_ledger(nota)
  ledger.load(days, nota)
end



--- 换到"今天"那一条（没有就建一条）。跨天时自动翻页。
---
--- ⚠️ 翻页**不是清零**：昨天那一条留在 `days` 里，照旧写回磁盘（面板上不显示它，但那本账还在）。今日分享图要的数因此永远只来自当前这一条。
local function roll_day(tinfo)
  if not tinfo or tinfo.ymd == "" then
    return nil
  end
  if today and today.ymd == tinfo.ymd then
    return today
  end
  local r = days[tinfo.ymd]
  if not r then
    r = new_day(tinfo.ymd)
    days[tinfo.ymd] = r
    prune_days()
  end
  today = r
  return today
end

--- 把内存里的账写回磁盘。**没脏就不写**（每一拍都写等于每秒覆盖一次文件）。
--
-- ⚠️ 这一侧只管**要不要写**（脏位、`today`）与"写成了清脏位"；拼行、落盘、
-- 出错记日志都在 `ledger.lua` 的 `M.save` 里。
local function save_ledger(nota)
  if not dirty or not today then
    return
  end
  if ledger.save(days, nota) then
    dirty = false
  end
end

--- 往今日那条记录里记一分钟。
local function add_minute(r, mn, n)
  if not r or n <= 0 then
    return
  end
  r.mins[mn] = (r.mins[mn] or 0) + n
  if not r.first or mn < r.first then
    r.first = mn
  end
  if not r.last or mn > r.last then
    r.last = mn
  end
end

--- 数一拍，够 `SAVE_EVERY` 拍就把账写回去一次。
-- ⚠️ 由**采样**数拍、不由时间数：这个插件没有 timer，唯一可靠的心跳就是"宿主又拉了一次
-- 面板"。代价是面板关着时不落盘——而那段时间本来也没有新账。
local function tick_save()
  ticks_since_save = ticks_since_save + 1
  if ticks_since_save >= SAVE_EVERY then
    ticks_since_save = 0
    save_ledger(saved_nota)
  end
end


--- 收一个采样点。**每一次 `render` 都调一次**，干什么由 `phase` 决定。
-- ⚠️ 只有 `running` 会累加，另外三个状态走同一句话：**只把基线挪到此刻**。
-- `minute_of_day` / `day_row` 可能是 `nil`（拿不到时间来源），那时**今日那本整个不记**
-- ——本轮照记不误，界面上也照旧，只是"今天"那一块不出现。
local function take_sample(now, words, path, minute_of_day, day_row)
  if phase ~= "running" then
    last_t, last_words, last_path = now, words, path
    return
  end

  -- 基线还没立（刚「开始」或刚「继续」）：这一枪只当起点。
  if last_t == nil then
    last_t, last_words, last_path = now, words, path
    return
  end

  -- ⚠️ 换文档 → **自动暂停**（不是终止）。理由在文件头"跑表在什么情况下自己停"。
  -- ⚠️ 这里**不去冻 `frozen_rate`**：它由 `panel_content` 每一枪更新，而"切走前那一刻"的读数上一枪就已经存进去了（见
  -- `frozen_rate` 那一段）。
  if last_path ~= path then
    phase = "paused"
    last_t, last_words, last_path = now, words, path
    return
  end

  local dt = now - last_t
  local add = words - last_words
  -- ⚠️ 这一分钟**在加 `dt` 之前**算：一次采样跨过分钟边界时，那点字算进**哪一分钟**本来就只能四舍五入。
  -- 取"这一枪落在哪一分钟"比取"这一枪之后落在哪一分钟"更贴，而且 1 秒一采的间隔下两种算法的差最多一分钟、只在边界上出现。
  local rel_min = math.floor(elapsed_ms / 60000)
  last_t = now
  last_words = words

  -- ⚠️ `dt <= 0` 是可能的（同一个毫秒里被拉两次），除法会炸出 inf。
  if dt <= 0 then
    return
  end
  -- 删字不算打字量：不能给负数，也不能让一次大删把平均速度拽下去。
  if add < 0 then
    add = 0
  end

  -- ⚠️ 这两行在断档分支**之上**：面板刚才没开着，用户也是真在写字，那段时间该进总数与时长。断档只影响"这一枪画不画到曲线上"。
  total_add = total_add + add
  elapsed_ms = elapsed_ms + dt

  -- 今日那本账的字数与时长也在这里（同一支代码、同一个条件）。
  -- ⚠️ 口径必须与本轮**完全一致**：不然"本轮 100 字"和"今天涨了 300 字"会让用户以为哪一个算错了（其实只是暂停期间打的字算不算的分歧）。
  if day_row then
    day_row.words = day_row.words + add
    day_row.ms = day_row.ms + dt
    dirty = true
  end

  -- 断档：中间那段没有采样点，画出来是一根假尖刺（五分钟的量算成"这一秒打了 300 个字"），峰值同理。所以只累加、不落点、不算峰值。
  if dt > GAP_MS then
    tick_save()
    return
  end

  table.insert(samples, { t = now, dt = dt, add = add })

  local rate = add * 60000 / dt
  if rate > peak_rate then
    peak_rate = rate
  end

  -- 本轮那本账：按"本轮第几分钟"落一格（分享图用 `samples` 画不了整轮，见 `round_mins`）。
  round_mins[rel_min] = (round_mins[rel_min] or 0) + add

  -- 今日那本账：峰值与分钟格。⚠️ 峰值与落点**都在断档那道闸之后**——断档那一段的"速度"是个假数（五分钟的量除以一秒），算进峰值就是撒谎。
  if day_row then
    if rate > day_row.peak then
      day_row.peak = rate
    end
    if minute_of_day then
      add_minute(day_row, minute_of_day, add)
    end
  end

  tick_save()

  -- 裁掉窗口外的老点。⚠️ 从**头**删（最旧的），所以那个 `while` 一次最多走一两轮。
  local from = now - KEEP_MS
  while #samples > 0 and samples[1].t < from do
    table.remove(samples, 1)
  end
end

--- 最近一分钟的平均速度（字/分钟）。样本不够就返回 `nil`。
-- ⚠️ `nil` 与 0 是**两件事**：`nil` = "还没有结论"（画破折号），0 = "有结论、就是没在打"。
local function average_rate(now)
  local total, span = 0, 0
  local from = now - WINDOW_MS
  for _, s in ipairs(samples) do
    if s.t >= from then
      total = total + s.add
      span = span + s.dt
    end
  end
  if span < MIN_SPAN_MS then
    return nil
  end
  return math.floor(total / span * 60000 + 0.5)
end

--- **整轮**的平均速度（字/分钟）。跑太短就返回 `nil`（理由同 `MIN_SPAN_MS`）。
-- ⚠️ 它**不看 `samples`**，看 `total_add` / `elapsed_ms`：`samples` 只留三分钟，拿它算
-- 整轮是错的。
local function round_rate()
  if elapsed_ms < MIN_SPAN_MS then
    return nil
  end
  return math.floor(total_add / elapsed_ms * 60000 + 0.5)
end

--- 给前端的那串点：每个采样一次，值 = 那一次的瞬时速度（字/分钟）。
local function plot_points()
  local out = {}
  local start = #samples - MAX_POINTS + 1
  if start < 1 then
    start = 1
  end
  for i = start, #samples do
    local s = samples[i]
    table.insert(out, s.add * 60000 / s.dt)
  end
  return out
end

--- 一段时长说成人话。
local function human_span(ms)
  if ms < 60000 then
    return string.format(T("%d 秒"), math.floor(ms / 1000))
  end
  return string.format(
    T("%d 分 %d 秒"),
    math.floor(ms / 60000),
    math.floor(ms % 60000 / 1000)
  )
end

-- 面板上那几颗按钮。**每个状态一组**，集中在这儿是为了让人一眼看全"一共能有哪几种"。
-- ⚠️ 「终止」在 `running` 与 `paused` 都出现、**都排最右**：它是唯一不可逆的动作，位置
-- 固定比好看重要。⚠️ `needs` 是**插件自己用的**（不发给前端）：没东西可分享时那颗按钮
-- 就不出现——一颗"点了只得到一句空话"的按钮比灰按钮更坏。
local BUTTONS = {
  idle = {
    { label = "开始记录", command = "start", style = "primary" },
    { label = "制作今日分享图", command = "share_day", needs = "day" },
    { label = "制作长期分享图", command = "share_long", needs = "long" },
  },
  running = {
    { label = "暂停", command = "pause" },
    { label = "终止", command = "stop" },
  },
  paused = {
    { label = "继续", command = "resume", style = "primary" },
    { label = "终止", command = "stop" },
  },
  done = {
    { label = "再来一轮", command = "start", style = "primary" },
    { label = "制作本轮分享图", command = "share_round", needs = "round" },
    { label = "制作今日分享图", command = "share_day", needs = "day" },
    { label = "制作长期分享图", command = "share_long", needs = "long" },
  },
  -- 分享那一屏只有一颗「返回」：这一屏是**看**的，动作全在卡片下面（前端那两颗）。
  share = {
    { label = "返回", command = "share_close" },
  },
}

-- ⚠️ **前向声明**：`long_stats` 定义在下面（那一整段要用到 `ticks`，而它跟着分享图
-- 那一段走）。Lua 是"先声明后使用"，不先在这儿留个名字的话，`can_share` 里那个
-- 调用会解析成**全局变量**（值是 `nil`）——症状是点开面板就报"调用一个 nil 值"。
local long_stats

--- 此刻有没有东西可分享。`round` = 刚跑完的那一轮；`day` = 今天有账；`long` = 长期那本账值得画。
local function can_share(needs)
  if needs == "round" then
    return phase == "done" and total_add > 0
  end
  if needs == "long" then
    -- ⚠️ 至少要**两天**有字：一天的账在半年那张图上就是孤零零一格，而"这颗按钮
    -- 点下去得到一张像坏了的图"比"这颗按钮暂时不出现"更糟（同上面 `needs` 那条）。
    local st = long_stats and long_stats() or nil
    return st ~= nil and st.days >= 2
  end
  return today ~= nil and today.words > 0
end

--- 那一组按钮（`T()` 要晚于模块加载，所以现译，不在表里写死）。
local function buttons_for(now_phase)
  local out = {}
  for _, b in ipairs(BUTTONS[now_phase] or {}) do
    if not b.needs or can_share(b.needs) then
      table.insert(out, { label = T(b.label), command = b.command, style = b.style })
    end
  end
  return out
end

-- ── 分享图与刻度 ─────────────────────────────────────────────────────────
--
-- ⚠️ 这一段**只数数、只写字段**，一个像素都不画（画的是 `src/ui/share-card.ts`）。
-- 这里产出的东西就是 `kind = "share"` 那一块的全部内容。
--
-- ⚠️ **"数怎么写、刻度摆哪儿"这一半 2026-09-27 搬去了 `ticks.lua`**（`require`，插件
-- 多文件）：那几个是整份插件里唯一**不碰状态**的一截，搬走只为把这份文件压回 1000 行
-- 以内。下面几行是**转接**——名字和几十处调用点一个都没动，只是把"只有上家才知道"的
-- 两个口径（`MAX_POINTS`、`samples`）当参数递进去。

local ticks = require("ticks")

local num_text, clock_span = ticks.num_text, ticks.clock_span
-- ⚠️ **卡片与面板上凡是"多少个字"都走 `group_text`**（带千位分隔）：这份图上最大的
-- 那个数字和旁边三格小字如果一处带逗号、一处不带（`209,758` 与 `34225`），读起来像
-- 两个不同地方印出来的数。`ticks.lua` 那边的注释里写着为什么倒着插逗号。
local group_text = ticks.group_text
local date_text, stamp_text = ticks.date_text, ticks.stamp_text
local three_ticks, round_tick, clock_tick = ticks.three_ticks, ticks.round_tick, ticks.clock_tick

--- 摊点/画刻度时要带上"一份图最多几个点"（那个口径在上家）。
local function spread(mins, from_i, to_i)
  return ticks.spread(mins, from_i, to_i, MAX_POINTS)
end

-- ⚠️ 采样序列同理：`ticks.lua` 不认识本轮，由这里递进去。
local function window_ticks(now)
  return ticks.window_ticks(samples, now, MAX_POINTS)
end

--- 今日的平均速度（字/分钟）。太短就是 `nil`（理由同 `MIN_SPAN_MS`）。
local function day_rate()
  if not today or today.ms < MIN_SPAN_MS then
    return nil
  end
  return math.floor(today.words / today.ms * 60000 + 0.5)
end

--- 「这一轮」那张卡片的字段。
local function round_card()
  local to_i = 0
  for mi in pairs(round_mins) do
    if mi > to_i then
      to_i = mi
    end
  end
  local series = spread(round_mins, 0, to_i)
  return {
    kind = "share",
    title = T("写作统计"),
    subtitle = "Writing Stats",
    date = date_text(nowinfo),
    label = T("本轮平均速度"),
    value = num_text(round_rate()),
    unit = T("字 / 分钟"),
    points = series.pts,
    x_ticks = three_ticks(0, series.bucket, #series.pts, round_tick),
    x_minor = ticks.minor_per_gap(),
    stats = {
      { k = T("总字数"), v = group_text(total_add), small = T("字") },
      { k = T("时长"), v = clock_span(elapsed_ms), small = "" },
      { k = T("峰值"), v = tostring(math.floor(peak_rate + 0.5)), small = T("字/分") },
    },
    foot = string.format(T("这一轮，你写下了 %s 个字"), group_text(total_add)),
    file = "nota-stats-round-" .. stamp_text(nowinfo) .. ".png",
  }
end

--- 「今日」那张卡片的字段。今天没账就没这张卡（调用方会拦在前面）。
local function day_card()
  local r = today
  local series = spread(r.mins, r.first or 0, r.last or 0)
  -- ⚠️ 今日这张**不用三档**：它的横轴就是**钟点**，用户 2026-09-27 要的是「一个小时为一个
  -- 单位的横坐标标尺」＋「到小时就用稍微大一点的字体」——`ticks.day_ticks` 按跨度自己挑
  -- 1/2/3/4/6/8/12 小时一档，每一档都是整点、都放大一号。
  -- ⚠️ **摆不满两档就退回三档钟点**（起/中/末）：今天只写了七八分钟的时候，整点标尺上
  -- 只有一个"22:00"，比刻度还难读——那种跨度下"从几点到几点"才是这张图要说的。
  local axis = ticks.day_ticks(r.first or 0, series.bucket, #series.pts)
  if #axis < 2 then
    axis = three_ticks(r.first or 0, series.bucket, #series.pts, clock_tick)
  end
  return {
    kind = "share",
    title = T("写作统计"),
    subtitle = "Writing Stats",
    date = date_text(nowinfo),
    label = T("今日平均速度"),
    value = num_text(day_rate()),
    unit = T("字 / 分钟"),
    points = series.pts,
    x_ticks = axis,
    x_minor = ticks.minor_per_gap(),
    stats = {
      { k = T("今日写了"), v = group_text(r.words), small = T("字") },
      { k = T("今日时长"), v = clock_span(r.ms), small = "" },
      { k = T("今日峰值"), v = tostring(math.floor(r.peak + 0.5)), small = T("字/分") },
    },
    foot = string.format(T("今天，你写下了 %s 个字"), group_text(r.words)),
    file = "nota-stats-day-" .. r.ymd .. ".png",
  }
end

-- ── 长期那本账（热力图，2026-09-27）──────────────────────────────────────
--
-- 用户：「加一个功能，类似 Contribution Graph 那样的热力图，记录长期数据。
-- 仅记录打字数。功能归属于心电图插件。」
--
-- ⚠️ **算的那一半在 `long.lua`**（`require`，插件多文件的第二个用户）：窗口怎么定、
-- 哪些天算数、那个字符串怎么拼——那几条是纯算术，只是要有人把账本递进去。
-- 下面这四行是**转接**：把"只有上家才知道"的两样（`days` 那本账、这一拍的
-- `nowinfo`）当参数递进去，名字与调用点一个都没动。

local long = require("long")

-- ⚠️ **没有 `local`**：这个名字在最上面已经前向声明过了（`can_share` 要用它，
-- 而它在文件里排在前面）。写成 `local function` 就是**另起一个同名的局部量**，
-- 前向那个仍然是 `nil`——症状是"点开面板就报调用 nil"。
function long_stats()
  return long.stats(days, nowinfo)
end

local function long_card(st)
  return long.card(days, st, nowinfo)
end

local function days_text(st)
  return long.days_text(days, st)
end

local function long_saying(st)
  return long.saying(st)
end

--- 面板上那一块**长期**（热力图 ＋ 一句人话）。**没有账就一个块都不给**。
-- ⚠️ 面板每秒重画一次，而这一块要拼一个几百字的字符串、前端那边要铺一千多个格子
-- （`ui/heatmap.ts` 把 182 天摊成 7×26 个 `<span>`）：没账的时候一个块都不发。
-- ⚠️ 那句人话是**必要的**：格子对读屏软件没有意义（前端那一块挂 `aria-hidden`），
-- "写了多少人少天"要有一句说得出来的话。
local function long_blocks()
  local st = long_stats()
  if not st or st.days <= 0 then
    return {}
  end
  return {
    { kind = "separator" },
    {
      kind = "heatmap",
      title = T("长期记录"),
      unit = T("字"),
      days = days_text(st),
      weeks = st.weeks,
      to = st.ymd,
    },
    { kind = "text", tone = "muted", text = long_saying(st) },
  }
end

--- 此刻的**墙上时间**（本地时区）。拿不到就 `nil`。
-- ⚠️ `nil` 时**整套"今日"都不出现**，而不是显示一个假日期：一个会写错日期的账本比没有
-- 账本糟得多。⚠️ 能力上这条不会发生（`nota.time` 永远可用），但"拿不到就别说"与
-- `document.stats()` 那条同规矩——两处都 `pcall`。
local function wall_clock(nota)
  local ok, t = pcall(function()
    return nota.time.now()
  end)
  if not ok or type(t) ~= "table" then
    return nil
  end
  local ymd = tostring(t.ymd or "")
  if ymd == "" then
    return nil
  end
  local hh = tonumber(t.hh) or 0
  local mi = tonumber(t.mi) or 0
  return {
    ymd = ymd,
    y = tonumber(t.y) or 0,
    mo = tonumber(t.mo) or 0,
    d = tonumber(t.d) or 0,
    hh = hh,
    mi = mi,
    minute_of_day = hh * 60 + mi,
  }
end

--- 面板这一页此刻长什么样。**每次被拉都现跑一遍**，所以里面全是"现在怎么样"。
local function panel_content(nota)
  local ok, st = pcall(nota.document.stats)
  if not ok or type(st) ~= "table" then
    return {
      { kind = "empty", text = T("读不到当前文档的字数。") },
    }
  end

  local now = tonumber(st.clock_ms) or 0
  local words = tonumber(st.words) or 0
  local path = st.path or ""

  -- 这一拍的墙上时间（一次就够，同一拍里后面几处都用它，见 `nowinfo` 那段）。
  nowinfo = wall_clock(nota)
  local day_row = roll_day(nowinfo)

  -- ⚠️ 先采这一枪再画面板：屏幕上那个数必须是**含此刻**的。
  take_sample(now, words, path, nowinfo and nowinfo.minute_of_day or nil, day_row)

  -- 分享那一屏：**盖在 `phase` 上面**，`phase` 一动不动（`share_scope` 那段）。
  if share_scope then
    -- ⚠️ 落一次盘再画：卡片上的数是内存里那份（已经是最新的），但"关掉 Nota之前最后一眼看到的图"和"重启之后账上有的数"该是同一份。
    save_ledger(nota)
    local card
    if share_scope == "round" then
      card = round_card()
    elseif share_scope == "day" then
      card = day_card()
    else
      local st = long_stats()
      card = st and long_card(st) or nil
    end
    -- ⚠️ 拿不到日期时（`nota.time` 那一跳失败）**不留一块空白**：说一句为什么。
    if not card then
      return {
        { kind = "text", text = T("拿不到今天的日期，长期那本账画不出来。") },
        { kind = "buttons", items = buttons_for("share") },
      }
    end
    return {
      card,
      { kind = "buttons", items = buttons_for("share") },
      {
        kind = "text",
        tone = "muted",
        text = T("卡片下面那两颗按钮：存成 PNG，或者直接复制到剪贴板。"),
      },
    }
  end

  -- 「还没开始」那一屏：一个数字都没有，所以不画曲线。
  -- ⚠️ 只摆一句说明 ＋ 一颗按钮，是**有意留白**——这一屏唯一该传达的事就是"按那颗按钮"。
  if phase == "idle" then
    local items = {
      { label = T("整份文档"), value = string.format(T("%d 字"), words) },
    }
    -- 今天已经写过就给一行"今天"（没写过就不给：一行 `0 字 · 0 轮` 只是在占地方）。
    if day_row and day_row.words > 0 then
      items[#items + 1] = {
        label = T("今天"),
        value = string.format(T("%d 字 · %d 轮"), day_row.words, day_row.rounds),
      }
    end
    local out = {
      {
        kind = "text",
        text = T("还没开始。按「开始记录」，这一轮写了多少字、用了多久、什么速度，就都算起来了。"),
      },
      { kind = "separator" },
      { kind = "fields", items = items },
    }
    -- 长期那一块（2026-09-27 加）。⚠️ 它排在按钮**前面**：动作永远在最下面。
    for _, b in ipairs(long_blocks()) do
      table.insert(out, b)
    end
    out[#out + 1] = { kind = "buttons", items = buttons_for("idle") }
    out[#out + 1] = { kind = "text", tone = "muted", text = T("只在面板开着的时候记录。") }
    return out
  end

-- 大数字：跑着/暂停看"最近一分钟"，终止之后看"整轮"（表在文件头）。
-- ⚠️⚠️ **暂停那一支必须直接用 `frozen_rate`，不能再算一遍**——理由与实测见 `docs/13`
-- §14.4「冻结」：写成"算出来不是 nil 就用算的"等于没冻。
  local shown
  if phase == "done" then
    shown = round_rate()
  elseif phase == "paused" then
    shown = frozen_rate
  else
    local live = average_rate(now)
    if live then
      frozen_rate = live
    end
    shown = live or frozen_rate
  end

  local blocks = {
    {
      kind = "chart",
      label = phase == "done" and T("本轮平均速度") or T("写作速度"),
      -- ⚠️ 空串 = "还没有结论"，渲染层会画一个破折号（`ui/PanelBody.tsx`）。这里**不能写 0**：那是另一个意思（有结论、就是没在打）。
      -- 
      value = shown and tostring(shown) or "",
      unit = T("字/分钟"),
      points = plot_points(),
      -- 横轴刻度：一块图没有横轴，"起伏"就读不出**什么时候**发生的（2026-09-27 加）。
      x_ticks = window_ticks(now),
      caption = string.format(
        T("最近 %d 分钟的每次采样，从左到右"),
        math.floor(KEEP_MS / 60000)
      ),
    },
    { kind = "separator" },
  }

-- 四个数：跑了多少、多久、多快、整篇多大。⚠️ `done` 那一屏最后一项换成峰值——结算时
-- "整份文档"不重要，"这一轮最快到过多少"才重要。
  local items = {
    { label = T("本轮写了"), value = string.format(T("%d 字"), total_add) },
    { label = T("记录时长"), value = human_span(elapsed_ms) },
    {
      label = T("峰值速度"),
      value = string.format(T("%d 字/分钟"), math.floor(peak_rate + 0.5)),
    },
    { label = T("整份文档"), value = string.format(T("%d 字"), words) },
  }
-- 今天那一行（2026-09-27 加）。⚠️ 放最后、且**只在有账时出现**：它是"顺带看一眼"的
-- 背景，主角永远是本轮那四个数。
  if day_row and day_row.words > 0 then
    items[#items + 1] = {
      label = T("今天"),
      value = string.format(T("%d 字 · %d 轮"), day_row.words, day_row.rounds),
    }
  end
  blocks[#blocks + 1] = { kind = "fields", items = items }

-- ⚠️ 暂停那一句**只在"真暂停"时说**。自动暂停（换文档）也走这里，所以那句话要把两种来
-- 路都讲清楚，否则用户会以为自己没按过什么、怎么就停了。
  if phase == "paused" then
    blocks[#blocks + 1] = {
      kind = "text",
      text = T("已暂停。这期间打的字不算进这一轮——按「继续」接着算。"),
    }
  end
  if phase == "done" then
    blocks[#blocks + 1] = {
      kind = "text",
      text = string.format(
        T("这一轮，你写下了 %s 个字。"),
        group_text(total_add)
      ),
    }
  end

  for _, b in ipairs(long_blocks()) do
    table.insert(blocks, b)
  end

  blocks[#blocks + 1] = { kind = "buttons", items = buttons_for(phase) }

-- ⚠️ 这一行是**必要的诚实**：不写它，用户切走半小时再回来会看到一条空曲线，而面板上没
-- 有任何东西解释那一段为什么是空的。
  blocks[#blocks + 1] = { kind = "text", tone = "muted", text = T("只在面板开着的时候记录。") }

  return blocks
end

--- 插件加载。
function M.on_load(nota)
  -- ⚠️ **第一件事**：把文案取用器接到宿主给的这份表上（上面 `local T` 那段）。
  T = function(fmt, ...)
    local s = nota.i18n and nota.i18n.text(fmt) or nil
    s = s or fmt
    if select("#", ...) > 0 then
      return string.format(s, ...)
    end
    return s
  end
  -- ⚠️ **第二件事**：把同一个取用器交给 `ticks.lua` 与 `long.lua`（它们各自那份
  -- `T` 还是个原样返回的桩）。
  ticks.bind_text(T)
  long.bind_text(T)

-- 留一份 `nota` 给 `on_unload`（宿主调它时**不传参**），然后读回今日那本账。
-- ⚠️ **今天那条记录不在这里建**：那要问一次 `nota.time`，而"现在几点"每一拍都会重新问
-- （`panel_content` 里那一次）——多问一次就是同一件事有两个时点，跨零点会打架。
-- ⚠️ 读账**静默失败**：一个插件不该因为自己的缓存读不出来而挡住面板。
  saved_nota = nota
  load_ledger(nota)

-- ⚠️ 四个状态各一条**显式**命令，不做"一个按钮三副面孔"的开关式命令：面板上的 `command`
-- 是写死的四个串，状态判断全在插件这边，前端一个 `if` 都不用加。
-- ⚠️ 每一条都返回 `{ ok = … }`（与 `plugins/slidev` 一致）：前端不看它，但出错要能冒出来。
  nota.command.register("start", function()
    reset_round()
    phase = "running"
    -- 今日那本账：轮数 +1（**起点算**：一轮开出去就算今天开过，中途崩了也认）。
    -- ⚠️ 顺手落一次盘，免得接下来那半分钟里应用被关掉。
    if today then
      today.rounds = today.rounds + 1
      dirty = true
      save_ledger(nota)
    end
    -- ⚠️ 基线留空，交给下一枪去立：命令这一侧**没有** `clock_ms`（那是 `document.stats()`
    -- 给的），代价是最多晚一秒开始算——正好是心跳的间隔。
    nota.ui.refresh(PANEL_ID)
    return { ok = true, phase = phase }
  end)

  nota.command.register("pause", function()
    if phase == "running" then
      phase = "paused"
    end
    nota.ui.refresh(PANEL_ID)
    return { ok = true, phase = phase }
  end)

  nota.command.register("resume", function()
    if phase == "paused" then
      phase = "running"
      -- 与「开始」同理：基线留空，下一枪重新立。
      -- ⚠️ 这一句就是"暂停期间打的字不算"的落点——重新立基线用的是**那一刻**的 `words`，
      -- 暂停那一段的增量就此落在基线之外。
      last_t = nil
    end
    nota.ui.refresh(PANEL_ID)
    return { ok = true, phase = phase }
  end)

  nota.command.register("stop", function()
    -- ⚠️ 这里**只改状态，不结算**：`total_add` / `elapsed_ms` / `peak_rate` 在 `done` 下不
    -- 再被任何一支累加，所以它们**自己就是那份结算**——另存一份只会多一处对不上。
    if phase == "running" or phase == "paused" then
      phase = "done"
    end
    -- 一轮结束 = 今日那本账最该落盘的一刻（用户很可能接下来就关应用看分享图去了）。
    save_ledger(nota)
    nota.ui.refresh(PANEL_ID)
    return { ok = true, phase = phase }
  end)

-- 分享那三颗：`share_round` / `share_day` 只是**切一屏**，`share_close` 关掉它。
-- ⚠️ 它们**不读账、也不算数**——那一屏要的字段在 `panel_content` 里每一拍现算，命令这一
-- 侧只挪一下 `share_scope`：少一处"另一份结算"就少一处对不上的可能。
  nota.command.register("share_round", function()
    if can_share("round") then
      share_scope = "round"
    end
    nota.ui.refresh(PANEL_ID)
    return { ok = true }
  end)

  nota.command.register("share_day", function()
    if can_share("day") then
      share_scope = "day"
    end
    nota.ui.refresh(PANEL_ID)
    return { ok = true }
  end)

  nota.command.register("share_long", function()
    if can_share("long") then
      share_scope = "long"
    end
    nota.ui.refresh(PANEL_ID)
    return { ok = true }
  end)

  nota.command.register("share_close", function()
    share_scope = nil
    nota.ui.refresh(PANEL_ID)
    return { ok = true }
  end)

  nota.ui.register_panel({
    id = PANEL_ID,
    title = T("写作统计"),
    -- 右侧插件栏（默认值，写出来是为了让人一眼看到）。
    location = "right",
    -- ⚠️ **这一行就是"实时"的全部来源**：宿主看到它才会每秒喊一次"该重拉了"，删掉它这块
    -- 面板就退化成"切过去才拉一次"。⚠️ 代价：`render` 会**每秒跑一遍**，所以里面只能有内存
    -- 里的加减乘除（要加子进程或网络请求，先回来看这一行）。
    live = true,
    render = function()
      return panel_content(nota)
    end,
  })
end

--- 插件卸载（停用、重装、退出应用）。**最后一枪落盘**。
-- ⚠️ 这是"今日那本账"不丢的唯一保险：正常退出走这里，崩溃/强杀走不到——那时最多丢
-- `SAVE_EVERY` 秒（30 秒）的账，这是刻意接受的代价。⚠️ 出错只记日志，卸载流程不该被一个
-- 插件的残骸卡住。
function M.on_unload()
  save_ledger(saved_nota)
end

return M
