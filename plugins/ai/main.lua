-- AI 助手插件。
--
-- 走**任何 OpenAI 兼容的接口**（`POST {base_url}/chat/completions`）：官方 API、
-- 中转站、以及跑在自己机器上的 Ollama / LM Studio 都是同一条路。
-- 密钥和地址由用户自己填，存在 `~/.config/nota/plugin-settings/nota.ai.toml`
-- （明文，见 `docs/12` §插件设置为什么不加密）。
--
-- ⚠️ 本机服务通常**不需要密钥**，但请求里那个 `authorization` 头我们照发
-- （Ollama 会忽略它）。所以面板上写着"随便填一个"——不填的话插件没法区分
-- "他还没配"和"这个服务不要密钥"。
--
-- 一条设计原则贯穿本文件：**AI 的输出不许直接落进文档**。
-- 所有会改文档的操作都要先经过一次"预览并确认"。理由很实在——
-- 模型会犯错，而"文档被悄悄改掉、用户按了 Ctrl+Z 才发现"是最坏的一种错。
-- 所以生成出来的东西先存在 `preview` 里、显示在面板上，用户点了才写。
--
-- ⚠️ 调用这几个命令**会占住一个后台线程**（HTTP 是阻塞的，见
-- `src-tauri/src/lua/api/http.rs` 文件头），界面不会冻住，但一次生成要等几秒到
-- 几十秒。**没有做流式**——那是另一件事，记在 `docs/07`。
--
-- ⚠️⚠️ **变量名一律用 ASCII，中文只许出现在注释和字符串里。**
-- 这一条不是风格问题：Lua 的标识符只认 `[A-Za-z_][A-Za-z0-9_]*`
--（`lislalpha` 用的是 C 的 `isalpha`，`local 键 = 1` 里那几个 UTF-8 字节在任何
-- locale 下都不算字母），写成 `local 键_密钥 = …` 是**语法错误**，
-- 整份插件加载失败、面板和菜单一起消失。
-- 而 Lua 报的话是 `<name> expected near '<\233>'`——看到那句很难想到是名字的问题。
-- `src-tauri/src/lua/mod.rs` 里有一条用例把这条钉住了（`内置插件都能被_lua_编译`）。

local M = {}

-- ── 设置 ──────────────────────────────────────────────────────────────────
--
-- 键名只用 ASCII 字母和下划线：宿主的 `nota.settings` 会拒掉带点的键
--（`a.b` 在 TOML 里是嵌套表，读回来形状就变了），理由见 settings.rs。

local KEY_API = "api_key"
local KEY_BASE = "base_url"
local KEY_MODEL = "model"

local DEFAULT_BASE = "https://api.openai.com/v1"
local DEFAULT_MODEL = "gpt-4o-mini"

-- ── 预设 ──────────────────────────────────────────────────────────────────
--
-- ⚠️ **顺序写死在一张数组里**，不用 `pairs` 遍历下面那张表——`pairs` 的顺序
-- 不保证，界面上那排按钮会每次重开都换位置（而且不报错，只是"按钮乱跳"）。
local PRESET_ORDER = { "polish", "summarize", "continue_writing", "translate_en", "translate_zh" }

local PRESETS = {
  polish = {
    label = "润色",
    instruction = "请润色下面这段中文，保持原意与语气，只输出润色后的正文，不要解释：\n\n",
  },
  summarize = {
    label = "总结",
    instruction = "请用要点总结下面这段内容，只输出总结，不要解释：\n\n",
  },
  continue_writing = {
    label = "续写",
    instruction = "请顺着下面的内容继续写下去，保持风格一致，只输出续写的正文：\n\n",
  },
  translate_en = {
    label = "译成英文",
    instruction = "Translate the following into English. Output only the translation:\n\n",
  },
  translate_zh = {
    label = "译成中文",
    instruction = "把下面内容翻译成中文，只输出译文：\n\n",
  },
}

--- 上一次生成的结果，等用户确认。
--- `nil` = 没有待确认的东西。**面板上那块预览读的就是它。**
local preview = nil

-- ── 小工具 ────────────────────────────────────────────────────────────────

--- 读一个设置项。没填、或填的不是文本，都给兜底值。
local function read_setting(nota, key, fallback)
  local v = nota.settings.get(key)
  if type(v) == "string" and v ~= "" then
    return v
  end
  return fallback
