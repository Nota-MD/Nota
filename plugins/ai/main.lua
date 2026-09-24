-- AI 助手插件：右侧那一栏里的**一间对话框**。
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
-- # 一次对话长什么样（用户 2026-09-24 定的）
--
-- > 你要让 AI 生成 diff……应该是有一个对话框，然后 AI 可以做出普通文本的回复。
-- > 在末尾用特殊标注写 diff。
--
-- 所以每一轮回答都是**两段**：
--
-- 1. **普通文本**（可以直接读的那段话）——画成对话里的一条消息；
-- 2. 需要改文档时，**最末尾**再附一个改动块：用围栏 ````nota-diff` 包起来，
--    `-` 开头的是"原文里要被换掉的那几行"，`+` 开头的是"换上去的新话"。
--
-- 界面上画成一块 `kind = "diff"` 的内容块（宿主只负责画，不认识"改动块"这个概念）。
-- **解析与应用走宿主的 `nota.diff`**（`src-tauri/src/lua/api/diff.rs`）：
-- 那份格式不是 AI 专有的，而且它是唯一会改坏文档的地方，得能拿 Rust 单元测试钉住。
-- 契约见 `docs/13-lua-api.md` §「AI 改动块」——那是全局那份。
--
-- # ⚠️ 一条设计原则：**AI 的输出不许直接落进文档**
--
-- 从第一版起就没变过，现在更硬：改动**先解析成一份待应用的清单**，在面板上
-- 画成一块 diff，用户点「应用改动」才 `set_text`。理由很实在——模型会犯错，
-- 而"文档被悄悄改掉、用户按了 Ctrl+Z 才发现"是最坏的一种错。
--
-- 另一条同样重要：**改动是按"逐字找到那几行"应用的**（`nota.diff.apply`），
-- 不是"从头覆盖整篇"。所以应用失败时文档**一个字都没动**，只会报"没找到"。
-- 这比"改了一半"好得多。
--
-- # 多对话
--
-- 面板顶部是**对话清单**：可以开新的、切回旧的、删掉不要的。每个对话有自己
-- 的消息历史和待应用的改动。
--
-- ⚠️ **对话只在内存里**（模块局部的 `chats`），关掉应用就没了。
-- 存盘要走 `nota.settings`，而那是"一个键一个标量"的地方（见 settings.rs
-- 顶上那段"能存的类型故意很小"），塞整份聊天记录进去得先自己发明一套编码。
-- 这一版不做，理由和退路记在 `docs/07`。
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
-- `src-tauri/src/lua/mod.rs::内置插件都能被_lua_编译` 把这条钉住了。

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

-- ── 上限 ──────────────────────────────────────────────────────────────────
--
-- ⚠️ 每一个都是**为了"这一栏还能看"**：右侧栏只有 260px 宽，而对话是会长的东西，
-- 不设上限的话一屏里全是一个月前的聊天记录。

--- 面板上最多画最近几条消息。
local SHOW_MSGS = 8

--- 一块改动最多画多少行。**只是画**——应用用的是完整的那份。
local SHOW_DIFF_LINES = 120

--- 最多同时留几个对话。
local MAX_CHATS = 20

--- 发给模型的历史最多带几轮（`user`/`assistant` 各算一条）。
--- 不带上限的话，聊久了每次请求都要把整段历史重发一遍。
local HISTORY_MAX = 40

-- ── 预设 ──────────────────────────────────────────────────────────────────
--
-- ⚠️ **顺序写死在一张数组里**，不用 `pairs` 遍历下面那张表——`pairs` 的顺序
-- 不保证，界面上那排按钮会每次重开都换位置（而且不报错，只是"按钮乱跳"）。
local PRESET_ORDER = { "polish", "summarize", "continue_writing", "translate_en", "translate_zh" }

-- 每一句都是**用户会说的那句话**：它会作为一条用户消息出现在对话里，
-- 所以不能写成"给模型的命令"（那样用户看到的是"请只输出译文："这种半句话）。
local PRESETS = {
  polish = {
    label = "润色",
    ask = "帮我润色当前文档，保持原意和语气。改动用末尾的改动块给出。",
  },
  summarize = {
    label = "总结",
    ask = "用要点总结一下当前文档。只回答，不要改文档。",
  },
  continue_writing = {
    label = "续写",
    ask = "顺着当前文档继续写下去，风格保持一致。新内容用只有 `+` 行的改动块追加到文末。",
  },
  translate_en = {
    label = "译成英文",
    ask = "把当前文档整篇译成英文。改动用末尾的改动块给出（整段替换）。",
  },
  translate_zh = {
    label = "译成中文",
    ask = "把当前文档整篇译成中文。改动用末尾的改动块给出（整段替换）。",
  },
}

-- ── 送给模型的系统提示词 ──────────────────────────────────────────────────
--
-- ⚠️ 下面这段和 `lua/api/diff.rs` 里那两个围栏常量、`docs/13` 那张表是
-- **同一份契约的三处**。改一处就得改三处——漏一处的症状是"模型照旧格式写、
-- 插件认不出来了"，而两边都不报错。
--
--（从前这里还有 `FENCE_OPEN` / `FENCE_CLOSE` 两个常量，解析也在这个文件里。
-- 2026-09-24 解析与应用搬去了宿主，常量跟着走，别在这儿再写一份。）**每轮都重发**（里面带着当前文档的全文）。
---
--- ⚠️ 为什么文档放在**系统消息**里、而不是第一轮的用户消息里：文档是会被改的
---（用户自己改、或者刚应用了一处改动），而 `-` 行必须与**当前**文档逐字一致。
--- 放在每轮重建的系统消息里，模型看到的永远是此刻的正文。
local SYSTEM_PROMPT = [[
你是 Nota（一个 Markdown 编辑器）里的写作助手。用户在同你对话，系统消息里带着当前文档的全文。

你的回答分两部分，按这个顺序写：

第一部分是**普通文本**：直接回答用户。可以解释、可以建议、可以只是聊天、可以问回去。按 Markdown 写，用户在对话里直接读这一段。

第二部分（**只有需要改文档的时候才写**）是**改动块**，放在整个回答的**最末尾**：

```nota-diff
- 原文里的一整行（逐字照抄，从行首到行尾，一个字都不能改）
- 原文里紧接着的下一行
+ 换上去的新内容
+ 可以有好几行
```

改动块的规矩（错一条就应用不上）：

1. 它必须是回答的**最后一样东西**，后面不要再写任何字；
2. `-` 行必须和**当前文档**逐字一致，而且必须是文档里**连续的一段**：不要改标点、不要补空格、不要省略、不要自己排版；
3. `-` 行是"要被换掉的原话"，`+` 行是"换上去的新话"。不是让你把改过的整篇文档重抄一遍，只写动过的那一段；
4. 只改一处就写一个改动块；改多处就写多个改动块，**按它们在文档里出现的先后顺序**写；
5. 只是往文档里加新东西（不删任何一行）时，改动块里**只写 `+` 行**，它会追加到文末；
6. **不需要改文档时就一个改动块都不要写**：不要写空的改动块，也不要写"占位"的改动块。

⚠️ 你说要改什么，就必须在改动块里给出。用户是按改动块把改动**应用**进文档的，正文里那句"我把第二段改得更简洁了"不会进文档。
]]

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

--- 按**字符**截断（不是字节）：按字节截会把一个汉字劈成半个，
--- 半个汉字出去会被宿主转成"�"。
local function clip(s, limit)
  local n = utf8.len(s)
  if n == nil then
    -- 不是合法 UTF-8（理论上到不了）。按字节兜底，总比不截好。
    if #s <= limit then
      return s
    end
    return string.sub(s, 1, limit) .. "…"
  end
  if n <= limit then
    return s
  end
  return string.sub(s, 1, utf8.offset(s, limit + 1) - 1) .. "…（后面还有内容，面板放不下）"
end

--- 去掉首尾空白。`gsub` 返回两个值，外面那对括号是**必须**的。
local function trim(s)
  return (string.gsub(s, "^%s*(.-)%s*$", "%1"))
end

--- 把宿主抛回来的错误收拾成一句人话（**只治显示**）。
---
--- ⚠️ mlua 有个绕不开的行为：**从 Rust 回调里返回的错误会被它包成 `CallbackError`**，
--- 并在消息后面缀上一整段 `stack traceback:`（`mlua-0.12.1/src/util/error.rs`
--- 里 `callback_error` 干的）。`pcall` 抓到的就是那段字符串——2026-09-24 目检实测：
--- 一次"连不上"能把面板糊满，连状态栏都被顶掉两行，而用户要的只是"连不上"三个字。
---
--- 所以这里把栈掐掉、把 `runtime error: ` 这个前缀去掉。⚠️ 里面的换行在面板上
--- 会**折成空格**（`text` 块按正常空白排版），但掐的时候得按原文找，别按看到的找。
---
--- ⚠️ 真要让所有插件都不用管这件事，得让宿主那边的 `nota.http.*` **不返回 Err 而是
--- 返回 `(nil, 原因)`**——和 `nota.diff.apply` 一个风格。那是接口层的事，记在 `docs/07`。
local function clean_error(e)
  local s = tostring(e)
  local cut = string.find(s, "stack traceback:", 1, true)
  if cut then
    s = string.sub(s, 1, cut - 1)
  end
  s = (string.gsub(s, "^runtime error: ", ""))
  return trim(s)
end

-- ── 改动块：交给宿主 ─────────────────────────────────────────────────────
--
-- 「末尾附一段 diff」这件事的**解析与应用都在宿主的 `nota.diff` 里**
--（`src-tauri/src/lua/api/diff.rs`），本文件只负责调它。为什么不在插件里做：
--
-- 1. 那份格式**不是 AI 专有的**——界面上那块 `kind = "diff"` 的渲染本来就在
--    宿主里（`src/ui/panel-nodes.ts` 的白名单），格式的定义放宿主才不会两边漂；
-- 2. 它唯一会**改坏用户文档**，所以必须能拿单元测试一条条钉住。Rust 那边一条
--    `#[test]` 就够，写在 Lua 里得先造一个宿主环境；
-- 3. 这一份文件还要守 1000 行上限（`docs/09` §4），搬走这 200 行是**按职责拆**
--    ——插件管对话，宿主管格式——不是为凑行数。
--
-- ⚠️ 契约（改一处要改三处）：围栏与那几条规矩写在 `lua/api/diff.rs`
-- ＋ 下面那段 `SYSTEM_PROMPT`（送给模型的）＋ `docs/13-lua-api.md` §AI 改动块。

