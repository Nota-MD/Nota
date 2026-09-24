//! 导出与打印那两条命令的 **IO 那半**。
//!
//! ⚠️ **这一层不认识 Markdown，也不认识 HTML**：它只干两件事——"把一段文本
//! 写到某个路径"和"把某个文件交给系统默认程序"。HTML 怎么生成是前端的事
//!（`src/editor/export.ts`：那边才有文档树、文档主题和 `editor.css`）。
//! 把"生成"也搬进来，就等于把渲染引擎在 Rust 里再实现一遍，两边一定会有一天
//! 长得不一样。
//!
//! # 为什么打印是"写个文件交给系统"而不是 `window.print()`
//!
//! WebKitGTK 里 `window.print()` 会弹一个**原生**打印对话框，而它：
//! ① 在容器里点不出来（没有 GTK 打印后端），**验不了**；
//! ② 一旦它不是同步返回，WebView 里那些 `await` 的调用方就悬在半空。
//!
//! 所以这里选的是**看得见、走得到、用户能核对**的那条路：写成一份带样式的
//! HTML → 交给系统默认程序（浏览器）打开 → 在那边按 `Ctrl+P`。
//! ⚠️ 代价如实写在提示语里（`App.tsx` 的 toast）：多一步、附带一个临时文件。
//! **不假装我们在应用里打印。**
//!
//! # 临时文件为什么落在文档自己的目录里
//!
//! 因为正文里的 `![](./img.png)` 是**相对路径**。写进 `$TMPDIR` 之后那些图片
//! 全都加载不出来，而"打印出来图没了"是个很难被当成 bug 报上来的现象
//!（用户多半以为是自己路径写错了）。
//!
//! ⚠️ 这是**对用户目录的一次写入**，所以三条约束：文件名以 `.` 开头（文件管理器
//! 里默认隐藏）、固定一个名字（不堆文件，每次覆盖）、**名字在下面那格注释里
//! 写死并说明来历**。和 Slidev 那个 `.nota-slidev-<id>.md` 入口文件是同一类交易。

use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::paths::path_to_string;

/// 打印临时文件的固定名字。**点号开头** = 在文件管理器里默认隐藏。
///
/// ⚠️ 固定（而不是带时间戳）是**故意的**：带时间戳就会在用户的文档目录里
/// 一次堆一个，而我们没有任何时机去清理它们。覆盖同一个文件则最多留一份。
const PRINT_FILE: &str = ".nota-print.html";

/// 没有文档路径时（新建的、还没存盘的文档）落到系统临时目录里的名字前缀。
const PRINT_FILE_TMP: &str = "nota-print";

/// 把一段文本写到 `path`。**内容是什么不管**——调用方（前端）已经拼好了。
///
/// ⚠️ 一律 UTF-8、一律 `\n`（不做平台换行转换）：导出的是 HTML，规范就是 UTF-8；
/// 而 `\r\n` 混进去只会让"两边文件 diff 一样"这件事变得不可能。
#[tauri::command]
pub fn nota_export_write(path: String, content: String) -> Result<String> {
    let target = PathBuf::from(&path);
    std::fs::write(&target, content.as_bytes()).map_err(|source| NotaError::Write {
        path: target.clone(),
        source,
    })?;
    path_to_string(&target)
}

/// 打印：写成一份 HTML 交给系统默认程序。
///
/// `doc_path` 是**当前文档的路径**（没存过盘就给 `None`）——它的**父目录**
/// 决定了落点，理由见文件头。返回值是写出去的路径，前端拿它给用户看
/// （"文件在哪"是用户唯一能核对的东西）。
#[tauri::command]
pub fn nota_export_print(
    app: AppHandle,
    doc_path: Option<String>,
    title: String,
    content: String,
) -> Result<String> {
    let target = 打印落点(doc_path.as_deref(), &title);
    std::fs::write(&target, content.as_bytes()).map_err(|source| NotaError::Write {
        path: target.clone(),
        source,
    })?;

    // ⚠️ 打不开**不是**致命错误（文件已经写好了），但也**不能咽掉**：
    // 咽掉的话用户看到的是"点了没反应"。转成一句带路径的话交上去。
    let shown = path_to_string(&target)?;
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|e| {
            NotaError::other(format!(
                "打印文件已写到 {shown}，但交给系统打开失败：{e}——请手动打开它再打印"
            ))
        })?;

    Ok(shown)
}