end

--- 拼接口地址。末尾的斜杠要去掉——用户填 `.../v1/` 是常事，
--- 拼出 `.../v1//chat/completions` 有些服务器会当成另一个路径。
local function join_url(base)
  return (string.gsub(base, "/+$", "")) .. "/chat/completions"
end

--- 截一段文本给界面看。面板只有 260px 宽，整篇塞进去没法读，
--- 而且宿主那边还有 4000 字符的上限（超了从尾巴上截断，可能截在半句上）。
local function clip(s, limit)
  if #s <= limit then
    return s
  end
  return string.sub(s, 1, limit) .. "…（预览截断，写入的是完整内容）"
end

-- ── 取上下文 ──────────────────────────────────────────────────────────────

--- 取这次要送给模型的正文。
---
--- `scope = "document"` 给全文，`scope = "diff"` 想给 git 的未提交改动
--- （"帮我写提交信息"就是这一种）。
local function gather(nota, scope)
  if scope == "diff" then
    -- ⚠️ **宿主还没有"插件调插件"这条路**：git 插件的 `diff` 命令注册在
    -- 它自己的 Lua 状态里，本插件够不着。如实说，别偷偷回退成全文——
    -- 那样用户拿到的会是"用整篇文档写出来的提交信息"，而且看不出哪里不对。
    return nil, "取不到 git 改动：Nota 还没开放插件之间的调用，改用 scope = \"document\"。"
  end

  local text = nota.document.get_text()
  if not text or text == "" then
    return nil, "当前文档是空的"
  end
  return text, nil
end

-- ── 请求 ──────────────────────────────────────────────────────────────────

--- 发一次对话请求，返回 `{ ok, text }` 或 `{ ok = false, error }`。
---
--- ⚠️ `nota.http.*` **出错是抛 Lua 错误**，不是返回错误码（见 docs/13 §http）：
--- "地址不合法" / "连不上" / "超时" 全走 throw。所以这里必须 `pcall` 兜住，
--- 否则一次断网就会让整条命令带着一长串栈信息冒到界面上。
local function send_request(nota, body_text)
  local key = read_setting(nota, KEY_API, "")
  if key == "" then
    return { ok = false, error = "还没填 API 密钥：面板上点「设置密钥…」。" }
  end

  local url = join_url(read_setting(nota, KEY_BASE, DEFAULT_BASE))
  local model = read_setting(nota, KEY_MODEL, DEFAULT_MODEL)

  local r
  local ok, err = pcall(function()
    r = nota.http.post({
      url = url,
      -- 模型慢。默认的 30 秒对长文生成是不够的，宿主那边上限是 180 秒。
      timeout_ms = 120000,
      headers = {
        authorization = "Bearer " .. key,
      },
      -- 表体**当 JSON 发**，`content-type: application/json` 由宿主补上
      -- （自己再写一遍反而会被当成"我写过了"，见 http.rs 里 `写了_content_type`）。
      -- ⚠️ `messages` 是**数组**：Lua 里就是"1..n 连续整数键"的表，宿主按这个判。
      body = {
        model = model,
        messages = {
          { role = "user", content = body_text },
        },
      },
    })
  end)

  if not ok then
    return { ok = false, error = "请求没发出去：" .. tostring(err) }
  end

  -- ⚠️ 4xx/5xx **不是**宿主层面的错误（宿主故意关掉了 `http_status_as_error`）：
  -- 配额用完、密钥不对这类话就写在响应体里，得读出来给用户看。
  if r.code ~= 200 then
    local detail = ""
    if type(r.json) == "table" and type(r.json.error) == "table" then
      detail = tostring(r.json.error.message or "")
    end
    if detail == "" then
      -- 不是 JSON（网关的 HTML 错误页）就原样端前 300 字：真正的病因写在里面，
      -- 我们编不出比它更准的话。
      detail = string.sub(r.text or "", 1, 300)
    end
    return { ok = false, error = string.format("接口返回 %d：%s", r.code, detail) }
  end

  if type(r.json) ~= "table" then
    return {
      ok = false,
      error = "接口没回 JSON（HTTP " .. r.code .. "）：" .. string.sub(r.text or "", 1, 300),
    }
  end

  local choices = r.json.choices
  local content = nil
  if type(choices) == "table" and type(choices[1]) == "table" and type(choices[1].message) == "table" then
    content = choices[1].message.content
  end
  if type(content) ~= "string" or content == "" then
    -- 形状对不上时**说清楚是哪儿对不上**：只报"生成失败"的话，用户和
    -- 插件作者都只能猜是网络问题还是接口换了。
    return { ok = false, error = "接口回了 200，但里面没有 choices[1].message.content。" }
  end

  return { ok = true, text = content }