--- 拆一段回答：返回 `{ text = 正文, hunks = {...}, bad = 坏行数 }`。
--- 一个改动块都没有时 `hunks` 是空表（**不是 `nil`**：调用方不用分情况）。
local function parse_reply(nota, text)
  return nota.diff.parse(text)
end

--- 应用改动：成功给新全文，失败给 `nil, 原因`（**失败时文档一个字都不许动**）。
local function apply_changes(nota, doc, hunks)
  return nota.diff.apply(doc, hunks)
end

-- ── 对话 ──────────────────────────────────────────────────────────────────

--- 全部对话。⚠️ **只在内存里**（见文件头），关掉应用就没了。
local chats = {}

--- 当前是第几个（1 起）。
local cur = 1

--- 下一个对话的编号。用**编号**而不是下标当身份：删掉一个对话之后下标会整体前移，
--- 而面板上那个「切到这个对话」的按钮里存的是编号（`args.id`）。
local next_id = 1

--- 开局就摆一个空对话（不然面板一打开是"没有对话"，用户得先点一下才能说话）。
local function reset_chat()
  chats[1] = { id = next_id, title = "新对话", msgs = {}, patch = nil }
  next_id = next_id + 1
  cur = 1
end

reset_chat()

--- 当前那个对话。下标越界（删过头、热重载）就拉回第一个。
local function cur_chat()
  if cur < 1 or cur > #chats then
    cur = 1
  end
  return chats[cur]
