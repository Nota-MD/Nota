//! 文档模型与文档仓库。
//!
//! # 真相在哪
//!
//! **编辑器在前端（ProseMirror/Milkdown），前端是文本的真相。** 本模块持有一份
//! **镜像**（`Document::text`），由前端在改动后推过来（`nota_doc_sync`），
//! 存盘则直接把镜像写盘。
//!
//! 为什么不像 Folio 那样把真相放后端：Folio 的编辑区是一个 WebKit 视图 + C 宿主，
//! 两边都要操作同一棵树，所以它挑了宿主做真相、JS 只是渲染。Nota 反过来——
//! 编辑器的撤销栈、选区、IME 组合态全在 ProseMirror 里，把真相搬回 Rust 等于
//! 把这些状态复制一份并保证同步，得不偿失。
//!
//! **代价与对策**：镜像可能短暂滞后。对策是两条——
//! 1. 前端改动后**去抖 300ms** 推一次；
//! 2. 任何"要读文档"的动作（存盘、插件读文档、导出）**先强制同步一次**，
//!    见 `commands::document::nota_doc_sync` 的调用点。
//!
//! 这条口径写在 `docs/03-data-structures.md`，改之前先读那里。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

/// 文档句柄。进程内唯一、单调递增，**不重用**。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct DocId(pub u64);

/// 一份打开的文档。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: DocId,
    /// 还没存过盘的新文档是 `None`。
    pub path: Option<PathBuf>,
    /// 标题。取自路径的文件名；新文档是"未命名 N"。
    pub title: String,
    /// 文本镜像。见模块头的说明。
    pub text: String,
    /// 相对上次落盘有无改动。
    pub dirty: bool,
    /// 每次 `sync` / `save` 递增。插件与前端靠它判断"我拿到的是不是旧的"。
    pub revision: u64,
    /// 这份文档的"未命名"序号。**建的时候定死，之后一律用它**（BUG-9）。
    ///
    /// 序号不能现算：正文标题会随打字出现又消失，`derive_title` 的回退分支
    /// 会被反复走到，现算就会让好几份文档同时叫「未命名 0」。
    #[serde(skip)]
    pub untitled_index: u64,
    /// 拿来跟 `text` 比出 `dirty` 的那一份"干净文本"。
    ///
    /// ⚠️ **`dirty` 不是"发生过 sync"**。编辑器装载一份文件时会把它规范化
    /// （尾段、空行、标记写法），那是编辑器改的、不是用户改的——见 BUG-12。
    /// 判据只能是"跟干净那份一不一样"，这份就是"干净那份"。
    /// 打开 / 存盘 / 重载 / `settle` 时更新。
    #[serde(skip)]
    pub clean_text: String,
}

impl Document {
    pub fn is_untitled(&self) -> bool {
        self.path.is_none()
    }

    /// 路径（若已存过盘）的字符串形式。
    pub fn path_string(&self) -> Option<String> {
        self.path.as_ref().and_then(|p| p.to_str()).map(str::to_owned)
    }
}

/// 从正文里猜标题。
///
/// 取值顺序：
/// 1. YAML front matter 里的 `title:`；
/// 2. 第一个 ATX 标题（`# ` ~ `###### `）；
/// 3. 文件名的 stem；
/// 4. "未命名 N"。
///
/// `strict` = 严格模式（`Settings::strict_markdown`）：它只影响第 2 条认哪些行
/// ——严格时井号后面**必须**有空格，宽松（默认）时 `#标题` 也算。见 `strip_atx`。
pub fn derive_title(
    text: &str,
    path: Option<&Path>,
    untitled_index: u64,
    strict: bool,
) -> String {
    if let Some(t) = front_matter_title(text) {
        return t;
    }
    if let Some(h) = first_heading(text, strict) {
        return h;
    }
    if let Some(p) = path {
        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            if !stem.is_empty() {
                return stem.to_owned();
            }
        }
    }
    format!("未命名 {untitled_index}")
}

