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
/// 顺序（对齐 Typora 的窗口标题行为）：
/// 1. YAML front matter 里的 `title:`；
/// 2. 第一个 ATX 标题（`# ` ~ `###### `）；
/// 3. 文件名的 stem；
/// 4. "未命名 N"。
pub fn derive_title(text: &str, path: Option<&Path>, untitled_index: u64) -> String {
    if let Some(t) = front_matter_title(text) {
        return t;
    }
    if let Some(h) = first_heading(text) {
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
/// 首行是 `---`，到下一个 `---` 或 `...` 结束（与 Typora / Jekyll 一致）。
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
fn first_heading(text: &str) -> Option<String> {
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
        if let Some(rest) = strip_atx(trimmed) {
            if !rest.is_empty() {
                return Some(rest.to_owned());
            }
        }
    }
    None
}

/// 若这一行是 ATX 标题，返回标题文本（去掉 `#` 与可选的收尾 `#`）。
fn strip_atx(line: &str) -> Option<&str> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];
    // `#foo` 不是标题，`# foo` 才是。
    if !rest.starts_with(' ') && !rest.is_empty() {
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
}

impl DocumentStore {
    pub fn new() -> Self {
        Self::default()
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
            title: derive_title(&text, Some(path), 0),
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
        doc.title = derive_title(&text, Some(&path), idx);
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
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        if doc.text == text {
            return Ok(doc.revision); // 内容没变就别动 revision，插件靠它判新旧
        }
        doc.text = text;
        doc.dirty = doc.text != doc.clean_text;
        doc.revision += 1;
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, doc.path.as_deref(), idx);
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
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;

        if doc.text != text {
            doc.text = text.clone();
            doc.revision += 1;
            let idx = doc.untitled_index;
            doc.title = derive_title(&doc.text, doc.path.as_deref(), idx);
        }

        // ⚠️ **不能早退**。编辑器那次规范化可能已经先走 `sync` 把文本推上来了，
        // 于是走到这里时 `text` 与 `doc.text` 已经相等，可脏标记还立着——
        // 早退就等于这一步白做（这条是被用例逮住的，别改回去）。
        doc.clean_text = text;
        doc.dirty = false;
        Ok(doc.revision)
    }

    /// 落盘。`path_override` 用于「另存为」。
    pub fn save(&mut self, id: DocId, path_override: Option<PathBuf>) -> Result<PathBuf> {
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
        doc.title = derive_title(&doc.text, Some(&path), idx);
        doc.revision += 1;
        Ok(path)
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

    pub fn has_unsaved(&self) -> bool {
        self.docs.iter().any(|d| d.dirty)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 标题优先取_front_matter() {
        let text = "---\ntitle: 我的笔记\n---\n\n# 别的标题\n";
        assert_eq!(derive_title(text, None, 1), "我的笔记");
    }

    #[test]
    fn 没有_front_matter_时取第一个标题() {
        let text = "前言\n\n## 小节标题 ##\n\n正文\n";
        assert_eq!(derive_title(text, None, 1), "小节标题");
    }

    #[test]
    fn 代码块里的井号不算标题() {
        let text = "```sh\n# 这是注释不是标题\n```\n\n# 真标题\n";
        assert_eq!(derive_title(text, None, 1), "真标题");
    }

    #[test]
    fn 井号后没空格不是标题() {
        let text = "#标签 不是标题\n";
        assert_eq!(derive_title(text, None, 7), "未命名 7");
    }

    #[test]
    fn 取不到就回退到文件名或未命名() {
        assert_eq!(
            derive_title("正文而已", Some(Path::new("/tmp/我的文档.md")), 1),
            "我的文档"
        );
        assert_eq!(derive_title("正文而已", None, 3), "未命名 3");
    }

    #[test]
    fn 同步相同内容不动_revision() {
        let mut s = DocumentStore::new();
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

        let mut s = DocumentStore::new();
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

        let mut s = DocumentStore::new();
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

    #[test]
    fn 没路径又没另存要报错() {
        let mut s = DocumentStore::new();
        let id = s.create_untitled();
        assert!(s.save(id, None).is_err());
    }

    /// BUG-9：四十二个生产调用点都传字面量 0，于是未命名文档一打字就叫「未命名 0」，
    /// 开两份就重名。序号必须**存在文档上**，不能现算。
    #[test]
    fn 未命名序号不会被打字抹掉() {
        let mut s = DocumentStore::new();
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

        let mut s = DocumentStore::new();
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
        let mut s = DocumentStore::new();
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