end

--- 按编号找对话的下标。找不到给 `nil`。
local function find_chat(id)
  for i, c in ipairs(chats) do
    if c.id == id then
      return i
    end
  end
  return nil
end

--- 这个对话里说过话没有。**在 push 之前调**——用来决定要不要拿第一句话当标题。
local function chat_is_fresh(chat)
  for _, m in ipairs(chat.msgs) do
    if m.role == "user" then
      return false
    end
  end
  return true
end

--- 拿一句话当标题：掐短、去掉换行（标题只会画在一颗按钮里）。
---
--- ⚠️ 这里**不能**用 `clip()`。它截短之后补的那句"（后面还有内容，面板放不下）"
--- 是**给正文**看的说明，十几二十个字；塞进一颗标题按钮里会把标题整个盖掉——
--- 实测就是这样：按钮上出现的不是问题，而是那句说明。标题的省略号自己加。
local function title_from(text)
  local one = (string.gsub(text, "%s+", " "))
  local n = utf8.len(one)
  if n and n > 14 then
    return string.sub(one, 1, utf8.offset(one, 15) - 1) .. "…"
  end
  return one
end

-- ── 请求 ──────────────────────────────────────────────────────────────────

--- 发一次对话请求，返回 `{ ok, text }` 或 `{ ok = false, error }`。
---
--- ⚠️ `nota.http.*` **出错是抛 Lua 错误**，不是返回错误码（见 docs/13 §http）：
--- "地址不合法" / "连不上" / "超时" 全走 throw。所以这里必须 `pcall` 兜住，
--- 否则一次断网就会让整条命令带着一长串栈信息冒到界面上。
local function request(nota, messages)
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
        messages = messages,
      },
    })
  end)

  if not ok then
    return { ok = false, error = "请求没发出去：" .. clean_error(err) }
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