/// 取 YAML front matter 里的 `title:`。front matter 必须**在文件最开头**，
/// 首行是 `---`，到下一个 `---` 或 `...` 结束（与 Jekyll 一致）。
fn front_matter_title(text: &str) -> Option<String> {
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    for line in lines {
        let trimmed = line.trim_end();
        if trimmed == "---" || trimmed == "..." {
            return None; // front matter 结束，里面没有 title
        }
        if let Some(rest) = trimmed.strip_prefix("title:") {
            let value = rest.trim().trim_matches(|c| c == '"' || c == '\'');
            if !value.is_empty() {
                return Some(value.to_owned());
            }
        }
    }
    None
}

/// 第一个 ATX 标题的文本。跳过围栏代码块里的 `#`（那多半是 shell 注释）。
fn first_heading(text: &str, strict: bool) -> Option<String> {
    let mut in_fence = false;
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(rest) = strip_atx(trimmed, strict) {
            if !rest.is_empty() {
                return Some(rest.to_owned());
            }
        }
    }
    None
}

/// 若这一行是 ATX 标题，返回标题文本（去掉 `#` 与可选的收尾 `#`）。
///
/// ⚠️ **严格与宽松只差一句**：井号后面没空格时（`#foo`），严格模式不认，
/// 宽松模式认。宽松是**默认**：`#foo` 这种写法在文档里很常见，
/// 关着才不会把它们降级成普通段落。⚠️ 前端有一份**同构**的判据
/// （`src/editor/atx.ts`），两边一起改。
///
/// ⚠️ 这里**只读不写**：宽松模式把 `#foo` 认成标题，但**正文一个字都不改**
/// ——前端那边也只是按标题排版（`src/editor/lax-heading.ts`），存盘存回
/// `#foo`（用户 2026-09-24 定的：「如果关闭，存盘不要自动修复」）。
fn strip_atx(line: &str, strict: bool) -> Option<&str> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];
    // `# foo` 两模式都算标题；`#foo` 只在宽松模式算。
    if strict && !rest.starts_with(' ') && !rest.is_empty() {
        return None;
    }
    Some(rest.trim().trim_end_matches('#').trim())
}

/// 打开的文档集合。
#[derive(Debug, Default)]
pub struct DocumentStore {
    docs: Vec<Document>,
    active: Option<DocId>,
    next_id: u64,
    untitled_count: u64,
    /// **严格模式**（`Settings::strict_markdown` 的镜像，默认 `false` = 宽松）。
    ///
    /// ⚠️ 文档仓**不自己去读设置**：建仓时由 `lib.rs` 传进来（`new` 的参数），
    /// 之后改动由 `commands::settings::nota_settings_set` 推过来。为什么不让它
    /// 持一份 `Settings`：锁序是 `plugins → documents → settings`，握着 `documents`
    /// 再拿 `settings` 虽然合法，但会让"改设置"这条路径多一层耦合，
    /// 而这里真正需要的只是一个 bool。
    strict_markdown: bool,
}

impl DocumentStore {
    /// 建一个文档仓，**建仓时就把标题口径定下来**。
    ///
    /// ⚠️ 这个参数不是可有可无的：标签页标题是文档仓**自己**从正文算的
    /// （`derive_title`），而严格与宽松对「这一行算不算标题」看法不同。
    /// 做成构造参数而不是"建完记得再调一次 `set_strict_markdown`"，是因为后者
    /// **忘得掉**——而且忘掉之后不报错，只是"设置文件里写着严格、标签页却按宽松算"。
    /// 2026-09-24 之前就是这个样子：全仓唯一一处会传严格模式的地方是
    /// `state.rs::AppState::new()`，而**那个构造函数没有任何调用者**
    /// （`lib.rs` 手写字面量），于是开机时那份设置**从来没到达文档仓**。
    ///
    /// ⚠️ 测试里也一样：不关心口径的用例显式写 `LAX`（见 `mod tests` 里那两个常量），
    /// 用 `..Default::default()` 绕过去，就等于把这个参数又变成可忘的。
    pub fn new(strict_markdown: bool) -> Self {
        Self {
            strict_markdown,
            ..Self::default()
        }
    }

    fn alloc_id(&mut self) -> DocId {
        self.next_id += 1;
        DocId(self.next_id)
    }

