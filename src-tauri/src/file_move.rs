//! **把一个文件挪到另一个路径**（`docs/10-feature-matrix.md` §2 的
//! 「文件重命名 / 移动」，2026-09-27）。
//!
//! 「重命名」与「移动」在文件系统这一层是**同一件事**（`rename(2)` 两样都干），
//! 所以这里只有一个函数 `移动`。命令层那两个入口（`nota_doc_rename` 收新名字、
//! `nota_doc_move` 收目标目录）各自把目标路径算出来之后都落到这儿——
//! 差别只在"怎么算目标路径"，见 `commands/document.rs` 里那两条。
//!
//! # 三条口径
//!
//! ## 一、**绝不覆盖**
//!
//! ⚠️ `fs::rename` 在目标已存在时**静默覆盖**（POSIX 就是这么定的），
//! 而这里的调用方是"用户敲了个新名字"——敲成另一个已有文件的名字太容易了，
//! 后果是**那份文件没了，而且没有撤销**。所以目标存在一律拒绝（`AlreadyExists`），
//! 让用户换个名字。⚠️ 判据用 `symlink_metadata`（**不是 `Path::exists`**）：
//! 一条指不到东西的坏链接在文件树里是**看得见的**，盖掉它一样是丢东西。
//!
//! ## 二、跨设备要能走
//!
//! ⚠️ 目标与源不在同一个文件系统上时（家目录挪到 U 盘 / 另一个挂载点）
//! `rename` 报 `EXDEV`——这不是"挪不了"，是"要绕着走"：复制到目标目录、
//! 再把源删掉。走这条路的代价写在 `换设备搬` 顶上（**这一步会真的读一遍
//! 再写一遍**，大文件慢、还要有那么多空地方）。
//!
//! ## 三、失败时**不许留下半个东西**
//!
//! 复制那条路的写法是先写一个**临时文件**、成功之后再 `rename` 成目标名，
//! 所以"复制到一半失败"在目标名字上**看不到任何痕迹**（临时文件会被删掉）。
//! ⚠️ 而"已经复制成功、源删不掉"必须**如实报**（那句话里明说"两份都在"）——
//! 那一刻磁盘上真的是两份，装作成功等于让用户过几天自己发现。
//!
//! # 不做的事
//!
//! - **不建目录树之外的目录**：目标的**父目录**不存在时会建（`ensure_dir`），
//!   因为那多半是用户在对话框里新建的一层。**但文件名那一段不猜**。
//! - **不挪目录**（调到这里是文件夹就报错）——重命名一个文件夹牵扯到"里面
//!   开着的文档怎么办"，那是另一件事，今天没有入口。
//! - **不服软链接**：`symlink_metadata` 看的是链接自己。挪一条链接 = 挪走链接
//!   （不是它指的东西），与 `mv` 一致。

use std::path::{Path, PathBuf};

use crate::error::{人话, NotaError, Result};

/// 把文件从 `从` 挪到 `到`。
///
/// ⚠️ `从 == 到`（同一个文件，含"同一个文件的两个写法"）**不是错误**，
/// 是"什么都没发生"——用户把名字原样确认了一遍，那就是不要动它。
/// 判据见 `同一个文件`。
pub fn 移动(从: &Path, 到: &Path) -> Result<()> {
    if 同一个文件(从, 到) {
        return Ok(());
    }

    let 元 = std::fs::symlink_metadata(从).map_err(|e| {
        NotaError::other(format!("「{}」动不了：{}", 从.display(), 人话(&e)))
    })?;
    if 元.is_dir() {
        return Err(NotaError::other(format!(
            "「{}」是一个文件夹，Nota 只挪文件",
            从.display()
        )));
    }

    if 到.symlink_metadata().is_ok() {
        return Err(NotaError::other(format!(
            "「{}」已经在了，换个名字（Nota 不覆盖已有的文件）",
            到.display()
        )));
    }

    if let Some(父) = 到.parent() {
        if !父.as_os_str().is_empty() {
            crate::paths::ensure_dir(父)?;
        }
    }

    match std::fs::rename(从, 到) {
        Ok(()) => Ok(()),
        // ⚠️ 跨设备：不是失败，是要绕着走。见 `换设备搬`。
        Err(e) if 是跨设备(&e) => 换设备搬(从, 到),
        Err(e) => Err(NotaError::other(format!(
            "把「{}」挪到「{}」失败：{}",
            从.display(),
            到.display(),
            人话(&e)
        ))),
    }
}

