//! 导出与打印那几条命令的 **IO 那半**：写文件、交给系统打开、在文件管理器里定位。
//!
//! ⚠️ **这一层不认识 Markdown，也不认识 HTML**：它只干"把一段文本写到某个路径"
//! 和"把某个文件交给系统"这两件。HTML 怎么生成是前端的事
//!（`src/editor/export.ts`：那边才有文档树、文档主题和 `editor.css`）。
//! 把"生成"也搬进来，就等于把渲染引擎在 Rust 里再实现一遍，两边一定会有一天
//! 长得不一样。
//!
//! ⚠️ 借 pandoc 转的那七种格式**不在这里**，在 `commands/pandoc.rs`：
//! 那一路要起外部进程、要探测、PDF 还有第二条路，和这里"写一段文本"不是一回事。
//! 两边共用的只有"文档目录当基准"这条判断（理由见下面打印那一段）。
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
//! **不在应用里假装能打印。**
//!
//! # 临时文件为什么落在文档自己的目录里
//!
//! 因为正文里的 `![](./img.png)` 是**相对路径**。写进 `$TMPDIR` 之后那些图片
//! 全都加载不出来，而"打印出来图没了"是个很难被当成 bug 报上来的现象
//!（用户多半以为是自己路径写错了）。
//!
//! ⚠️ 这是**对用户目录的一次写入**，所以三条约束：文件名以 `.` 开头（文件管理器
//! 里默认隐藏）、固定一个名字（不堆文件，每次覆盖）、**名字在下面那格注释里
//! 写死并说明来历**。和"往用户目录里写一个影子入口文件"是同一类交易：那不算
//! 用户自己写的东西，所以名字要能一眼看出是 Nota 放的、也要能一眼被忽略。

use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::paths::path_to_string;

/// 打印临时文件的固定名字。**点号开头** = 在文件管理器里默认隐藏。
///
/// ⚠️ 固定（而不是带时间戳）是**故意的**：带时间戳就会在用户的文档目录里
/// 一次堆一个，而清理它们的时机并不存在。覆盖同一个文件则最多留一份。
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

/// 把一段 **base64** 解出来的字节写到 `path`。分享图的 PNG 走这条。
///
/// # 为什么要与上面那条分开，而不是让 `write` 接字节
///
/// 因为 IPC 那条路是 **JSON**。`write` 收的是 `String`（导出的是 HTML，本来就
/// 是文本）；二进制如果也走它，要么在前端把字节拼成一个字符串（那会在遇到高位
/// 字节时被 UTF-8 编码成两个字节，写出去的文件就废了），要么传一个几十万长的
/// 数字数组（JSON 里每个数字一个逗号，比 base64 长三倍，而且 Rust 侧还得先收
/// 一个 `Vec<u8>` 再拼）。base64 只长 33%，两端都有现成的编解码器。
///
/// ⚠️ 解不开就**报错，不写半个文件**：`decode` 在 `fs::write` 之前，
/// 所以不存在"写到一半发现数据是坏的"。文件系统上留下一个半截的 PNG
/// 比什么都不留下更糟——用户会以为导出成功了。
///
/// ⚠️ 只认**标准** base64（`+` `/` `=`），不认 URL 安全那种。前端用的是
/// `btoa`（`share-card.ts::转base64`），出来的就是标准那套。
#[tauri::command]
pub fn nota_export_write_bytes(path: String, base64: String) -> Result<String> {
    let 字节 = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| NotaError::other(format!("这段数据不是合法的 base64，写不出去：{e}")))?;

    let target = PathBuf::from(&path);
    std::fs::write(&target, &字节).map_err(|source| NotaError::Write {
        path: target.clone(),
        source,
    })?;
    path_to_string(&target)
}