/// 打印文件该写在哪。
///
/// 三条分支，按"能不能让相对路径的图片加载出来"排：
///
/// 1. 文档有路径 → **它所在的目录**（相对图片能解析，这是绝大多数情况）；
/// 2. 文档没路径（新建未存盘）→ 系统临时目录，名字里带上标题便于辨认；
/// 3. 文档路径取不出父目录（理论上不该发生：能存盘的路径一定有父目录）→ 同上。
///
/// ⚠️ **只做"路径分隔符与几个保留字符"这一档清洗，不加别的加工**：
/// 用户把文档标题写成 `a/b` 是可能的（至少在标题来自正文首行时），
/// 而一个斜杠就能让"写文件"变成"写到另一个目录里去"。清洗规则要短到
/// 一眼能读完——长规则的下场是没人敢改它。
fn 打印落点(doc_path: Option<&str>, title: &str) -> PathBuf {
    if let Some(dir) = doc_path.and_then(|p| Path::new(p).parent()) {
        if !dir.as_os_str().is_empty() {
            return dir.join(PRINT_FILE);
        }
    }
    std::env::temp_dir().join(format!("{PRINT_FILE_TMP}-{}.html", 清文件名(title)))
}

/** 把一段文字变成"能当文件名"的样子。空 → `未命名`。 */
fn 清文件名(title: &str) -> String {
    let cleaned: String = title
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect();
    // ⚠️ 两种"洗完之后没有信息了"都要兜住：空串（标题是空白）与**只剩横杠**
    //（标题全是非法字符，一个个都被换成了 `-`）。**不能返回空串**——空串拼出来
    // 的名字是 `.html`，那是个藏起来的文件，用户根本找不到它。
    if cleaned.is_empty() || cleaned.chars().all(|c| c == '-') {
        "未命名".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 打印落点跟着文档目录走() {
        let p = 打印落点(Some("/home/u/docs/笔记.md"), "笔记");
        assert_eq!(p, PathBuf::from("/home/u/docs").join(PRINT_FILE));
    }

    #[test]
    fn 没有文档路径就落到系统临时目录() {
        let p = 打印落点(None, "新建文档");
        assert_eq!(p.parent(), Some(std::env::temp_dir().as_path()));
        // 名字里带着标题——临时目录里的一堆文件，只有这个认得出是谁的。
        assert!(p.to_string_lossy().contains("新建文档"));
    }

    #[test]
    fn 标题里的分隔符会被换掉而不是拼出子目录() {
        let p = 打印落点(None, "a/b:c");
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        assert!(!name.contains('/'), "{name}");
        assert!(name.contains("a-b-c"), "{name}");
    }

    #[test]
    fn 标题洗成空串或只剩横杠时不留下无信息也不留下隐藏文件() {
        // ⚠️ 两种都要兜：空白标题（洗成空串）、全非法字符（洗成一片横杠）。
        // 前者拼出来的名字会是 `.html`（点号开头 = 藏起来的，用户找不到），
        // 后者虽然是个合法文件名，但里面没有任何能认出"这是谁"的信息。
        for 原 in ["", "   ", "///"] {
            let p = 打印落点(None, 原);
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            assert!(name.contains("未命名"), "「{原}」→ {name}");
        }
    }

    #[test]
    fn 写出去的字节与给进来的一模一样() {
        let dir = std::env::temp_dir().join("nota-export-test");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("out.html");
        // ⚠️ 含中文与 emoji：这条用例要钉的正是"没有做任何编码转换"。
        let body = "<p>你好 🎉</p>\n";
        nota_export_write(target.to_string_lossy().to_string(), body.to_string()).unwrap();
        let back = std::fs::read_to_string(&target).unwrap();
        assert_eq!(back, body);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