/// 两个路径指的是不是**同一个文件**。
///
/// ⚠️ 为什么不直接比字符串：路径可以有**很多种写法**指向同一个文件——
/// 相对与绝对（`nota a.md` 那条命令行进来的就是相对路径，而对话框给的是绝对）、
/// 中间夹着 `./`、走过软链接。字面比较漏掉的那些，症状是**把文件挪到自己身上**
/// 却报「已经在了」（用户看着一个明明没重名的文件，界面说名字被占了）。
///
/// ⚠️ 用 `canonicalize` **只为了比较**，绝不拿它的结果去存路径：那会把路径
/// 换成"真实"的那一条（软链接被解开），而用户打开的是哪个名字、存盘就该写回
/// 哪个名字。有一边问不到（不存在 / 没权限）时退回字面比较——那时
/// `移动` 后面会照常报"动不了"，不需要这里替它兜。
fn 同一个文件(甲: &Path, 乙: &Path) -> bool {
    match (std::fs::canonicalize(甲), std::fs::canonicalize(乙)) {
        (Ok(a), Ok(b)) => a == b,
        _ => 甲 == 乙,
    }
}

/// 这个 `io::Error` 是不是"跨文件系统"。
///
/// ⚠️ Rust 1.85 起 `ErrorKind::CrossesDevices` 是稳定的（本仓的
/// `rust-version = "1.85"` 就是它），它把 Linux 的 `EXDEV` 与
/// Windows 的 `ERROR_NOT_SAME_DEVICE` 收在同一个 kind 里——所以这里**不写
/// 裸的错误码 18**（那是 Linux 专有的，Windows 上是 17）。
fn 是跨设备(e: &std::io::Error) -> bool {
    matches!(e.kind(), std::io::ErrorKind::CrossesDevices)
}

/// 跨文件系统的那条路：**复制 + 删源**。
///
/// ⚠️ **代价如实记着**：`rename` 在同一个文件系统上是"改个目录项"（瞬间、不占新地方），
/// 这条路要**把整个文件读一遍再写一遍**——大文件慢、且那一刻磁盘上要放得下两份。
/// 这不是"实现得不好"，是跨设备挪东西的唯一办法。
fn 换设备搬(从: &Path, 到: &Path) -> Result<()> {
    let 临时 = 临时落点(到);

    // ⚠️ `fs::copy` **连权限位一起搬**（它自己的文档写明了这一点），所以这里
    // 不用再补一次 chmod。⚠️ 目标目录必须是**同一个**——临时文件要落在
    // `到` 那一边，跨设备的是最后那一步 `rename`，不是这一步。
    if let Err(e) = std::fs::copy(从, &临时) {
        let _ = std::fs::remove_file(&临时); // 半截的临时文件别留着
        return Err(NotaError::other(format!(
            "把「{}」复制到「{}」失败：{}",
            从.display(),
            到.display(),
            人话(&e)
        )));
    }

    // 复制完了才让它顶着目标名字出现：**那一刻之前，目标名上什么都没有**。
    if let Err(e) = std::fs::rename(&临时, 到) {
        let _ = std::fs::remove_file(&临时);
        return Err(NotaError::other(format!(
            "「{}」已经复制过去了，但改不成名字「{}」：{}",
            从.display(),
            到.display(),
            人话(&e)
        )));
    }

    // ⚠️ **删源放在最后**，而且它失败时**不许装作成功**：那一刻磁盘上是两份，
    // 而用户以为"挪走了"。下一次打开文件树会看见两个同名文件，却想不起来
    // 是哪一步留下的——所以这句话里明说**两份都在**。
    if let Err(e) = std::fs::remove_file(从) {
        return Err(NotaError::other(format!(
            "已经复制到「{}」，但原来那份「{}」删不掉（{}）——**两份都在**，请手动删掉一份",
            到.display(),
            从.display(),
            人话(&e)
        )));
    }
    Ok(())
}

