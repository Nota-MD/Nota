//! 「借系统里那个 pandoc 导出」的两条命令。
//!
//! ```text
//! nota_pandoc_probe ──> 面板（装没装）──> nota_pandoc_export ──> 落点由前端选
//!                                              └── PDF 那一路：pandoc 不通就自己印
//! ```
//!
//! ⚠️ 这一层**只有接线**：取参数、把工作丢进阻塞池、把结论包成人话。
//! 真探测在 `pandoc.rs`、真印刷在 `pdf_print.rs`——那两边才有单测，
//! 命令层要真跑就得起一个 Tauri 应用实例，测不出什么。
//!
//! # PDF 为什么"两条都留、pandoc 优先"（用户 2026-09-25 定的）
//!
//! pandoc 那条路**保真**（字体、分页、目录、公式都按排版引擎的规矩来），
//! 但它要求机器上既有 pandoc 又有 LaTeX 引擎——这是两件都要另装的东西。
//! Nota 自带那套（WebKit 打印）**不需要任何外部程序**，代价是排版就是浏览器
//! 那套：分页是浏览器的分页、目录要自己在正文里写。两条都留着，谁用得上用谁。
//!
//! ⚠️ 但**不能让用户猜这次是哪条**：同一份文档两次导出结果不同，那是玄学。
//! 所以返回值里带 `route`，前端必须说出来（见 `PandocExport::note`）。

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::error::{NotaError, Result};
use crate::pandoc::{self, Format, PandocExport, PandocProbe, Route};
use crate::pdf_print;

/// 本机有没有能用的 pandoc —— 「文件 → 导出 → …」点那些格式时先问这一条。
///
/// ⚠️ **异步 + `spawn_blocking`**：它要起一个进程问版本（最长等 10 秒，见
/// `pandoc::CHECK_TIMEOUT`），而 Tauri 的同步命令跑在**主线程**上——在那儿等
/// 就是把界面冻住，而且冻多久完全由用户机器上那条命令决定。
#[tauri::command]
pub async fn nota_pandoc_probe() -> Result<PandocProbe> {
    tauri::async_runtime::spawn_blocking(pandoc::probe)
        .await
        .map_err(|e| NotaError::other(format!("探测 pandoc 装没装失败：{e}")))
}

/// 用 pandoc 导出，`format` 是 `pdf` / `docx` / `rtf` / `epub` / `latex` / `odt` / `opml`。
///
/// - `markdown`：**从编辑器现取的正文**（不是文档那份可能有 300ms 滞后的镜像）。
/// - `target`：落点，由前端的保存对话框选出来。
/// - `doc_path`：当前文档的路径（新建未存盘给 `None`）。只用它的**父目录**——
///   pandoc 拿它当相对路径的基准，理由和打印那边一样（见 `commands/export.rs` 文件头）。
/// - `html`：**只有 PDF 的兜底要用**，是前端拼好的带样式 HTML。不给也能导 PDF，
///   前提是 pandoc 那条路走得通。
///
/// ⚠️ **不给 `target` 兜底**：这里不替用户决定文件名。保存对话框是用户亲手选的，
/// 换一个落点写出去，就是把文件丢在他不知道的地方。
#[tauri::command]
pub async fn nota_pandoc_export(
    app: AppHandle,
    format: String,
    markdown: String,
    target: String,
    doc_path: Option<String>,
    html: Option<String>,
) -> Result<PandocExport> {
    let kind = Format::from_id(&format)
        .ok_or_else(|| NotaError::other(format!("不认识的导出格式：{format}")))?;
    let target = PathBuf::from(&target);
    let doc_dir = 文档目录(doc_path.as_deref());

    // ── 第一条路：pandoc ──────────────────────────────────────────────────
    // ⚠️ 阻塞的活儿（等外部进程，最长 180 秒）丢进阻塞池：命令体本身是异步的，
    // 在里面直接阻塞会把 tokio 的工作线程占住。
    let 落点 = target.clone();
    let 目录 = doc_dir.clone();
    let 正文 = markdown.clone();
    let 结果 = tauri::async_runtime::spawn_blocking(move || {
        pandoc::export_to(kind, &正文, &落点, 目录.as_deref())
    })
    .await
    .map_err(|e| NotaError::other(format!("导出任务没跑起来：{e}")))?;

    match 结果 {
        Ok(警告) => Ok(PandocExport {
            path: target.display().to_string(),
            route: Route::Pandoc,
            note: pandoc_那句(kind, &警告),
        }),
        // ── 第二条路：只有 PDF 有 ──────────────────────────────────────────
        Err(e) if kind == Format::Pdf && pdf_print::available() => {
            let Some(html) = html else {
                // 前端没给 HTML：**如实说**，不要退回"那就别导了"这种含糊话。
                return Err(NotaError::other(format!(
                    "pandoc 没能生成 PDF（{}），而这次没带 Nota 自己排版要用的 HTML，\
                     所以没法改用自带那条路。",
                    一句话(&e)
                )));
            };
            pdf_print::print_html_to_pdf(&app, &html, doc_dir.as_deref(), &target)?;
            Ok(PandocExport {
                path: target.display().to_string(),
                route: Route::Nota,
                // ⚠️ 这些话是**提示条上的纯文本**，不是 Markdown：里面不许出现
                // `**强调**` 那种记号（会原样显示出来）。引程序的 `反引号` 可以，
                // 提示条里一直是这个写法。
                note: format!(
                    "这份 PDF 是 Nota 自己排的版：pandoc 那条路没走通（{}）。\
                     排版是浏览器那套——要目录、要更讲究的分页，装好 pandoc 和一个\
                     排版引擎（xelatex / tectonic 之类）再导一次。",
                    一句话(&e)
                ),
            })
        }
        Err(e) => Err(e),
    }
}