--- 组装这一轮发给模型的完整消息表。
---
--- ⚠️ 文档进的是**系统消息**，而且每轮重建（理由见 `SYSTEM_PROMPT` 那段）。
--- `error` / `note` 那两种角色**不发给模型**：它们是给用户看的旁白。
local function build_messages(nota, chat)
  local doc = nota.document.get_text() or ""
  local sys
  if doc == "" then
    sys = SYSTEM_PROMPT .. "\n\n（当前文档是空的。）"
  else
    sys = SYSTEM_PROMPT .. "\n\n──── 当前文档全文开始 ────\n" .. doc .. "\n──── 当前文档全文结束 ────"
  end

  local messages = { { role = "system", content = sys } }

  -- 只带最近 HISTORY_MAX 条：聊久了全带上，每一轮都在重发一个月前的记录。
  local start_i = math.max(1, #chat.msgs - HISTORY_MAX + 1)
  for i = start_i, #chat.msgs do
    local m = chat.msgs[i]
    if m.role == "user" or m.role == "assistant" then
      messages[#messages + 1] = { role = m.role, content = m.text }
    end
  end

  return messages
end

--- 说一句话 → 等回答 → 落进对话里。**所有会走网络的路都收在这一个函数**。
local function send_chat(nota, chat, text)
  local fresh = chat_is_fresh(chat)
  chat.msgs[#chat.msgs + 1] = { role = "user", text = text }
  if fresh then
    chat.title = title_from(text)
  end

  local r = request(nota, build_messages(nota, chat))

  if not r.ok then
    -- ⚠️ 失败也**留在对话里**（用一种单独的角色）：用户看得见自己说了什么、
    -- 失败在哪一步，而不是"面板闪了一下，我说的话也没了"。
    chat.msgs[#chat.msgs + 1] = { role = "error", text = r.error }
    nota.ui.refresh("ai")
    nota.ui.notify(r.error, "error")
    return { ok = false, error = r.error }
  end

  chat.msgs[#chat.msgs + 1] = { role = "assistant", text = r.text }

  local p = parse_reply(nota, r.text)
  if #p.hunks > 0 then
    chat.patch = { hunks = p.hunks, bad = p.bad }
    nota.ui.notify("AI 的回复里带了改动，确认后才会写进文档。", "info")
  else
    -- ⚠️ 新回复里没有改动块 → **上一处作废**。留着它的话，用户又聊了几轮之后
    -- 点「应用改动」，应用的是几轮之前那处已经过时的改动。
    chat.patch = nil
  end

  nota.ui.refresh("ai")
  return { ok = true, text = r.text }
end

--- 跑一个预设：就是把那句写好的话当用户消息发出去。
local function run_preset(nota, id)
  local p = PRESETS[id]
  if not p then
    return { ok = false, error = "不认识的预设：" .. tostring(id) }
  end
  local r = send_chat(nota, cur_chat(), p.ask)
  -- 从菜单点进来的时候用户未必看着右侧面板，说一句让他去那儿看。
  if r.ok then
    nota.ui.notify("「" .. p.label .. "」的回答在右侧 AI 面板里。", "success")
  end
  return r
end

-- ── 面板内容 ──────────────────────────────────────────────────────────────

--- 设置那三行 ＋ 三颗按钮。抽出来只是为了让 `panel_content` 短一点。
local function settings_blocks(nota, key)
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

  return blocks
end

--- 对话清单那一段：新开、切换、删除。
local function chats_blocks()
  local blocks = {}

  blocks[#blocks + 1] = {
    kind = "heading",
    text = string.format("对话（第 %d / %d 个）", cur, #chats),
  }

  local items = { { label = "＋ 新对话", command = "new_chat" } }
  if #chats > 1 then
    -- ⚠️ 红色：「删除」会把这个对话的聊天记录扔掉（记忆里的东西，没有撤销）。
    -- 只剩一个对话时不画它——那时的"删除"其实是"清空"，两件事不该共用一个按钮。
    items[#items + 1] = { label = "删除这个对话", command = "del_chat", style = "danger" }
  end

  -- 只列最近 5 个：这一栏 260px 宽，二十颗按钮会把下面的对话全顶出屏幕。
  local start_i = math.max(1, #chats - 5 + 1)
  for i = start_i, #chats do
    local c = chats[i]
    items[#items + 1] = {
      label = (i == cur and "● " or "") .. c.title,
      command = "switch_chat",
      args = { id = c.id },
      style = (i == cur) and "primary" or "normal",
    }
  end
  blocks[#blocks + 1] = { kind = "buttons", items = items }

  if start_i > 1 then
    blocks[#blocks + 1] = {
      kind = "text",
      tone = "muted",
      text = string.format("（只列最近 5 个；这个对话前面还有 %d 个）", start_i - 1),
    }
  end

  return blocks
end

--- 对话本身：最近几条消息。
local function messages_blocks(nota, chat)
  local blocks = {}
  local msgs = chat.msgs

  if #msgs == 0 then
    blocks[#blocks + 1] = {
      kind = "empty",
      text = "还没说话。在下面打字，或者点一个预设。",
    }
    return blocks
  end

  local start_i = math.max(1, #msgs - SHOW_MSGS + 1)
  if start_i > 1 then
    blocks[#blocks + 1] = {
      kind = "text",
      tone = "muted",
      text = string.format("（只显示最近 %d 条；这个对话一共 %d 条）", SHOW_MSGS, #msgs),
    }
  end

  for i = start_i, #msgs do
    local m = msgs[i]
    if m.role == "assistant" then
      -- ⚠️ 显示的是**拆掉改动块之后的正文**：改动块在下面单独画成一块 diff，
      -- 两处都画一遍，用户要读的东西就被夹在中间了。
      local p = parse_reply(nota, m.text)
      local body = p.text
      if body == "" then
        body = "（这一轮只有改动块，没有别的话。）"
      end
      -- ⚠️ 15000 这个数是**跟两头对齐过的**：宿主和前端对一条文本的兜底都是
      -- 20000 字（`ui.rs::面板文本上限` / `panel-nodes.ts::消息上限`），
      -- 而它们截断只留一个 `…`、不解释。压在它们下面，用户看到的就是这句话里
      -- 说明白的"后面还有内容"。真要长到 15000 字以上的回答，
      -- 该做的是把回答存成文件（记在 `docs/07`）。
      blocks[#blocks + 1] = { kind = "message", from = "ai", text = clip(body, 15000) }
    elseif m.role == "user" then
      blocks[#blocks + 1] = { kind = "message", from = "user", text = clip(m.text, 1000) }
    elseif m.role == "error" then
      -- 失败的那一轮。**用 danger 画**：它是一句要用户处理的话（密钥不对、
      -- 连不上），不是聊天内容。
      blocks[#blocks + 1] = { kind = "text", tone = "danger", text = m.text }
    else
      -- `note` 之类：旁白，灰色。
      blocks[#blocks + 1] = { kind = "text", tone = "muted", text = m.text }
    end
  end

  return blocks
end

--- 待应用的那块改动。
local function patch_blocks(chat)
  local blocks = {}
  local patch = chat.patch
  if not patch then
    return blocks
  end

  blocks[#blocks + 1] = { kind = "separator" }
  blocks[#blocks + 1] = { kind = "heading", text = "待应用的改动（还没写进文档）" }

  if patch.bad and patch.bad > 0 then
    blocks[#blocks + 1] = {
      kind = "text",
      tone = "warn",
      text = string.format("改动块里有 %d 行既不 - 也不 +，忽略掉了。", patch.bad),
    }
  end

  local many = #patch.hunks > 1
  local drawn, total = 0, 0
  for i, h in ipairs(patch.hunks) do
    if many then
      blocks[#blocks + 1] = { kind = "text", tone = "muted", text = string.format("第 %d 处", i) }
    end
    local items = {}
    for _, line in ipairs(h.del) do
      total = total + 1
      if drawn < SHOW_DIFF_LINES then
        items[#items + 1] = { op = "del", text = line }
        drawn = drawn + 1
      end
    end
    for _, line in ipairs(h.add) do
      total = total + 1
      if drawn < SHOW_DIFF_LINES then
        items[#items + 1] = { op = "add", text = line }
        drawn = drawn + 1
      end
    end
    blocks[#blocks + 1] = { kind = "diff", items = items }
  end

  if total > drawn then
    blocks[#blocks + 1] = {
      kind = "text",
      tone = "muted",
      text = string.format(
        "（一共 %d 行，这里只画了前 %d 行；点「应用改动」写进去的是完整的那份）",
        total, drawn
      ),
    }
  end

  blocks[#blocks + 1] = {
    kind = "buttons",
    items = {
      { label = "应用改动", command = "apply_patch", style = "primary" },
      { label = "放弃改动", command = "discard_patch" },
    },
  }

  return blocks
end

--- 面板此刻该显示什么。**每次拉都现跑**（见 `docs/13` §render）。
local function panel_content(nota)
  local chat = cur_chat()
  local key = read_setting(nota, KEY_API, "")
  local blocks = {}

  for _, b in ipairs(settings_blocks(nota, key)) do
    blocks[#blocks + 1] = b
  end
  blocks[#blocks + 1] = { kind = "separator" }

  for _, b in ipairs(chats_blocks()) do
    blocks[#blocks + 1] = b
  end
  for _, b in ipairs(messages_blocks(nota, chat)) do
    blocks[#blocks + 1] = b
  end
  for _, b in ipairs(patch_blocks(chat)) do
    blocks[#blocks + 1] = b
  end

  blocks[#blocks + 1] = { kind = "separator" }
  blocks[#blocks + 1] = { kind = "heading", text = "对当前文档" }
  local items = {}
  for _, id in ipairs(PRESET_ORDER) do
    items[#items + 1] = { label = PRESETS[id].label, command = id }
  end
  blocks[#blocks + 1] = { kind = "buttons", items = items }

  if key == "" then
    -- ⚠️ 没密钥时**连输入框都不画**：画了的话用户敲一段话、按发送、等几秒、
    -- 拿到一句"还没填密钥"。不如把话先说在前面。
    blocks[#blocks + 1] = {
      kind = "text",
      tone = "warn",
      text = "先点上面的「设置密钥…」填好，这里才会出现输入框。",
    }
  else
    blocks[#blocks + 1] = {
      kind = "input",
      arg = "text",
      submit = "send",
      submit_label = "发送",
      placeholder = "问点什么，或者让它改文档…",
      -- 多行框里回车是换行，发送是 Ctrl+Enter（前端 `PanelBody.tsx` 定的规矩）。
      hint = "Ctrl+Enter 发送 · 回车换行",
      multiline = true,
    }
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
    nota.command.register(captured, function()
      return run_preset(nota, captured)
    end)
  end

  --- 用户在面板里敲的一句话。`args.text` 是输入框里的内容。
  nota.command.register("send", function(args)
    local text = args and args.text
    if type(text) ~= "string" or trim(text) == "" then
      return { ok = false, error = "没写要发的内容" }
    end
    return send_chat(nota, cur_chat(), trim(text))
  end)

  --- 开一个新对话，并切过去。
  nota.command.register("new_chat", function()
    if #chats >= MAX_CHATS then
      local msg = string.format("对话最多同时留 %d 个，先删掉几个。", MAX_CHATS)
      nota.ui.notify(msg, "warn")
      return { ok = false, error = msg }
    end
    chats[#chats + 1] = { id = next_id, title = "新对话", msgs = {}, patch = nil }
    next_id = next_id + 1
    cur = #chats
    nota.ui.refresh("ai")
    return { ok = true }
  end)

  --- 切到某个对话。`args.id` 是编号（`chats_blocks` 里发出的那个）。
  nota.command.register("switch_chat", function(args)
    local id = args and args.id
    local i = id and find_chat(id) or nil
    if not i then
      return { ok = false, error = "那个对话已经不在了" }
    end
    cur = i
    nota.ui.refresh("ai")
    return { ok = true }
  end)

  --- 删掉当前对话。
  ---
  --- ⚠️ 只剩一个时**不删而是清空**：一个对话都没有的界面很难用（输入框没地方
  --- 落），而"删除"和"清空"在这里对用户是同一件事。
  nota.command.register("del_chat", function()
    if #chats <= 1 then
      local c = cur_chat()
      c.msgs, c.patch, c.title = {}, nil, "新对话"
      nota.ui.notify("已清空这个对话", "info")
    else
      table.remove(chats, cur)
      if cur > #chats then
        cur = #chats
      end
      nota.ui.notify("已删除这个对话", "info")
    end
    nota.ui.refresh("ai")
    return { ok = true }
  end)

  --- 把待应用的改动写进文档。
  ---
  --- ⚠️ **这条命令只该由用户点确认触发。** 别的地方（比如"生成完顺手调一下"）
  --- 调它，就等于绕过了那道确认。
  ---
  --- 用的是 `chat.patch` 里的那份（不是界面送回来的）：让界面把整块改动原样送回来
  --- 是一趟没有意义的来回（还多一份可能对不上的副本）。
  nota.command.register("apply_patch", function()
    local chat = cur_chat()
    if not chat.patch then
      return { ok = false, error = "没有待应用的改动" }
    end

    local doc = nota.document.get_text() or ""
    local new_text, err = apply_changes(nota, doc, chat.patch.hunks)
    if not new_text then
      -- **文档一个字都没动**（`apply_patch` 失败时不返回半截结果）。
      nota.ui.notify("改动没能应用：" .. err, "error")
      return { ok = false, error = err }
    end

    nota.document.set_text(new_text)
    chat.msgs[#chat.msgs + 1] = { role = "note", text = "（已应用这次改动。）" }
    chat.patch = nil
    nota.ui.refresh("ai")
    nota.ui.notify("改动已写入文档，Ctrl+Z 可以撤销", "success")
    return { ok = true }
  end)

  --- 丢掉待应用的改动（**不动文档**）。
  nota.command.register("discard_patch", function()
    local chat = cur_chat()
    if chat.patch then
      chat.msgs[#chat.msgs + 1] = { role = "note", text = "（这次的改动作废了。）" }
      chat.patch = nil
    end
    nota.ui.refresh("ai")
    return { ok = true }
  end)

  nota.command.register("set_key", function(args)
    return save_setting(nota, KEY_API, args and args.api_key, "密钥")
  end)

  nota.command.register("set_base", function(args)
    return save_setting(nota, KEY_BASE, args and args.base_url, "接口地址")
  end)

  nota.command.register("set_model", function(args)
    return save_setting(nota, KEY_MODEL, args and args.model, "模型")
  end)

  -- ── 界面贡献 ────────────────────────────────────────────────────────────
  -- `location` 现在其实可以省（默认就是 `right`），写出来是为了让人一眼看到。
  -- 旧值是 `"sidebar"`，那时插件装在左侧栏第三页；那一页 2026-09-22 搬到了右边。
  --
  -- ⚠️ 2026-09-24 起右侧栏是**一页签一个插件**（用户要求"两个拓展不能同时占用"），
  -- 所以这一页打开时是独占的——见 `docs/04` §右侧栏。
  nota.ui.register_panel({
    id = "ai",
    title = "AI",
    location = "right",
    render = function()
      return panel_content(nota)
    end,
  })

  -- 预设都进菜单。⚠️ **菜单和面板上的按钮要对得上**：只在面板里放两个、
  -- 菜单里放三个，用户就得记住"哪个功能在哪儿"，而这种记性没人愿意花。
  for _, id in ipairs(PRESET_ORDER) do
    nota.ui.register_menu({ label = PRESETS[id].label, command = id, menu = "plugins" })
  end
  nota.ui.register_menu({ label = "新对话", command = "new_chat", menu = "plugins" })
end

function M.on_unload()
  -- ⚠️ **密钥和地址留在设置文件里**（`nota.settings` 每次 `set` 就落盘了），
  -- 不在这里清。卸载插件不该把用户填的东西一起扔了——那是"装回来还得重填"。
  -- 对话本来就在内存里，随进程走，不用管。
end

return M
