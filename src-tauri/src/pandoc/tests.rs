//! `pandoc.rs` 的用例（2026-10-10 从那一份里搬出来：加完"文档主题 ＋ 额外参数"
//! 那一批之后它 1024 行，过了 `docs/09` §4 那条 1000 行的硬线）。
//!
//! ⚠️ **只搬行数，一个断言都没改**：`use super::*;` 照旧，所以那份文件里私有的
//! `build_args` / `export_with` / `分词` / `主题_css文件` 在这里照样看得见。
//! 这套拆法与本仓既有的 `lua/api/http/tests.rs` / `image/tests.rs` 一模一样
//! （主文件那一侧留一句 `#[cfg(test)] mod tests;`）。

use super::*;

/// 一个自己的临时目录（带用例名和进程号，并行跑的用例各用各的）。
fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nota-pandoc-test-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("建临时目录");
    dir
}

/// 造一条假的 `pandoc`：**写成脚本文件**，不是拼一行命令。
///
/// ⚠️ 试过"拼一行"（`printf 1.2.3` 当假 CLI、`sh -c '…'` 当假导出器），
/// 两回都不行：`split_command` **按空白分词、不认引号**（见 `proc.rs`），
/// 而 `printf` 会把第一个参数当格式串吃掉。脚本没有这些问题，也更像
/// 用户真正会配的那种包装脚本。
#[cfg(unix)]
fn 假命令(tag: &str, 正文: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = temp_dir(tag).join("假pandoc");
    std::fs::write(&path, format!("#!/bin/sh\n{正文}\n")).unwrap();
    // ⚠️ 必须带可执行位：不带的话 `spawn` 报的是 PermissionDenied，
    // 那会走成"起来了但失败"这一档，把要测的那条路整个绕过去。
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path
}

// ── 命令行 ────────────────────────────────────────────────────────────

#[test]
fn 参数里有标准输入之外的输入路径信息() {
    let args = build_args(
        &[],
        Format::Docx,
        Path::new("/tmp/出.docx"),
        Some(Path::new("/home/u/文档")),
        None,
        &[],
        None,
    );
    assert!(args.contains(&"--from=markdown".to_string()));
    assert!(args.contains(&"--to=docx".to_string()));
    assert!(args.contains(&"--standalone".to_string()));
    assert!(args.contains(&"--resource-path=/home/u/文档".to_string()));
    // 正文走标准输入，所以**不许**出现输入文件参数（出现了就会和 stdin 打架）。
    assert!(!args.iter().any(|a| a.ends_with(".md")), "{args:?}");
    assert_eq!(args.last().unwrap(), "/tmp/出.docx");
}

#[test]
fn 导入参数把原文件交给_pandoc_并输出_markdown() {
    let args = build_import_args(
        &["--sandbox".to_string()],
        ImportFormat::Docx,
        Path::new("/home/u/源文件.docx"),
    );
    assert_eq!(args[0], "--sandbox");
    assert!(args.contains(&"--from=docx".to_string()), "{args:?}");
    assert!(args.contains(&"--to=markdown".to_string()), "{args:?}");
    assert!(args.contains(&"--wrap=none".to_string()), "{args:?}");
    assert!(args.contains(&"--markdown-headings=atx".to_string()), "{args:?}");
    assert_eq!(args.last().unwrap(), "/home/u/源文件.docx");
}

