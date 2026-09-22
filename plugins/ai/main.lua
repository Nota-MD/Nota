-- AI 助手插件。
--
-- ⚠️ 本轮的状态：**本地那半是真的，联网那半是占位的**。
-- `nota.http` / `nota.settings` 在宿主侧还没实现（docs/07 第 12、13 项），
-- 调用它们会返回一句明确的"尚未实现"。这样写的用意是：接线全通，
-- 等宿主那两个 API 一落地，这个文件基本不用改就能跑。
--
-- 一条设计原则贯穿本文件：**AI 的输出不许直接落进文档**。
-- 所有会改文档的操作都要先经过一次"预览并确认"。理由很实在——
-- 模型会犯错，而"文档被悄悄改掉、用户按了 Ctrl+Z 才发现"是最坏的一种错。

local M = {}

local PROMPTS = {
  polish = "请润色下面这段中文，保持原意与语气，只输出润色后的正文，不要解释：\n\n",
  summarize = "请用要点总结下面这段内容，只输出总结，不要解释：\n\n",
  continue_writing = "请顺着下面的内容继续写下去，保持风格一致，只输出续写的正文：\n\n",
  translate_en = "Translate the following into English. Output only the translation:\n\n",
  translate_zh = "把下面内容翻译成中文，只输出译文：\n\n",
}

--- 取这次要送给模型的正文。
--
-- `scope = "document"` 给全文，`scope = "diff"` 给 git 的未提交改动
-- （"帮我写提交信息"就是这一种）。
local function gather(nota, scope)
  if scope == "diff" then
    -- git 能力不在本插件里，但**别的插件注册了的命令可以调**。
    -- 这里通过事件问 git 插件要——见 docs/11 §插件之间怎么协作。
    -- 本轮先直接返回 nil，让调用方回退到全文。
    return nil, "还没接通 git 插件"
  end

  local text = nota.document.get_text()
  if not text or text == "" then
    return nil, "当前文档是空的"
  end
  return text, nil
end

--- 发起一次请求。**本轮必然走到"尚未实现"那条分支**。
local function ask(nota, key, scope)
  local preset = PROMPTS[key]
  if not preset then
    return { ok = false, error = "不认识的预设：" .. tostring(key) }
  end

  local text, err = gather(nota, scope)
  if not text then
    return { ok = false, error = err }
  end

  local prompt = preset .. text

  -- ⚠️ 这里将来要换成流式的（边生成边显示）。一次性请求对长文体验很差：
  -- 用户要盯着一个不动的界面等十几秒。流式排在宿主 HTTP 落地之后。
  local ok, response = pcall(function()
    return nota.http.post({
      url = "https://api.anthropic.com/v1/messages",
      headers = { ["content-type"] = "application/json" },
      body = { prompt = prompt },
    })
  end)

  if not ok then
    -- pcall 捕获到的就是宿主那句"网络请求尚未实现（见 docs/07 第 12 项）"。
    return { ok = false, error = tostring(response) }
  end

  return { ok = true, text = response.text or "" }
end

-- ── 生命周期 ──────────────────────────────────────────────────────────────

function M.on_load(nota)
  -- 五个预设，各注册一条命令。用循环而不是抄五遍——
  -- 抄五遍的版本一定会有一处名字写错，而那种错只有点下去才发现。
  for key, _ in pairs(PROMPTS) do
    local captured = key
    nota.command.register(captured, function(args)
      local scope = args and args.scope or "document"
      local result = ask(nota, captured, scope)
      if not result.ok then
        nota.ui.notify(result.error, "warn")
        return result
      end

      -- 只预览，不改文档。界面拿到 preview 后给用户看，
      -- 用户确认了再调 `apply`。
      nota.event.emit("ai:preview", {
        preset = captured,
        text = result.text,
      })
      return { ok = true, preview = result.text }
    end)
  end

  --- 把预览过的结果写进文档。
  ---
  --- **这条命令必须由用户在界面上点确认才会被调用。** 别的地方（比如"预览
  --- 完顺手调一下"）调它，就等于绕过了那道确认。
  nota.command.register("apply", function(args)
    local text = args and args.text
    if not text or text == "" then
      return { ok = false, error = "没有要写入的内容" }
    end

    local mode = args and args.mode or "append"
    if mode == "append" then
      -- 追加到末尾，前面留一个空行（否则会跟上文粘成一段）。
      local current = nota.document.get_text() or ""
      local sep = (current == "" or string.sub(current, -1) == "\n") and "" or "\n\n"
      nota.document.set_text(current .. sep .. text .. "\n")
    else
      nota.document.set_text(text)
    end

    nota.ui.notify("已写入文档", "success")
    return { ok = true }
  end)

  --- 报告本插件的可用状态。界面启动时问一次，用来显示"联网那半还没接通"。
  nota.command.register("status", function()
    local probe_ok = pcall(function()
      nota.http.post({ url = "https://example.invalid" })
    end)
    return {
      http_ready = probe_ok,
      note = probe_ok and "" or "宿主尚未实现网络请求（docs/07 第 12 项），本插件只能预览不能真正生成",
    }
  end)

  -- ── 界面贡献 ────────────────────────────────────────────────────────────
  -- `location` 现在其实可以省（默认就是 `right`），写出来是为了让人一眼看到。
  -- 旧值是 `"sidebar"`，那时插件装在左侧栏第三页；那一页 2026-09-22 搬到了右边。
  nota.ui.register_panel({ id = "ai", title = "AI", location = "right" })

  nota.ui.register_menu({ label = "润色", command = "polish", menu = "plugins" })
  nota.ui.register_menu({ label = "总结", command = "summarize", menu = "plugins" })
  nota.ui.register_menu({ label = "继续写", command = "continue_writing", menu = "plugins" })
end

function M.on_unload()
  -- 没有要落盘的状态：提示词是常量，会话不入库。
  -- 将来做多轮对话时，历史存在哪儿、要不要持久化，是那时再定的事。
end

return M