/// 打印：写成一份 HTML，**然后交给系统去打印**。
///
/// `doc_path` 是**当前文档的路径**（没存过盘就给 `None`）——它的**父目录**
/// 决定了落点，理由见文件头。返回值是写出去的路径，前端拿它给用户看
/// （"文件在哪"是用户唯一能核对的东西）。
///
/// # ⚠️ Windows 上走 **`print` 动词**（2026-10-16）
///
/// 用户朋友报的：「**「打印」功能绑定浏览器而非使用默认打开方式**」。
/// 我们这条路本来就是"交给系统默认程序"，而 Windows 上 `.html` 的默认程序
/// 就是浏览器——于是屏幕上多出一个标签页、还得自己按 `Ctrl+P`。
/// `ShellExecuteW(…, "print", …)` 才是**打印这个动作本身**：系统会找注册了
/// 打印动词的那个程序（浏览器都注册）并**直接把打印对话框叫出来**。
///
/// ⚠️ **动词没注册 / 调用失败时退回"默认程序打开"**（不是报错）：那台机器上
/// 没有打印动词是它自己的配置，"打不开"比"多一个标签页"糟得多。
/// ⚠️ 别的平台**没有等价物**（Linux 的 `xdg-open` 没有 print 动词），
/// 所以那些平台照旧走"交给默认程序"。
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
    if 交给系统打印(&shown) {
        return Ok(shown);
    }
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|e| {
            NotaError::other(format!(
                "打印文件已写到 {shown}，但交给系统打开失败：{e}——请手动打开它再打印"
            ))
        })?;

    Ok(shown)
}

/// 用系统的 **`print` 动词**打印那个文件；办不到给 `false`（调用方退回"打开"）。
///
/// ⚠️ **只有 Windows 有这条路**：`ShellExecuteW` 的第二个参数就是"动词"，
/// 而 Linux 的 `xdg-open` 只认"打开"，macOS 的 `open` 也一样（`open -a` 能指定
/// 程序，但"打印"这个动作没有统一的动词）。
#[cfg(target_os = "windows")]
fn 交给系统打印(路径: &str) -> bool {
    use std::ffi::c_void;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    /// UTF-16 + 结尾的 0（Win32 的宽字符串）。
    fn 宽(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let 动词 = 宽("print");
    let 文件 = 宽(路径);
    // ⚠️ `ShellExecuteW` 的返回值 ≤ 32 是**错误码**（> 32 才是"成功"，
    // 文档里写的是"like a HINSTANCE"）。所以判据是 `> 32`，不是"非零"。
    let 结果 = unsafe {
        ShellExecuteW(
            std::ptr::null_mut::<c_void>() as _,
            动词.as_ptr(),
            文件.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    结果 as isize > 32
}

/// 别的平台上"系统的打印动词"不存在——照旧交给默认程序。
#[cfg(not(target_os = "windows"))]
fn 交给系统打印(_路径: &str) -> bool {
    false
}

/// 在文件管理器里**定位**一个文件（选中它，不是打开它）。
///
/// 导出设置里那条「导出后打开所在目录」用它（`settings/export.rs` 的
/// `open_after_export`，2026-09-25 接上线）。⚠️ 是"定位"不是"打开"：
/// 打开会把 PDF 塞进某个看图程序里，而用户此刻多半是想把文件拖到别处去。
#[tauri::command]
pub fn nota_export_reveal(app: AppHandle, path: String) -> Result<String> {
    let target = PathBuf::from(&path);
    let shown = path_to_string(&target)?;
    app.opener()
        .reveal_item_in_dir(&target)
        .map_err(|e| NotaError::other(format!("在文件管理器里定位 {shown} 失败：{e}")))?;
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

    #[test]
    fn base64_写出来的字节与编码前一模一样() {
        let dir = std::env::temp_dir().join("nota-export-bytes-test");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("out.png");

        // ⚠️ 掺进 PNG 那 8 字节魔数和几个 **高位字节**（`\x89`、`\xff`、`\x00`）：
        // 高位字节正是"前端把字节拼成字符串再传"那条错路会坏掉的地方——
        // 传进来的是 `String`，那些字节会被换成 UTF-8 的两个字节，长度就变了。
        let 原 = [0x89u8, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80];
        let 编码 = base64::engine::general_purpose::STANDARD.encode(原);
        nota_export_write_bytes(target.to_string_lossy().to_string(), 编码).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), 原);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 坏掉的base64报错而且不留下半个文件() {
        let dir = std::env::temp_dir().join("nota-export-bad-b64-test");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("out.png");
        // `!!!!` 不是 base64 的字母表里的东西。
        let r = nota_export_write_bytes(target.to_string_lossy().to_string(), "!!!!".into());
        assert!(r.is_err(), "{r:?}");
        // ⚠️ 这条是**重点**：文件系统上不能留下一个半截的 PNG——那种文件打不开，
        // 而用户看到"文件在"会以为导出成功了。
        assert!(!target.exists(), "解不开的时候不该写出文件");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