    /// 新建一份空文档并设为活动。
    pub fn create_untitled(&mut self) -> DocId {
        self.untitled_count += 1;
        let id = self.alloc_id();
        let doc = Document {
            id,
            path: None,
            title: format!("未命名 {}", self.untitled_count),
            text: String::new(),
            dirty: false,
            revision: 0,
            untitled_index: self.untitled_count,
            clean_text: String::new(),
        };
        self.docs.push(doc);
        self.active = Some(id);
        id
    }

    /// 从磁盘打开。已经在打开的集合里则**复用那一份**（不重复打开）。
    pub fn open(&mut self, path: &Path) -> Result<DocId> {
        if let Some(existing) = self.docs.iter().find(|d| d.path.as_deref() == Some(path)) {
            let id = existing.id;
            self.active = Some(id);
            return Ok(id);
        }

        let text = std::fs::read_to_string(path).map_err(|source| NotaError::Read {
            path: path.to_path_buf(),
            source,
        })?;

        let clean = text.clone();
        let id = self.alloc_id();
        self.docs.push(Document {
            id,
            path: Some(path.to_path_buf()),
            title: derive_title(&text, Some(path), 0, self.strict_markdown),
            text,
            dirty: false,
            revision: 0,
            // 有路径的文档走不到"未命名 N"那个回退分支（除非文件名是空的），
            // 所以不占号——`untitled_count` 是给新建文档排队的。
            untitled_index: 0,
            clean_text: clean,
        });
        self.active = Some(id);
        Ok(id)
    }

    /// 用磁盘内容重载一份文档（外部改动 / 放弃修改后重读）。
    pub fn reload(&mut self, id: DocId) -> Result<()> {
        let strict = self.strict_markdown;
        let path = self
            .get(id)
            .and_then(|d| d.path.clone())
            .ok_or(NotaError::NoActiveDocument)?;
        let text = std::fs::read_to_string(&path).map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        let idx = doc.untitled_index;
        doc.title = derive_title(&text, Some(&path), idx, strict);
        doc.clean_text = text.clone();
        doc.text = text;
        doc.dirty = false;
        doc.revision += 1;
        Ok(())
    }