/// pandoc 成了那句。**PDF 里要说清排版引擎是谁**：同一份 Markdown 换个引擎
/// 出来就是两个样子，这是用户唯一能核对的东西。
///
/// ⚠️ `警告` 是 pandoc 在**成功**那一路上报的 `WARNING`（见 `pandoc::成功时的警告`）。
/// 它们是"这份文件少了一点东西"的唯一线索——图没找到就是从这里出来的，
/// 而那种事**不会**让退出码变非零。所以哪怕导"成功"了也要说。
fn pandoc_那句(kind: Format, 警告: &str) -> String {
    let mut s = format!("{} 是系统里那个 pandoc 转的。", kind.名字());
    if kind == Format::Pdf {
        if let Some(engine) = pandoc::find_engine() {
            s.push_str(&format!("排版引擎用的是 `{engine}`。"));
        }
    }
    if !警告.is_empty() {
        // ⚠️ 直说"可能少东西"，别只说"有警告"——用户不知道警告意味着什么。
        // 这条提示语是**纯文本**，不许出现 `**强调**` 那种记号（见下面那条注释）。
        s.push_str(&format!(
            "另外它报了几条警告，这份文件里可能有没进去的东西：\n{警告}"
        ));
    }
    s
}

/// 当前文档所在目录（问不到就给 `None`）。⚠️ 只认**已存盘**文档的目录，
/// 别去猜"大概该放哪儿"——没存盘的文档根本没有"它自己在哪儿"这回事。
fn 文档目录(doc_path: Option<&str>) -> Option<PathBuf> {
    let dir = Path::new(doc_path?).parent()?;
    if dir.as_os_str().is_empty() {
        return None;
    }
    Some(dir.to_path_buf())
}

/// 把可能有好几行的报错压成一句话（提示语里塞一整段 pandoc 输出没人看）。
///
/// ⚠️ 只用来**做摘要**：完整的报错仍然由 `export_to` 那边原样带出去，
/// 一句摘要是给人扫一眼的，不是给人查病因的。
///
/// ⚠️ **要跳过"标题行"**（2026-09-25 开窗点出来的一条）：本仓自己的报错是
/// 「一句结论 + 换行 + 病因原文」那个形状（见 `pandoc.rs::export_with`），
/// 第一行以冒号结尾、真正的病在**第二行**。只取第一行的话，用户看到的是
/// 「pandoc 没能生成 PDF：」——**冒号后面空空如也**，一个字都照做不了。
fn 一句话(e: &NotaError) -> String {
    let text = e.to_string();
    let mut 行 = text.lines().map(str::trim).filter(|l| !l.is_empty());
    let 首行 = 行.next().unwrap_or("");
    // 标题行（以冒号结尾）不算病因，往后找第一行不是标题的。
    let line = if 结尾是冒号(首行) {
        行.find(|l| !结尾是冒号(l)).unwrap_or(首行)
    } else {
        首行
    };
    let 短: String = line.chars().take(120).collect();
    if 短.is_empty() {
        "原因不明".to_string()
    } else {
        短
    }
}

/// 这一行是不是"标题行"——话说了一半、内容在下一行。中文冒号和英文冒号都算
///（pandoc 自己的输出是英文的，本仓的是中文的）。
fn 结尾是冒号(s: &str) -> bool {
    s.ends_with('：') || s.ends_with(':')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 文档目录只认存过盘的文档() {
        assert_eq!(
            文档目录(Some("/home/u/文档/笔记.md")),
            Some(PathBuf::from("/home/u/文档"))
        );
        // 新建未存盘：前端给的就是 None，这里不许去猜（比如猜到 $HOME）。
        assert_eq!(文档目录(None), None);
        // 光秃秃一个文件名（没有目录那一段）等于没给。
        assert_eq!(文档目录(Some("笔记.md")), None);
    }

    #[test]
    fn 摘要只取第一行且不会太长() {
        // 只取第一行：pandoc 的报错往往是"一句结论 + 一屏细节"，把整段塞进
        // 提示语里用户只会把它划过去。
        let e = NotaError::other("第一行是重点\n第二行是细节");
        assert_eq!(一句话(&e), "第一行是重点");

        // 第一行很长时截断（**按字符**截，不按字节——中文按字节截会切出半个字）。
        let 长 = NotaError::other(format!("{}\n后面还有", "啊".repeat(300)));
        let s = 一句话(&长);
        assert_eq!(s.chars().count(), 120);
        assert!(!s.contains('\n'));
    }

    #[test]
    fn 空报错也给得出人话() {
        assert_eq!(一句话(&NotaError::other("\n  \n")), "原因不明");
    }

    #[test]
    fn 摘要跳过只有结论那一行() {
        // ⚠️ 这条是**开窗点出来**的：走兜底那条路时，提示语里出现过
        // 「pandoc 那条路没走通（pandoc 没能生成 PDF：）」——括号里那半句
        // 一个字都没说，因为真正的病因在第二行。
        let e = NotaError::other("pandoc 没能生成PDF：\npdflatex not found. Please select …");
        assert_eq!(一句话(&e), "pdflatex not found. Please select …");

        // 英文冒号也一样（pandoc 自己吐出来的就是英文）。
        let e = NotaError::other("something failed:\nthe real reason");
        assert_eq!(一句话(&e), "the real reason");

        // ⚠️ 全都是标题行时**不能返回空**——退回第一行，总比什么都不说强。
        let e = NotaError::other("只有结论：\n还是结论：");
        assert_eq!(一句话(&e), "只有结论：");
    }
}
