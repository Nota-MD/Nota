-- Git 版本控制插件。
--
-- 宿主 API 见 docs/13-lua-api.md。这个插件是那份文档的**活样例**：
-- 想看"一个插件到底怎么写"，读这个文件就够。
--
-- 设计口径（与 Folio 的 git 扩展一致）：**不做 git 的替代品**。
-- 只做"写文档时最常用的那几下"——看改动、比差异、提交。
-- 分支管理、rebase、交互式暂存这些，用户去终端做比在我们这儿点强。

local M = {}

-- ── 小工具 ────────────────────────────────────────────────────────────────

--- 把 `git status --porcelain=v1 -z -b` 的输出切成结构。
--
-- -z 的格式（**注意 NUL 而不是换行**，这是为了路径里能有空格和换行）：
--   "## 分支...上游 [ahead 1]" NUL "XY 路径" NUL ["XY 新路径" NUL "旧路径" NUL]
-- 重命名/复制（X 或 Y 是 R/C）时**多跟一个路径**，不处理它整个列表会错位。
local function parse_status(raw)
  local out = { branch = "", entries = {} }

  -- 先按 NUL 切。Lua 的 string.gmatch 用 %z 匹配 NUL。
  local parts = {}
  for piece in string.gmatch(raw .. "\0", "([^%z]*)%z") do
    parts[#parts + 1] = piece
  end

  local i = 1
  if parts[1] and string.sub(parts[1], 1, 2) == "##" then
    out.branch = string.sub(parts[1], 4)
    i = 2
  end

  while i <= #parts do
    local line = parts[i]
    if line == "" then
      i = i + 1
    else
      local xy = string.sub(line, 1, 2)
      local path = string.sub(line, 4)
      local entry = {
        index = string.sub(xy, 1, 1),  -- 暂存区的状态
        work = string.sub(xy, 2, 2),   -- 工作区的状态
        path = path,
      }
      -- 重命名/复制多一个字段：下一个 part 是原路径。
      local st = entry.index .. entry.work
      if string.find(st, "[RC]") then
        entry.orig = parts[i + 1]
        i = i + 2
      else
        i = i + 1
      end
      out.entries[#out.entries + 1] = entry
    end
  end

  return out
end

--- 给状态字符配一句人话。前两位分别是暂存区与工作区。
local function describe(entry)
  if entry.index == "?" and entry.work == "?" then
    return "未跟踪"
  end
  if entry.index ~= " " and entry.work ~= " " then
    return "已暂存且有新改动"
  end
  if entry.index ~= " " then
    return "已暂存"
  end
  return "已修改"
end

-- ── 命令 ──────────────────────────────────────────────────────────────────

--- 取一次状态并发给界面。
--
-- `silent` 用在**加载时那一次**：那时用户还没打开任何文件夹，"不是 git 仓库"
-- 是理所当然的，弹一条警告只会让人以为哪里坏了。用户主动点刷新时不静默。
local function refresh(nota, silent)
  local r = nota.git.status()
  if r.code ~= 0 then
    -- 最常见的失败是"这个目录不是 git 仓库"。**要把这句话说清楚**——
    -- 原样显示 git 的报错（"fatal: not a git repository..."）用户未必看得懂
    -- 是我们没能定位到仓库，还是他自己忘了 git init。
    if not silent then
      nota.ui.notify("这里不是 git 仓库：" .. r.stderr, "warn")
    end
    nota.event.emit("git:status", { is_repo = false, branch = "", entries = {} })
    return
  end

  local parsed = parse_status(r.raw)
  for _, e in ipairs(parsed.entries) do
    e.describe = describe(e)
  end
  parsed.is_repo = true
  nota.event.emit("git:status", parsed)
end

--- 提交全部改动。
function M.commit(nota, message)
  if not message or message == "" then
    return { ok = false, error = "提交信息不能为空" }
  end

  -- 先 add -A。**只提交已跟踪文件的改动**是更保守的做法，但写文档的人
  -- 更常见的意图是"把这一轮的所有改动存下来"，所以默认全加。
  local added = nota.git.run({ "add", "-A" })
  if added.code ~= 0 then
    return { ok = false, error = "git add 失败：" .. added.stderr }
  end

  local committed = nota.git.run({ "commit", "-m", message })
  if committed.code ~= 0 then
    -- "nothing to commit" 不是错误，是没有改动可提交——要分开说，
    -- 否则用户会以为自己哪儿操作错了。
    local nothing = string.find(committed.stdout .. committed.stderr, "nothing to commit")
    if nothing then
      return { ok = false, error = "没有改动需要提交" }
    end
    return { ok = false, error = "git commit 失败：" .. committed.stderr }
  end

  return { ok = true, output = committed.stdout }
end

-- ── 生命周期 ──────────────────────────────────────────────────────────────

function M.on_load(nota)
  -- 刷状态。
  nota.command.register("refresh", function()
    refresh(nota)
    return { ok = true }
  end)

  -- 取差异文本（给界面显示，也给 AI 插件当上下文）。
  nota.command.register("diff", function(args)
    local staged = args and args.staged or false
    local r = nota.git.diff(staged)
    return { ok = r.code == 0, text = r.text, error = r.stderr }
  end)

  -- 提交。
  nota.command.register("commit", function(args)
    local message = args and args.message or ""
    local result = M.commit(nota, message)
    if result.ok then
      nota.ui.notify("已提交", "success")
      refresh(nota)
    else
      nota.ui.notify(result.error, "error")
    end
    return result
  end)

  -- 仓库根目录。
  nota.command.register("repo_root", function()
    return { path = nota.git.repo_root() }
  end)

  -- ── 界面贡献 ────────────────────────────────────────────────────────────
  -- `location = "right"` = 右侧插件栏（也是默认值，写出来是为了让人一眼看到）。
  -- 早先这里是 `"sidebar"`，那时插件还装在左侧栏的第三页，那一页 2026-09-22 搬走了。
  nota.ui.register_panel({
    id = "git",
    title = "Git",
    location = "right",
  })

  nota.ui.register_menu({
    label = "提交…",
    command = "commit",
    menu = "plugins",
  })

  nota.ui.register_menu({
    label = "刷新改动",
    command = "refresh",
    menu = "plugins",
  })

  -- 开面板时先刷一次，用户不必手动点刷新。
  --
  -- ⚠️ **包 pcall 是刻意的，不是防御性编程的迷信**：这一句在 `on_load` 的末尾，
  -- 它一抛错，整份插件的加载就被判失败（用户看到的是"这个插件坏了"），
  -- 而真实原因可能只是"还没开工作区"。宿主那边已经把这类环境问题折成
  -- `code ~= 0` 的结果表了（见 src-tauri/src/lua/api/git.rs 的文件头），
  -- 这里再兜一层，是为了**将来宿主新加的任何一种环境失败**都不会再变成一次误判。
  local ok, err = pcall(refresh, nota, true)
  if not ok then
    nota.log.warn("首次刷新改动失败：" .. tostring(err))
  end
end

function M.on_unload()
  -- 没有要落盘的状态：改动清单每次都是从 git 现取的。
end

return M