#[test]
#[cfg(unix)]
fn 导入把_pandoc_的标准输出原样作为正文() {
    let dir = temp_dir("import-stdout");
    let source = dir.join("输入.docx");
    std::fs::write(&source, b"not a real docx").unwrap();
    let fake = 假命令(
        "import-bin",
        "printf '# 导入标题\\n\\n正文 🎉\\n'; printf 'WARNING: 图片没找到\\n' >&2",
    );
    let out = import_with(&fake.display().to_string(), ImportFormat::Docx, &source)
        .expect("假 pandoc 成功时应当返回正文");
    assert_eq!(out.markdown, "# 导入标题\n\n正文 🎉\n");
    assert!(out.warnings.contains("图片没找到"), "{}", out.warnings);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 排版引擎只给_pdf_而且只在找到时给() {
    let pdf = build_args(
        &[],
        Format::Pdf,
        Path::new("/tmp/a.pdf"),
        None,
        Some("xelatex"),
        &[],
        None,
    );
    assert!(pdf.contains(&"--pdf-engine=xelatex".to_string()), "{pdf:?}");

    // 没找到引擎就不给这个参数：pandoc 会用它自己的默认（pdflatex），
    // 由它去报"没有 pdflatex"——那句报错比我们编的准。
    let 没引擎 = build_args(&[], Format::Pdf, Path::new("/tmp/a.pdf"), None, None, &[], None);
    assert!(!没引擎.iter().any(|a| a.starts_with("--pdf-engine")));

    // docx 就算探测到了引擎也不给。
    let docx = build_args(
        &[],
        Format::Docx,
        Path::new("/tmp/a.docx"),
        None,
        Some("xelatex"),
        &[],
        None,
    );
    assert!(!docx.iter().any(|a| a.starts_with("--pdf-engine")), "{docx:?}");
}

#[test]
fn 前缀命令的参数排在前面() {
    // `NOTA_PANDOC_CMD="pandoc --sandbox"` 这类用法：用户给的参数不能被丢掉。
    let args = build_args(
        &["--sandbox".to_string()],
        Format::Odt,
        Path::new("/tmp/a.odt"),
        None,
        None,
        &[],
        None,
    );
    assert_eq!(args[0], "--sandbox");
    assert_eq!(args[1], "--from=markdown");
}

#[test]
fn 额外参数排在自家参数前面() {
    // 用户 2026-10-10 要的那一格（`[export] pandoc_args`，参考 Markra 的
    // `pandocArgs`）。位置是**有讲究的**：它写的是"额外"的东西，而
    // `--from` / `--to` / `-o` 是**这一趟的性质**（导出格式说了算），
    // 不该被一格设置顶掉——顶掉了的症状是"我选了 Word、导出来是个 epub"。
    let args = build_args(
        &[],
        Format::Docx,
        Path::new("/tmp/出.docx"),
        None,
        None,
        &["--reference-doc=我的模板.docx".to_string()],
        None,
    );
    let 额外 = args
        .iter()
        .position(|a| a.starts_with("--reference-doc="))
        .unwrap();
    let 自家 = args.iter().position(|a| a == "--from=markdown").unwrap();
    assert!(额外 < 自家, "额外参数应当排在 `--from` 前面：{args:?}");
    // 而它**真的在里面**（不是被丢掉的那种"收下了但没用"）。
    assert!(args.contains(&"--reference-doc=我的模板.docx".to_string()));
}

#[test]
fn 额外参数认引号不按空白切() {
    // ⚠️ 按空白切（`split_whitespace`）会把 `title="我的 书"` 切成两半——
    // **不报错**，只是标题变成半个。所以这一格必须走 `shlex`。
    let 分 = 分词(r#"--metadata title="我的 书" --toc"#).expect("引号配对");
    assert_eq!(
        分,
        vec![
            "--metadata".to_string(),
            // ⚠️ `shlex` 剥掉的是**引号本身**，`title=` 那一半留着——
            // pandoc 要的正是这种形状（`title=我的 书` 是一个参数，
            // 空格在值里）。按空白切会切在这中间，那才是要挡的那种错。
            "title=我的 书".to_string(),
            "--toc".to_string()
        ]
    );
    // 空的（没写过这一格）→ 一个参数都不给。
    assert!(分词("").unwrap().is_empty());
    assert!(分词("   \n ").unwrap().is_empty());
    // ⚠️ 引号没配对：**当场报**，别把一条半截命令喂给 pandoc。
    let err = 分词(r#"--metadata title="我的 书"#).unwrap_err();
    assert!(err.to_string().contains("引号没配对"), "{err}");
}

#[test]
fn 主题_css_只给吃得下的格式() {
    let css = Path::new("/tmp/主题.css");
    let epub = build_args(
        &[],
        Format::Epub,
        Path::new("/tmp/a.epub"),
        None,
        None,
        &[],
        Some(css),
    );
    assert!(
        epub.contains(&"--css=/tmp/主题.css".to_string()),
        "epub 是唯一认 CSS 的那种，必须给：{epub:?}"
    );

    // ⚠️ 另外几种**一定不能给**：pandoc 只会打一句"这个参数没用"的警告，
    // 而 docx / latex / odt / rtf / opml 的排版都不吃 CSS（理由见 `能带_css`）。
    for (格式, 落点) in [
        (Format::Docx, "/tmp/a.docx"),
        (Format::Pdf, "/tmp/a.pdf"),
        (Format::Latex, "/tmp/a.tex"),
        (Format::Odt, "/tmp/a.odt"),
        (Format::Rtf, "/tmp/a.rtf"),
        (Format::Opml, "/tmp/a.opml"),
    ] {
        let args = build_args(&[], 格式, Path::new(落点), None, None, &[], Some(css));
        assert!(
            !args.iter().any(|a| a.starts_with("--css=")),
            "{} 吃不下 CSS，不该拿到 --css：{args:?}",
            格式.名字()
        );
    }
}

#[test]
fn 空主题或吃不下时不落临时文件() {
    assert!(主题_css文件("", Format::Epub).unwrap().is_none(), "没有主题就不带");
    assert!(
        主题_css文件("   \n", Format::Epub).unwrap().is_none(),
        "全是空白也一样"
    );
    assert!(
        主题_css文件("h1 { color: red }", Format::Docx)
            .unwrap()
            .is_none(),
        "docx 吃不下 CSS，连文件都不该落"
    );
}

#[test]
#[cfg(unix)]
fn 主题_css_真送到_pandoc_手上而且用完就删() {
    // ⚠️ 这条是端到端的：假的 pandoc 把 `--css=` 指的那份文件**抄到落点**，
    // 于是我们能看到"pandoc 在那一刻真的读得到这几行 CSS"——而不是只看
    // 命令行里有没有那个参数（参数写对了、路径却是错的，那种错只在这条路上
    // 现形：pandoc 会报"找不到那个 css"）。
    let dir = temp_dir("css");
    let target = dir.join("抄到的.css");
    let 落点 = dir.join("出.epub");
    let 假pandoc = 假命令(
        "css-bin",
        &format!(
            // ① 把 `--css=` 指的那份文件抄到 `{}`（这就是"pandoc 那一刻读到了
            // 什么"）；② 收掉正文；③ **落点也得建出来**——`export_with` 会检查
            // "退出码 0 但文件没生成"那一档，不建的话这条用例会走成失败。
            "for a in \"$@\"; do case \"$a\" in --css=*) cp \"${{a#--css=}}\" {} ;; esac; done; \
             cat > /dev/null; : > {}",
            target.display(),
            落点.display()
        ),
    );
    let 捎带 = 捎带的东西 {
        theme_css: "h1 { color: #123456 }\n".to_string(),
        pandoc_args: String::new(),
    };
    export_with(
        &假pandoc.display().to_string(),
        Format::Epub,
        "正文",
        &落点,
        None,
        None,
        &捎带,
    )
    .expect("应该成功");
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "h1 { color: #123456 }\n",
        "pandoc 那一刻读到的那份文件，应当就是我们写的那几行"
    );
    // 收工之后**临时文件不留**（`临时CSS` 的 `Drop` 管着这件事）。
    // ⚠️ 别的用例可能同时在跑（同一个进程、同一个临时目录），所以按**内容**
    // 判我们这一份没了，而不是按文件名（文件名里有进程号与纳秒）。
    for 项 in std::fs::read_dir(std::env::temp_dir()).unwrap().flatten() {
        let 名 = 项.file_name().to_string_lossy().to_string();
        if !(名.starts_with("nota-导出主题-") && 名.ends_with(".css")) {
            continue;
        }
        let 内容 = std::fs::read_to_string(项.path()).unwrap_or_default();
        assert_ne!(内容, "h1 { color: #123456 }\n", "临时 CSS 用完就该删掉：{名}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

// ── 探测 ──────────────────────────────────────────────────────────────

#[test]
fn 没装时报的是没装而不是别的() {
    let out = probe_with("nota-绝对没有这个命令");
    assert_eq!(out.state, ProbeState::Missing);
    assert!(out.message.contains("没找到"), "{}", out.message);
    // 面板上要能直接照着装——报错里必须有点能照做的东西。
    assert!(out.detail.contains("install pandoc"), "{}", out.detail);
    assert!(out.version.is_none());
}

#[test]
#[cfg(unix)]
fn 问到版本就是能用() {
    // ⚠️ 真起进程，不用 mock——探测的全部风险就在"真程序在真系统上怎么反应"。
    let 假 = 假命令("version", "echo pandoc 3.1.11");
    let out = probe_with(&假.display().to_string());
    assert_eq!(out.state, ProbeState::Ready, "{}", out.detail);
    assert_eq!(out.version.as_deref(), Some("pandoc 3.1.11"));
    assert!(out.message.contains("pandoc 3.1.11"), "{}", out.message);
}

#[test]
#[cfg(unix)]
fn 挂住的命令判不确实而不是判没装() {
    // ⚠️ 自定义命令挂住时**不许**说"没装"：用户明明装了一个，正是他自己
    // 配的那条命令有问题，说成"没找到"会把他引到完全错的方向去。
    let 假 = 假命令("hang", "sleep 30");
    let out = probe_with(&假.display().to_string());
    assert_eq!(out.state, ProbeState::Unknown);
    assert!(out.message.contains("没回来"), "{}", out.message);
}

#[test]
#[cfg(unix)]
fn 认不出版本旗子也算不确实() {
    // `false` 起来了、退出了、退出码非 0 —— 既不是"没装"也不是"能用"。
    let out = probe_with("false");
    assert_eq!(out.state, ProbeState::Unknown);
    assert!(out.message.contains("没问出版本号"), "{}", out.message);
}

#[test]
fn 空命令不崩() {
    let out = probe_with("   ");
    assert_eq!(out.state, ProbeState::Unknown);
    assert!(out.message.contains(ENV_CMD), "{}", out.message);
}

// ── 找引擎 ────────────────────────────────────────────────────────────

#[test]
#[cfg(unix)]
fn 引擎按偏好顺序找而不是碰到谁算谁() {
    use std::os::unix::fs::PermissionsExt;
    let dir = temp_dir("engine");
    // ⚠️ 故意让"偏好靠后"的那个先按字母序出现：如果实现是"遍历目录里有什么"
    // 而不是"按 ENGINES 的顺序找"，这里就会拿到 pdflatex。
    for name in ["pdflatex", "xelatex"] {
        let p = dir.join(name);
        std::fs::write(&p, b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let path = OsString::from(dir.display().to_string());
    assert_eq!(find_in_path(ENGINES, &path).as_deref(), Some("xelatex"));

    // 目录里有个**不可执行**的同名文件时不算数（PATH 里这种空壳文件真的有）。
    let 空壳 = temp_dir("engine-noexec");
    std::fs::write(空壳.join("xelatex"), b"").unwrap();
    let path = OsString::from(空壳.display().to_string());
    assert_eq!(find_in_path(ENGINES, &path), None);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&空壳);
}

#[test]
fn 空_path_里什么都没有() {
    assert_eq!(find_in_path(ENGINES, &OsString::from("")), None);
}

// ── 语言环境 ──────────────────────────────────────────────────────────

#[test]
fn 认得出哪些语言环境是_utf8() {
    assert!(是utf8("C.UTF-8"));
    assert!(是utf8("zh_CN.UTF-8"));
    // ⚠️ 大小写和不带横杠的写法都真的存在（`en_US.utf8` 是 Debian 那套）。
    assert!(是utf8("en_US.utf8"));
    assert!(!是utf8("C"));
    assert!(!是utf8("POSIX"));
    assert!(!是utf8("en_US.ISO-8859-1"));
}

// ── 导出 ──────────────────────────────────────────────────────────────

#[test]
fn 成功时只挑警告行而且有条数上限() {
    let 杂 = "一句杂音\n[WARNING] 第 1 条\n[WARNING] 第 2 条\n[WARNING] 第 3 条\n[WARNING] 第 4 条\n";
    let s = 成功时的警告(杂);
    assert!(s.contains("第 1 条"), "{s}");
    assert!(!s.contains("一句杂音"), "杂音不该进提示语：{s}");
    assert!(!s.contains("第 4 条"), "超过上限的不列：{s}");
    assert!(s.contains("另有 1 条"), "少了要如实说还差几条：{s}");
    // 一条都没有 = 空串，调用方拿它当"没话说"。
    assert_eq!(成功时的警告("啥也没有\n"), "");
}

#[test]
#[cfg(unix)]
fn 成功但报了警告也要带出来() {
    // ⚠️ 这条钉的是"退出码 0 也要看 stderr"：pandoc 把**没做成的事**报成
    // WARNING，不看的话就是静默丢图（见 `成功时的警告`）。
    let dir = temp_dir("warn");
    let target = dir.join("出.docx");
    let 假pandoc = 假命令(
        "warn-bin",
        &format!(
            "echo '[WARNING] Could not fetch resource 点.png' >&2; cat > {}",
            target.display()
        ),
    );
    let 警告 = export_with(
        &假pandoc.display().to_string(),
        Format::Docx,
        "正文",
        &target,
        None,
        None,
        &捎带的东西::default(),
    )
    .expect("应该成功");
    assert!(警告.contains("点.png"), "{警告}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn 导出把正文从标准输入喂进去() {
    // 假 pandoc 把标准输入原样写到落点（真实 pandoc 是拿 `-o` 那个参数，
    // 这里没必要跟着写一份参数解析）。这条钉的是"正文没落成临时文件"这条
    // 设计——见 `export_to` 的注释：落成文件就得在"写用户目录"和"图片裂图"
    // 之间二选一。
    let dir = temp_dir("stdin");
    let target = dir.join("out.md");
    let 假pandoc = 假命令("stdin-bin", &format!("cat > {}", target.display()));
    export_with(
        &假pandoc.display().to_string(),
        Format::Docx,
        "# 标题\n正文 🎉\n",
        &target,
        None,
        None,
        &捎带的东西::default(),
    )
    .expect("应该成功");
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "# 标题\n正文 🎉\n"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn 相对路径的图片按文档目录找() {
    // ⚠️ 这条钉的是 `cwd` 那一手：`--resource-path` 是 pandoc 的接口，
    // 而 `cwd` 才是"正文里 `![](./img.png)` 相对谁"的答案。少了它，
    // 一份带图的文档导出来会集体裂图，而那种失败**不会报错**。
    let dir = temp_dir("cwd");
    let target = dir.join("out.md");
    // 假的 pandoc 报告自己"现在在哪个目录"——真实场景里它就是靠这个找图的。
    let 假pandoc = 假命令("cwd-bin", &format!("pwd > {}; cat > /dev/null", target.display()));
    export_with(
        &假pandoc.display().to_string(),
        Format::Docx,
        "![](./img.png)",
        &target,
        Some(&dir),
        None,
        &捎带的东西::default(),
    )
    .expect("应该成功");
    let 报的目录 = std::fs::read_to_string(&target).unwrap();
    // macOS 的 /tmp 是指向 /private/tmp 的软链接，两边都认。
    assert!(
        报的目录.trim().ends_with(&dir.file_name().unwrap().to_string_lossy().to_string()),
        "跑在 {报的目录:?}，应该是 {dir:?}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn 退出码零但没生成文件也算失败() {
    // ⚠️ 这是最坏的一种"假成功"：告诉用户导好了，而磁盘上什么都没有。
    let dir = temp_dir("nofile");
    let target = dir.join("不存在.pdf");
    let err =
        export_with("true", Format::Pdf, "正文", &target, None, None, &捎带的东西::default())
            .unwrap_err();
    assert!(err.to_string().contains("没有生成"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn 失败时把_pandoc_自己的报错端出来() {
    let dir = temp_dir("fail");
    let target = dir.join("出.docx");
    let 假pandoc = 假命令("fail-bin", "echo 第 3 行有个表格看不懂 >&2; exit 4");
    let err = export_with(
        &假pandoc.display().to_string(),
        Format::Docx,
        "正文",
        &target,
        None,
        None,
        &捎带的东西::default(),
    )
    .unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("表格看不懂"), "{msg}");
    assert!(msg.contains("Word 文档"), "报错里要点名是哪一种格式：{msg}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn 没装时导出报的是没装() {
    let dir = temp_dir("nomissing");
    let target = dir.join("出.docx");
    let err = export_with(
        "nota-绝对没有这个命令",
        Format::Docx,
        "正文",
        &target,
        None,
        None,
        &捎带的东西::default(),
    )
    .unwrap_err();
    assert!(err.to_string().contains("没找到"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

// ── 「到底跑哪一份 pandoc」（2026-10-10 加）────────────────────────────

#[test]
fn 解析_写死的路径与_path_里的名字都一个字不改() {
    // ① 用户自己写了路径：`解析` 不许替他换成别的（他知道东西在哪）。
    let 写死 = 解析("/opt/pandoc/bin/pandoc").expect("命令不是空的");
    assert_eq!(写死.program, "/opt/pandoc/bin/pandoc");
    assert!(写死.env.is_empty(), "普通路径不该给任何环境垫片");

    // ② PATH 里就有：**交出去的还是那个名字本身**，不是绝对路径。
    //    ⚠️ 这一条是"正常机器上行为与从前完全一样"的判据——落成绝对路径
    //    之后报错里会出现一条用户没写过的路径，那是不必要的惊吓。
    #[cfg(unix)]
    {
        let 在path = 解析("sh").expect("命令不是空的");
        assert_eq!(在path.program, "sh");
        assert_eq!(在path.来源, "PATH");
    }
}

#[test]
fn 解析_空命令给_none_找不到的原样交回去() {
    assert!(解析("   ").is_none(), "空命令该给 None");

    // ③ 哪儿都没有：**原样交回去**（让 spawn 报它自己那句 No such file），
    //    而不是我们替它编一句——那句话比任何转述都准。
    let 没有 = 解析("nota-绝对没有这个命令").expect("命令不是空的");
    assert_eq!(没有.program, "nota-绝对没有这个命令");
    assert!(没有.env.is_empty());
}

#[test]
fn 解析_参数跟着命令一起搬过去() {
    // `NOTA_PANDOC_CMD="/没有这个/pandoc --sandbox"`：参数一个不能丢。
    let 落 = 解析("/没有这个/pandoc --sandbox").expect("命令不是空的");
    assert_eq!(落.args, vec!["--sandbox".to_string()]);
}

#[test]
fn 宿主垫片里永远有_path_那条() {
    // ⚠️ `PATH` 那一条**不看环境给不给**：找到了宿主那份 pandoc 之后，它自己
    // 还得去找宿主的排版引擎（`--pdf-engine=xelatex` 那一路）。
    let 垫 = 宿主垫片();
    let path = 垫.iter().find(|(k, _)| k == "PATH").expect("必须有 PATH");
    assert!(path.1.contains("/run/host/usr/bin"), "{}", path.1);
}

#[test]
fn 只有真挂着宿主根时才列宿主那几个目录() {
    // ⚠️ 这条盯的是"候选目录不许无条件假设 `/run/host` 在"：普通机器上多了
    // 两条永远落空的规则不算错，但那说明写的人以为大家都在容器里跑。
    let 有 = 候选目录()
        .iter()
        .any(|c| c.dir.starts_with("/run/host"));
    let 该有 = Path::new("/run/host/usr/bin").is_dir()
        || Path::new("/run/host/usr/local/bin").is_dir();
    assert_eq!(有, 该有);
}

/// ⚠️ 这条**只在"容器里跑、宿主装了 pandoc、而容器自己没装"的机器上真跑**
/// （2026-10-10 用户那台机器正是这样，也是这一条改动的由来）。别的机器上
/// 它安静地让开——写成"无条件断言"就会在普通机器上红。
#[test]
fn 容器里能落到宿主那一份_pandoc_上() {
    let 宿主 = Path::new("/run/host/usr/bin/pandoc");
    if !可执行文件(宿主) || 在_path里("pandoc") {
        return;
    }
    let 落 = 解析("pandoc").expect("命令不是空的");
    assert_eq!(落.program, 宿主.display().to_string());
    assert!(
        落.env.iter().any(|(k, _)| k == "LD_LIBRARY_PATH"),
        "宿主那份要补动态库路径（liblua5.4）"
    );
    assert!(
        落.env.iter().any(|(k, _)| k == "pandoc_datadir"),
        "宿主那份的数据目录是编进二进制的，得靠这个变量指过去"
    );
}