    /// 前端推来的新文本。`revision` 由这里有意义地递增。
    ///
    /// ⚠️ **不无条件标脏**：`dirty` 的判据是"与 `clean_text` 一不一样"。
    /// 早先这里写的是 `doc.dirty = true`，于是编辑器装载文件时做的那次
    /// 规范化也被算成了用户改动（BUG-12）。
    pub fn sync(&mut self, id: DocId, text: String) -> Result<u64> {
        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        if doc.text == text {
            return Ok(doc.revision); // 内容没变时 revision 不动，拓展靠它判新旧
        }
        doc.text = text;
        doc.dirty = doc.text != doc.clean_text;
        doc.revision += 1;
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, doc.path.as_deref(), idx, strict);
        Ok(doc.revision)
    }

    /// 前端编辑器**装载完之后**交回来的那份文本：认它做正文，**同时**认它做干净的那份。
    ///
    /// # 为什么需要这么一步
    ///
    /// 编辑器把 markdown 解析成文档树、再序列化回来，结果未必与磁盘上那份逐字节相同
    /// （尾段、空行、标记写法都可能被规范化）。那是**编辑器**改的，不是**用户**改的，
    /// 可它确实会让 `text` 与 `clean_text` 对不上、于是 `dirty` 变真——症状就是
    /// "文件刚打开就显示已修改"，关窗口还要多问一句（BUG-12）。
    ///
    /// # 它为什么安全
    ///
    /// 调用点只有一个：`EditorPane` 在 `createEditor()` 返回之后、**用户还没碰键盘之前**。
    /// 那一刻不存在"用户的改动"可以被这一步吞掉。真编辑走的是 `sync`。
    ///
    /// ⚠️ 这一招**与根因无关**：不管规范化是哪个插件做的（当时没能坐实，`trailing`
    /// 和序列化器都是候选），"用户还没打过字"这个事实都成立，所以它一定对。
    pub fn settle(&mut self, id: DocId, text: String) -> Result<u64> {
        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;

        if doc.text != text {
            doc.text = text.clone();
            doc.revision += 1;
            let idx = doc.untitled_index;
            doc.title = derive_title(&doc.text, doc.path.as_deref(), idx, strict);
        }

        // ⚠️ **不能早退**。编辑器那次规范化可能已经先走 `sync` 把文本推上来了，
        // 于是走到这里时 `text` 与 `doc.text` 已经相等，可脏标记还立着——
        // 早退就等于这一步白做（这条是被用例逮住的，改回去会红）。
        doc.clean_text = text;
        doc.dirty = false;
        Ok(doc.revision)
    }

    /// 落盘。`path_override` 用于「另存为」。
    pub fn save(&mut self, id: DocId, path_override: Option<PathBuf>) -> Result<PathBuf> {
        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        let path = match path_override {
            Some(p) => {
                doc.path = Some(p.clone());
                p
            }
            None => doc.path.clone().ok_or_else(|| {
                NotaError::other("这份文档还没有路径，请用「另存为」")
            })?,
        };

        if let Some(parent) = path.parent() {
            crate::paths::ensure_dir(parent)?;
        }
        std::fs::write(&path, &doc.text).map_err(|source| NotaError::Write {
            path: path.clone(),
            source,
        })?;

        doc.dirty = false;
        doc.clean_text = doc.text.clone(); // 磁盘上现在就是这份，它成了新的"干净"
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, Some(&path), idx, strict);
        doc.revision += 1;
        Ok(path)
    }

    /// 把这份文档**挪到另一个路径**（重命名 / 移动，`docs/10` §2 那一格）。
    ///
    /// 干两件事，而且**顺序不能反**：先让 `file_move::移动` 真的把盘上的文件挪走，
    /// 成功了再改这份文档记着的路径。反过来的话，"挪失败"会留下一份指向
    /// 不存在路径的文档——它看起来一切正常，下一次存盘才会把文件写回来
    /// （**在旧名字旁边凭空多出一份**）。
    ///
    /// ⚠️ **没有路径的文档（新建、还没存过盘）挪不了**：它压根没有文件可挪。
    /// 这里如实报一句，让界面去提示「先保存为」——**不要**顺手替用户存一份
    /// 到他没选过的位置，那是另一个动作。
    ///
    /// ⚠️ **不碰 `text` / `clean_text` / `dirty`**：挪的是文件，不是内容。
    /// 内存里那份未保存的改动照旧挂着，下一次存盘写到新路径上（这正是用户
    /// 期望的：改完名字继续写）。所以这里**只**动 `path` / `title` / `revision`。
    ///
    /// ⚠️ `revision` 要 +1：插件与前端靠它判断"我手里这份是不是旧的"，
    /// 而路径变了确实是它们该知道的一件事（面板上显示路径的那些）。
    pub fn 移到(&mut self, id: DocId, 目标: PathBuf) -> Result<PathBuf> {
        let strict = self.strict_markdown;
        let 老 = self
            .get(id)
            .and_then(|d| d.path.clone())
            .ok_or_else(|| NotaError::other("这份文档还没存过盘，先用「保存为」给它一个位置"))?;

        crate::file_move::移动(&老, &目标)?;

        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        doc.path = Some(目标.clone());
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, Some(&目标), idx, strict);
        doc.revision += 1;
        Ok(目标)
    }

    pub fn close(&mut self, id: DocId) {
        self.docs.retain(|d| d.id != id);
        if self.active == Some(id) {
            self.active = self.docs.last().map(|d| d.id);
        }
    }

    pub fn get(&self, id: DocId) -> Option<&Document> {
        self.docs.iter().find(|d| d.id == id)
    }

    pub fn get_mut(&mut self, id: DocId) -> Option<&mut Document> {
        self.docs.iter_mut().find(|d| d.id == id)
    }

    pub fn active(&self) -> Option<&Document> {
        self.active.and_then(|id| self.get(id))
    }

    pub fn active_id(&self) -> Option<DocId> {
        self.active
    }

    pub fn set_active(&mut self, id: DocId) -> Result<()> {
        if self.get(id).is_none() {
            return Err(NotaError::other(format!("没有这份文档：{id:?}")));
        }
        self.active = Some(id);
        Ok(())
    }

    pub fn list(&self) -> &[Document] {
        &self.docs
    }

    /// 跟上「严格模式」的开关，并**立刻重算所有已打开文档的标题**。
    ///
    /// ⚠️ 必须立刻重算，不能等下一次 `sync`：标题是从正文猜的（`derive_title`），
    /// 而严格与宽松对"这一行算不算标题"的判断不同（`#标签`）。用户改了设置
    /// 却看见标签页上的名字没变，只会以为设置没生效。
    ///
    /// ⚠️ 同样的道理，前端那边也要整篇重来一遍——见 `EditorPane` 里
    /// `strict` 进了那个 effect 的依赖：换模式 = 重建编辑器。
    pub fn set_strict_markdown(&mut self, strict: bool) {
        if self.strict_markdown == strict {
            return;
        }
        self.strict_markdown = strict;
        let strict = self.strict_markdown;
        for doc in &mut self.docs {
            let idx = doc.untitled_index;
            doc.title = derive_title(&doc.text, doc.path.as_deref(), idx, strict);
        }
    }

    pub fn has_unsaved(&self) -> bool {
        self.docs.iter().any(|d| d.dirty)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 两种模式在断言里的读法（⚠️ **默认是宽松**，`LAX` 不是"旧行为"）。
    const LAX: bool = false;
    const STRICT: bool = true;

    #[test]
    fn 标题优先取_front_matter() {
        let text = "---\ntitle: 我的笔记\n---\n\n# 别的标题\n";
        assert_eq!(derive_title(text, None, 1, LAX), "我的笔记");
    }

    #[test]
    fn 没有_front_matter_时取第一个标题() {
        let text = "前言\n\n## 小节标题 ##\n\n正文\n";
        assert_eq!(derive_title(text, None, 1, LAX), "小节标题");
    }

    #[test]
    fn 代码块里的井号不算标题() {
        let text = "```sh\n# 这是注释不是标题\n```\n\n# 真标题\n";
        assert_eq!(derive_title(text, None, 1, LAX), "真标题");
    }

    /// ⚠️ 这一条是「严格模式」那个开关的**后端判据**（用户 2026-09-24 要求）。
    /// 两行都留着：只测一边的话，把默认值改反了谁都不会发现。
    #[test]
    fn 井号后没空格严格模式不算标题() {
        let text = "#标签 不是标题\n";
        assert_eq!(derive_title(text, None, 7, STRICT), "未命名 7");
        // 宽松（默认）时它就是标题。
        assert_eq!(derive_title(text, None, 7, LAX), "标签 不是标题");
    }

    /// 井号后有空格时**两种模式都算小标题**（严格模式改的不是这个）。
    #[test]
    fn 建仓时就把标题口径定下来() {
        let 严格 = DocumentStore::new(STRICT);
        let mut 严格 = 严格;
        let id = 严格.create_untitled();
        严格.sync(id, "#标签\n".to_owned()).unwrap();
        assert_eq!(严格.get(id).unwrap().title, "未命名 1", "严格仓里这行不是标题");

        let mut 宽松 = DocumentStore::new(LAX);
        let id = 宽松.create_untitled();
        宽松.sync(id, "#标签\n".to_owned()).unwrap();
        assert_eq!(宽松.get(id).unwrap().title, "标签", "宽松仓里它是标题");
    }

    #[test]
    fn 井号后有空格两种模式都算标题() {
        let text = "# 你好\n";
        assert_eq!(derive_title(text, None, 7, STRICT), "你好");
        assert_eq!(derive_title(text, None, 7, LAX), "你好");
    }

    #[test]
    fn 取不到就回退到文件名或未命名() {
        assert_eq!(
            derive_title("正文而已", Some(Path::new("/tmp/我的文档.md")), 1, LAX),
            "我的文档"
        );
        assert_eq!(derive_title("正文而已", None, 3, LAX), "未命名 3");
    }

    /// 改「严格模式」要**当场**把已打开文档的标题重算一遍：标题是从正文猜的，
    /// 而两种模式对"这一行算不算标题"看法不同。
    #[test]
    fn 切换严格模式会重算标题() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        s.sync(id, "#标签\n".to_owned()).unwrap();
        // 默认宽松：`#标签` 算标题。
        assert_eq!(s.get(id).unwrap().title, "标签");

        // ⚠️ 先把 dirty 记下来：切换本身**不该动**它——用户改的是设置，不是正文。
        // （上面那句 `sync` 已经把文档弄脏了，所以不能直接断言 `!dirty`。）
        let dirty = s.get(id).unwrap().dirty;

        s.set_strict_markdown(STRICT);
        assert_eq!(s.get(id).unwrap().title, "未命名 1", "严格之后这行不是标题了");

        s.set_strict_markdown(LAX);
        assert_eq!(s.get(id).unwrap().title, "标签", "改回来要跟着回来");

        assert_eq!(
            s.get(id).unwrap().dirty,
            dirty,
            "重算标题不该顺手把文档标成已修改"
        );
    }

    #[test]
    fn 同步相同内容不动_revision() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        let r0 = s.get(id).unwrap().revision;
        assert_eq!(s.sync(id, String::new()).unwrap(), r0);
        let r1 = s.sync(id, "变了".to_owned()).unwrap();
        assert_eq!(r1, r0 + 1);
        assert!(s.get(id).unwrap().dirty);
    }

    #[test]
    fn 同一路径只打开一份() {
        let dir = std::env::temp_dir().join("nota-docstore-dedupe");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.md");
        std::fs::write(&path, "# A\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let a = s.open(&path).unwrap();
        let b = s.open(&path).unwrap();
        assert_eq!(a, b);
        assert_eq!(s.list().len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 存盘后_dirty_归零且另外存能改路径() {
        let dir = std::env::temp_dir().join("nota-docstore-save");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        s.sync(id, "# 你好\n".to_owned()).unwrap();
        assert!(s.has_unsaved());

        let target = dir.join("out.md");
        s.save(id, Some(target.clone())).unwrap();
        assert!(!s.has_unsaved());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "# 你好\n");
        assert_eq!(s.get(id).unwrap().path.as_deref(), Some(target.as_path()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 挪过之后：盘上的文件换了名字、文档记着的路径跟着换、**没保存的改动照旧挂着**。
    ///
    /// ⚠️ 最后那一条是这一格里最容易做错的地方：挪的是**文件**，不是内容。
    /// 顺手把 `dirty` 清掉（"都挪过去了嘛"）等于让用户丢掉刚打的那几段——
    /// 而且不报错，只是下一次关窗口时不问他了。
    #[test]
    fn 挪过之后路径与标题跟着换而改动不动() {
        let dir = std::env::temp_dir().join("nota-docstore-move");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let 老 = dir.join("老名字.md");
        std::fs::write(&老, "盘上的旧内容\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&老).unwrap();
        // 用户改了但**还没存**——挪完这两段字必须还在
        s.sync(id, "盘上的旧内容\n\n新写的一段\n".to_owned()).unwrap();
        let 挪前版本 = s.get(id).unwrap().revision;
        assert!(s.get(id).unwrap().dirty);

        let 新 = dir.join("新名字.md");
        let 落点 = s.移到(id, 新.clone()).unwrap();

        assert_eq!(落点, 新);
        assert!(!老.exists(), "盘上那份要跟着改名");
        assert_eq!(
            std::fs::read_to_string(&新).unwrap(),
            "盘上的旧内容\n",
            "盘上留的是**上一次存过的**内容，未保存的改动还在内存里"
        );
        let doc = s.get(id).unwrap();
        assert_eq!(doc.path.as_deref(), Some(新.as_path()));
        assert_eq!(doc.title, "新名字", "标题取自文件名，改了名就该换");
        assert!(doc.dirty, "未保存的改动不许被这一次挪动抹掉");
        assert_eq!(doc.text, "盘上的旧内容\n\n新写的一段\n");
        assert!(doc.revision > 挪前版本, "路径变了也是一次该让插件知道的变化");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ⚠️ 挪失败（目标被占）时**文档的路径一个字节都不许变**——
    /// 否则这份文档就指向一个不存在的路径，下次存盘会**在旧名字旁边
    /// 凭空写出一份新的**，而用户以为文件挪走了。
    #[test]
    fn 挪失败时文档还指着老路径() {
        let dir = std::env::temp_dir().join("nota-docstore-move-fail");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let 老 = dir.join("甲.md");
        std::fs::write(&老, "甲的正文\n").unwrap();
        let 占了 = dir.join("乙.md");
        std::fs::write(&占了, "乙的正文\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&老).unwrap();
        let 挪前版本 = s.get(id).unwrap().revision;

        assert!(s.移到(id, 占了.clone()).is_err());

        let doc = s.get(id).unwrap();
        assert_eq!(doc.path.as_deref(), Some(老.as_path()));
        assert_eq!(doc.title, "甲");
        assert_eq!(doc.revision, 挪前版本, "没挪成就什么都没变");
        assert_eq!(std::fs::read_to_string(&占了).unwrap(), "乙的正文\n");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 还没存过盘的新文档没有文件可挪——如实报错，**不许顺手替它存一份**。
    #[test]
    fn 没存过盘的文档挪不了() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        let 到 = std::env::temp_dir().join("nota-不该出现的.md");
        let 错 = s.移到(id, 到.clone()).unwrap_err().to_string();

        assert!(错.contains("保存为"), "要告诉用户下一步该干什么：{错}");
        assert!(!到.exists(), "不许在用户没选过的地方留下一份文件");
    }

    #[test]
    fn 没路径又没另存要报错() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        assert!(s.save(id, None).is_err());
    }

    /// BUG-9：四十二个生产调用点都传字面量 0，于是未命名文档一打字就叫「未命名 0」，
    /// 开两份就重名。序号必须**存在文档上**，不能现算。
    #[test]
    fn 未命名序号不会被打字抹掉() {
        let mut s = DocumentStore::new(LAX);
        let a = s.create_untitled();
        let b = s.create_untitled();
        assert_eq!(s.get(a).unwrap().title, "未命名 1");
        assert_eq!(s.get(b).unwrap().title, "未命名 2");

        // 打一行**不含标题**的正文——`derive_title` 会走"未命名 N"那个回退分支。
        s.sync(a, "只是正文".to_owned()).unwrap();
        s.sync(b, "另一份正文".to_owned()).unwrap();
        assert_eq!(s.get(a).unwrap().title, "未命名 1");
        assert_eq!(s.get(b).unwrap().title, "未命名 2");
    }

    /// BUG-12：编辑器装载文件时会做一次规范化，那不是用户改动。
    #[test]
    fn 装载时的规范化不算用户改动() {
        let dir = std::env::temp_dir().join("nota-docstore-settle");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.md");
        std::fs::write(&path, "# A\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&path).unwrap();
        assert!(!s.get(id).unwrap().dirty, "刚打开不该脏");

        // 编辑器序列化回来多了一个尾段——正是 BUG-12 那个规范化。
        s.sync(id, "# A\n\n".to_owned()).unwrap();
        assert!(s.get(id).unwrap().dirty, "规范化确实让它与磁盘不同了");

        // 前端装载完喊一嗓子：这份是编辑器给的，不是用户打的。
        s.settle(id, "# A\n\n".to_owned()).unwrap();
        assert!(!s.get(id).unwrap().dirty, "settle 之后不该脏");

        // 再打字还是要脏——settle 不能把真改动一起吞了。
        s.sync(id, "# A\n\n新写的".to_owned()).unwrap();
        assert!(s.get(id).unwrap().dirty);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 未命名文档：空的不脏，打了字就脏（它的"干净那份"是空串）。
    #[test]
    fn 未命名文档空的不脏() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        assert!(!s.get(id).unwrap().dirty);
        s.sync(id, "".to_owned()).unwrap();
        assert!(!s.get(id).unwrap().dirty, "推空串不该变脏");
        s.sync(id, "有东西了".to_owned()).unwrap();
        assert!(s.get(id).unwrap().dirty);
        // 存盘之后又干净了，且磁盘上那份成了新的基准
        let path = std::env::temp_dir().join("nota-docstore-untitled-clean.md");
        s.save(id, Some(path.clone())).unwrap();
        assert!(!s.get(id).unwrap().dirty);
        s.sync(id, "有东西了".to_owned()).unwrap();
        assert!(!s.get(id).unwrap().dirty, "推回一模一样的内容不该变脏");
        let _ = std::fs::remove_file(&path);
    }
}