/// 复制途中的临时文件名：**目标目录里的一个隐藏文件**。
///
/// ⚠️ 带进程号是防"同一个文件被挪两次、两个进程同时在跑"（Nota 是单实例，
/// 但重命名命令理论上可以并发两下）；`.nota-挪` 这个尾巴是为了让人一眼看出
/// 它不是用户的文件（万一真被留下来）。
///
/// ⚠️ 中途那一段用的是**有损**的文件名（`to_string_lossy`）：临时名是我们自己
/// 造的，丢几个字节不影响正确性（`到` 那边的名字一个字节都不会变）。
fn 临时落点(到: &Path) -> PathBuf {
    let 名 = 到
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    到.with_file_name(format!(".{名}.nota-挪{}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 每个用例一个自己的空目录。⚠️ 建在 `temp_dir` 下、带进程号与用例名，
    /// 跑完就删——**绝不碰仓库里或用户家目录里的任何东西**。
    struct 沙盒(PathBuf);

    impl 沙盒 {
        fn 新(名: &str) -> Self {
            let 底 = std::env::temp_dir().join(format!(
                "nota-挪-{}-{名}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&底);
            std::fs::create_dir_all(&底).unwrap();
            Self(底)
        }

        fn 路径(&self, 名: &str) -> PathBuf {
            self.0.join(名)
        }

        fn 写(&self, 名: &str, 内容: &str) -> PathBuf {
            let p = self.路径(名);
            std::fs::write(&p, 内容).unwrap();
            p
        }
    }

    impl Drop for 沙盒 {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn 挪过去之后源没了目标在内容一样() {
        let 盒 = 沙盒::新("基本");
        let 从 = 盒.写("旧.md", "正文");
        let 到 = 盒.路径("新.md");

        移动(&从, &到).unwrap();

        assert!(!从.exists(), "源应当没了");
        assert_eq!(std::fs::read_to_string(&到).unwrap(), "正文");
    }

    /// ⚠️ 这条是本模块存在的**主要理由**：`fs::rename` 会**静默覆盖**，
    /// 而"用户敲的新名字正好是另一个已有文件"太容易发生了。
    #[test]
    fn 目标已经在了就拒绝而且一个字节都不动() {
        let 盒 = 沙盒::新("别覆盖");
        let 从 = 盒.写("甲.md", "甲的正文");
        let 到 = 盒.写("乙.md", "乙的正文");

        let 错 = 移动(&从, &到).unwrap_err().to_string();

        assert!(错.contains("已经在了"), "要说清为什么不行：{错}");
        assert_eq!(std::fs::read_to_string(&从).unwrap(), "甲的正文");
        assert_eq!(std::fs::read_to_string(&到).unwrap(), "乙的正文", "目标一个字都不许变");
    }

    /// ⚠️ 「目标已经在了」的判据必须是 `symlink_metadata`：一条**指不到东西**的
    /// 坏链接在文件树里是看得见的，盖掉它一样是丢东西。
    #[test]
    fn 目标是一条坏链接也算已经在了() {
        let 盒 = 沙盒::新("坏链接");
        let 从 = 盒.写("甲.md", "甲的正文");
        let 到 = 盒.路径("坏.md");
        std::os::unix::fs::symlink(盒.路径("压根没有这个"), &到).unwrap();

        移动(&从, &到).unwrap_err();

        assert!(从.exists(), "拒绝之后源要还在");
        assert!(到.symlink_metadata().is_ok(), "那条链接也要还在");
    }

    /// ⚠️ 原样确认一遍名字**不该报错**——否则用户对着一个没重名的文件
    /// 会看到一句「已经在了」。
    #[test]
    fn 目标就是源自己的时候什么都不做() {
        let 盒 = 沙盒::新("没改名");
        let 从 = 盒.写("甲.md", "正文");

        移动(&从, &从).unwrap();
        assert_eq!(std::fs::read_to_string(&从).unwrap(), "正文");
    }

    /// ⚠️ 同一个文件的**另一种写法**也算"没改名"：命令行进来的文档路径是
    /// 相对的（`nota a.md`），而对话框给的是绝对路径——两条路拼出来的目标
    /// 指向同一个文件时，字面比较会漏、于是误报"名字被占了"。
    #[test]
    fn 同一个文件的另一种写法也算没改名() {
        let 盒 = 沙盒::新("别名");
        let 从 = 盒.写("甲.md", "正文");
        let 拐了个弯 = 盒.0.join(".").join("甲.md");

        移动(&从, &拐了个弯).unwrap(); // 不许报"已经在了"
        assert_eq!(std::fs::read_to_string(&从).unwrap(), "正文");
    }

    #[test]
    fn 源不在了会说清是哪一个() {
        let 盒 = 沙盒::新("源没了");
        let 错 = 移动(&盒.路径("没有这个.md"), &盒.路径("新.md"))
            .unwrap_err()
            .to_string();
        assert!(错.contains("没有这个.md"), "错误里要带上是哪个文件：{错}");
    }

    /// ⚠️ 挪目录牵扯到"里面开着的文档怎么办"，今天没有入口——所以这里要**挡住**，
    /// 而不是让 `rename` 把一个文件夹连里面的东西一起搬走。
    #[test]
    fn 文件夹不挪() {
        let 盒 = 沙盒::新("是目录");
        let 从 = 盒.路径("一个目录");
        std::fs::create_dir_all(&从).unwrap();

        let 错 = 移动(&从, &盒.路径("新目录")).unwrap_err().to_string();
        assert!(错.contains("文件夹"), "{错}");
        assert!(从.is_dir(), "挡住之后目录要还在");
    }

    /// 目标那一层目录不存在时要建出来（用户在对话框里新建了一层）。
    #[test]
    fn 目标那一层目录会建出来() {
        let 盒 = 沙盒::新("建目录");
        let 从 = 盒.写("甲.md", "正文");
        let 到 = 盒.路径("子").join("深一层").join("甲.md");

        移动(&从, &到).unwrap();
        assert_eq!(std::fs::read_to_string(&到).unwrap(), "正文");
    }

    // ── 跨设备那条路 ──────────────────────────────────────────────────────
    //
    // ⚠️ 直接调 `换设备搬` 来验它，**不去造一个真文件系统**：这条路的两半
    //（复制 ＋ 删源）与"跨不跨设备"无关，真跨设备只是**怎么走到它**不同。
    // 而"怎么走到它"那一条判据（`是跨设备`）另有用例盯着。

    #[test]
    fn 换设备那条路上内容与权限都跟着走() {
        use std::os::unix::fs::PermissionsExt;

        let 盒 = 沙盒::新("搬");
        let 从 = 盒.写("甲.md", "正文");
        // 一个**非默认**的权限位：能把"权限跟着走了没有"验出来
        //（`fs::copy` 连权限一起搬，这一条钉的就是那个说法）。
        std::fs::set_permissions(&从, std::fs::Permissions::from_mode(0o600)).unwrap();
        let 到 = 盒.路径("新.md");

        换设备搬(&从, &到).unwrap();

        assert_eq!(std::fs::read_to_string(&到).unwrap(), "正文");
        assert!(!从.exists(), "源要删掉（不然那是「复制」不是「挪」）");
        assert_eq!(
            std::fs::metadata(&到).unwrap().permissions().mode() & 0o777,
            0o600
        );
        // ⚠️ 临时文件不许留在那儿——它是隐藏文件，用户不会去看，
        // 于是一留就是一辈子（"文件树里怎么多了一个 .甲.md.nota-挪123"）。
        let 剩下的: Vec<_> = std::fs::read_dir(&盒.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("nota-挪"))
            .collect();
        assert!(剩下的.is_empty(), "临时文件不该留下：{剩下的:?}");
    }

    /// ⚠️ 复制这一半失败时**目标名字上不许出现任何东西**（半个文件比没有更坏：
    /// 它看起来像一份真的）。源不存在正好能摆出这一枪。
    #[test]
    fn 复制失败时目标名字上什么都没有() {
        let 盒 = 沙盒::新("复制失败");
        let 到 = 盒.路径("新.md");

        换设备搬(&盒.路径("没有这个.md"), &到).unwrap_err();

        assert!(到.symlink_metadata().is_err(), "目标名上不许出现东西");
        let 剩下的: Vec<_> = std::fs::read_dir(&盒.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(剩下的.is_empty(), "临时文件也要清掉：{剩下的:?}");
    }

    /// ⚠️ 判据是 `ErrorKind::CrossesDevices`，**不是裸的错误码**：Linux 上是
    /// `EXDEV = 18`、Windows 上是 `ERROR_NOT_SAME_DEVICE = 17`，写死一个数
    /// 就会在另一个平台上**静默走错路**（把跨设备当成"挪失败"报出去）。
    #[test]
    fn 跨设备的判据认的是错误种类不是错误码() {
        // 造一个真的 EXDEV：把一个目录挪进它自己的子目录，Linux 报 EINVAL——
        // 所以这里没法用真文件系统摆出它。改成直接喂一个构造出来的错误：
        let e = std::io::Error::from_raw_os_error(18);
        assert!(是跨设备(&e), "Linux 的 EXDEV(18) 要认出来");
        let 别的 = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "x");
        assert!(!是跨设备(&别的));
    }

    /// 这台机器上真有两个文件系统时，端到端走一遍（`/dev/shm` 通常是 tmpfs，
    /// 与 `temp_dir` 不在同一个设备上）。⚠️ **没有就跳过**——这条用例的价值
    /// 在于"哪天机器上有第二个设备，它自己会跑起来"，而不是强迫每台机器都有。
    #[test]
    fn 真跨设备时端到端也走得通() {
        use std::os::unix::fs::MetadataExt;

        let 盒 = 沙盒::新("真跨设备");
        let 从 = 盒.写("甲.md", "正文");

        let 那边 = PathBuf::from("/dev/shm");
        if !那边.is_dir() {
            eprintln!("跳过：这台机器上没有 /dev/shm");
            return;
        }
        let 同设备 = match (std::fs::metadata(&从), std::fs::metadata(&那边)) {
            (Ok(a), Ok(b)) => a.dev() == b.dev(),
            _ => true,
        };
        if 同设备 {
            eprintln!("跳过：/dev/shm 与临时目录在同一个设备上");
            return;
        }

        let 到 = 那边.join(format!("nota-挪真跨-{}-甲.md", std::process::id()));
        let _ = std::fs::remove_file(&到);
        let 结果 = 移动(&从, &到);
        let 内容 = std::fs::read_to_string(&到).unwrap_or_default();
        let _ = std::fs::remove_file(&到);

        结果.unwrap();
        assert_eq!(内容, "正文");
        assert!(!从.exists());
    }
}