end

--- 跑一个预设：生成 → 存进 `preview` → 让面板重拉一次。
local function run_preset(nota, id, scope)
  local p = PRESETS[id]
  if not p then
    return { ok = false, error = "不认识的预设：" .. tostring(id) }
  end

  local text, err = gather(nota, scope)
  if not text then
    return { ok = false, error = err }
  end

  local r = send_request(nota, p.instruction .. text)
  if not r.ok then
    return r
  end

  -- ⚠️ **只预览，不改文档。** 写回去要用户点「追加到文末」或「替换全文」。
  preview = { preset = id, text = r.text }
  nota.ui.refresh("ai")
  -- 从菜单点进来的时候用户未必看着右侧面板，说一句让他去那儿看。
  nota.ui.notify("「" .. p.label .. "」生成好了，在右侧面板里确认。", "success")
  return { ok = true, text = r.text }
end

-- ── 面板内容 ──────────────────────────────────────────────────────────────

--- 面板此刻该显示什么。**每次拉都现跑**（见 `docs/13` §render）。
local function panel_content(nota)
  local key = read_setting(nota, KEY_API, "")
  local blocks = {}

  blocks[#blocks + 1] = {
    kind = "fields",
    items = {
      { label = "模型", value = read_setting(nota, KEY_MODEL, DEFAULT_MODEL) },
      { label = "地址", value = read_setting(nota, KEY_BASE, DEFAULT_BASE) },
      {
        label = "密钥",
        value = key ~= "" and "已配置" or "还没填",
        tone = key ~= "" and "success" or "warn",
      },
    },
  }

  blocks[#blocks + 1] = {
    kind = "buttons",
    items = {
      {
        label = key == "" and "设置密钥…" or "换密钥…",
        command = "set_key",
        style = key == "" and "primary" or "normal",
        prompt = {
          arg = "api_key",
          label = "API 密钥",
          placeholder = "sk-…",
          -- ⚠️ 遮屏。密钥会明文存进 `~/.config/nota/plugin-settings/`，
          -- 这一条挡的不是存盘，是**旁边的人从肩膀上看见**。
          secret = true,
          hint = "只发给上面那个地址。本机模型（Ollama / LM Studio）通常不要密钥，随便填一个即可。",
        },
      },
      {
        label = "改地址…",
        command = "set_base",
        prompt = {
          arg = "base_url",
          label = "接口地址",
          placeholder = DEFAULT_BASE,
          hint = "OpenAI 兼容的地址（含 /v1）。本机服务可以填 http://127.0.0.1:11434/v1",
        },
      },
      {
        label = "改模型…",
        command = "set_model",
        prompt = {
          arg = "model",
          label = "模型名",
          placeholder = DEFAULT_MODEL,
          hint = "填服务商文档里那个名字",
        },
      },
    },
  }

  blocks[#blocks + 1] = { kind = "separator" }

  if preview then
    blocks[#blocks + 1] = { kind = "heading", text = "预览：" .. (PRESETS[preview.preset].label or preview.preset) }
    blocks[#blocks + 1] = { kind = "text", text = clip(preview.text, 800) }
    blocks[#blocks + 1] = {
      kind = "buttons",
      items = {
        { label = "追加到文末", command = "apply", args = { mode = "append" }, style = "primary" },
        -- ⚠️ 「替换全文」是**危险动作**：它会丢掉整篇原文（用户还能 Ctrl+Z，
        -- 但那要求他立刻反应过来）。画红，跟「删除」「丢弃并关闭」一致。
        { label = "替换全文", command = "apply", args = { mode = "replace" }, style = "danger" },
        { label = "放弃", command = "discard" },
      },
    }
  else
    blocks[#blocks + 1] = { kind = "heading", text = "对当前文档" }
    local items = {}
    for _, id in ipairs(PRESET_ORDER) do
      items[#items + 1] = { label = PRESETS[id].label, command = id }
    end
    blocks[#blocks + 1] = { kind = "buttons", items = items }
  end

  return blocks
end

-- ── 生命周期 ──────────────────────────────────────────────────────────────

--- 存一个设置项。空串 = **清掉**（回到默认值）——`PromptDialog` 那边把
--- "清空再确定"当取消，所以这条主要给"命令被别的插件调"的场合兜底。
local function save_setting(nota, key, value, what)
  if value == nil or value == "" then
    nota.settings.set(key, nil)
    nota.ui.notify(what .. "已恢复默认", "info")
  else
    nota.settings.set(key, value)
    nota.ui.notify(what .. "已保存", "success")
  end
  nota.ui.refresh("ai")
  return { ok = true }
end

function M.on_load(nota)
  -- 每个预设一条命令。用循环而不是抄五遍——抄五遍的版本一定会有一处名字
  -- 或提示词写错，而那种错只有点下去才发现。
  for _, id in ipairs(PRESET_ORDER) do
    -- ⚠️ 循环变量必须**当场捕获**到 `local`：Lua 的数值 for 每轮虽然换了值，
    -- 但闭包捕获的是同一个名字——不 `local` 一份的话，五个命令会全部指向
    -- 最后一个预设。这类错不报错，只是"点润色出来的是翻译"。
    local captured = id
    nota.command.register(captured, function(args)
      local scope = args and args.scope or "document"
      local r = run_preset(nota, captured, scope)
      if not r.ok then
        nota.ui.notify(r.error, "error")
      end
      return r
    end)
  end

  nota.command.register("set_key", function(args)
    return save_setting(nota, KEY_API, args and args.api_key, "密钥")
  end)

  nota.command.register("set_base", function(args)
    return save_setting(nota, KEY_BASE, args and args.base_url, "接口地址")
  end)

  nota.command.register("set_model", function(args)
    return save_setting(nota, KEY_MODEL, args and args.model, "模型")
  end)

  --- 把预览过的结果写进文档。
  ---
  --- ⚠️ **这条命令只该由用户点确认触发。** 别的地方（比如"生成完顺手调一下"）
  --- 调它，就等于绕过了那道确认。
  ---
  --- 内容取自 `preview` 而**不是** `args.text`：让界面把整段生成结果原样送回来
  --- 是一趟没有意义的来回（还多一份可能对不上的副本）。
  nota.command.register("apply", function(args)
    if not preview then
      return { ok = false, error = "没有待确认的内容" }
    end

    local mode = args and args.mode or "append"
    if mode == "replace" then
      nota.document.set_text(preview.text .. "\n")
    else
      -- 追加到末尾，前面留一个空行（否则会跟上文粘成一段）。
      local current = nota.document.get_text() or ""
      local sep = (current == "" or string.sub(current, -1) == "\n") and "" or "\n\n"
      nota.document.set_text(current .. sep .. preview.text .. "\n")
    end

    preview = nil
    nota.ui.refresh("ai")
    nota.ui.notify("已写入文档", "success")
    return { ok = true }
  end)

  --- 丢掉预览。
  nota.command.register("discard", function()
    preview = nil
    nota.ui.refresh("ai")
    return { ok = true }
  end)

  -- ── 界面贡献 ────────────────────────────────────────────────────────────
  -- `location` 现在其实可以省（默认就是 `right`），写出来是为了让人一眼看到。
  -- 旧值是 `"sidebar"`，那时插件装在左侧栏第三页；那一页 2026-09-22 搬到了右边。
  nota.ui.register_panel({
    id = "ai",
    title = "AI",
    location = "right",
    render = function()
      return panel_content(nota)
    end,
  })

  -- 五个预设都进菜单。⚠️ **菜单和面板上的按钮要对得上**：只在面板里放两个、
  -- 菜单里放三个，用户就得记住"哪个功能在哪儿"，而这种记性没人愿意花。
  for _, id in ipairs(PRESET_ORDER) do
    nota.ui.register_menu({ label = PRESETS[id].label, command = id, menu = "plugins" })
  end
end

function M.on_unload()
  -- ⚠️ **密钥和地址留在设置文件里**（`nota.settings` 每次 `set` 就落盘了），
  -- 不在这里清。卸载插件不该把用户填的东西一起扔了——那是"装回来还得重填"。
  -- 待确认的预览只在内存里，随进程走，不用管。
end

return M
