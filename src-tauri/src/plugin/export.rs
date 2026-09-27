//! **导出**：把一个已经装着的插件打回成一个 `.nota-plugin` 包（2026-09-27 加）。
//!
//! 用户 2026-09-27：「完全没有拓展管理面板。做一个。可以**导入，导出和卸载**拓展」。
//! 导入（[`PluginHost::装`]）与卸载（[`PluginHost::卸`]）本来就在，缺的是导出。
//!
//! # 为什么这一半在宿主里，而"打包"那一半不在
//!
//! `package.rs` 的文件头写着「包是只读的」——那句话说的是**作者侧**的打包
//! （`tools/pack-plugin.py`，要拿私钥签名，私钥绝不能进宿主）。这里做的事完全不同：
//! **把用户磁盘上已经躺着的那份插件原样收成一个包**，一个字节都不用签。
//! 两者不冲突：那条"只读"约束管的是**造包**，这条管的是**把已有的收拢**。
//!
//! # 用例：为什么用户要"导出"
//!
//! 1. 从仓库/安装包里带来的**内置插件**（`origin == "builtin"`）卸不掉，但用户
//!    想把它拷出去改一改——导出是唯一的一条路（还能顺带看看官方的插件长什么样）。
//! 2. 用户自己装的插件，改过之后想发给别人、或者想留一份备份再卸载。
//!
//! # ⚠️ 导出的包里**没有**用户的东西
//!
//! 插件的**设置**（`$XDG_CONFIG_HOME/nota/plugin-settings/<id>.toml`，AI 插件的
//! API 密钥就在那儿）与**数据**（`$XDG_DATA_HOME/nota/plugin-data/<id>/`）
//! **都不在插件目录里**，所以它们自然不会被打进去——这不是靠一份排除名单做到的，
//! 是那三个目录本来就分开（`paths.rs`）。改这里的流程时别把这条性质弄丢：
//! 把密钥打进一个要发给别人的包里是**最坏**的一种"顺手"。
//!
//! # ⚠️ 签名：验得过就带上，验不过就**摘掉**
//!
//! 插件目录里可能有作者签过的 `nota-signature.toml`。带不带它有一条硬判据：
//!
//! - **载荷还是签的那一份**（用户没改过文件）→ 把签名文件**原样**放回包里。
//!   别人装的时候还是"已验证/未知签名者"，作者那道防线一点没丢。
//! - **用户改过任何一个字节** → 签名**必须摘掉**。带着一个对不上的签名，
//!   在别人的机器上是 `package.rs` 那张表里的**硬拒**路径
//!   （"有签名但验不过"）——用户好心发出去一个包，收到的人**装不上**，
//!   而且报的是"这个包被改过"，看起来像发的人做了手脚。摘掉之后它就是一个
//!   **未签名**的包，谁都能装，界面上也如实那么写。
//!
//! 摘要算法**不支持**"重新签一遍"（私钥不在这台机器上，见文件头），所以
//! "改过之后还能署名"这件事**做不到**，也不该由宿主替作者做。

use std::io::Write;

use super::*;

/// 导出完了给前端看的一份小结（toast 用）。
#[derive(Debug, Clone, Serialize)]
pub struct 导出报告 {
    /// 哪个插件。
    pub id: String,
    /// 包里**装了几个文件**（不含签名块）。
    pub files: usize,
    /// 这些文件一共多少字节（**未压缩**，也就是"解开之后有多大"）。
    pub bytes: u64,
    /// 包里那个签名块的去向：`kept`（原样带上）/ `dropped`（验不过，摘了）/
    /// `none`（这个插件本来就没签名）。
    pub signature: String,
    /// 实际写到哪儿了。
    pub path: String,
}

impl PluginHost {
    /// 把一个已装的插件导出成一个 `.nota-plugin` 包。
    ///
    /// ⚠️ **目标路径由前端问出来**（保存对话框），宿主不自己弹框——与
    /// [`Self::装`] 那条是同一个分工（"那是界面的事，而且宿主弹框在无头测试里没法验"）。
    ///
    /// ⚠️ `id` 查的是**已装清单**（含停用与加载失败的）：一个插件加载失败
    /// 恰恰是用户最想把它导出来查一查的时候，而它的目录好好地在磁盘上。
    /// 停用的同理（停用只是不跑它的代码，文件一个不少）。
    ///
    /// ⚠️ **先全部在内存里拼好、最后一次性写出**：写到一半失败的话
    /// 用户的目标文件会是个半截的包（而"半截的包"在装的时候报的是
    /// "这不是一个能读的插件包"，看不出跟导出有关）。内存里拼的代价可以接受
    /// ——包的上限是 [`package`] 里那个 32 MiB。
    pub fn 导出(&self, id: &str, 目标: &Path) -> Result<导出报告> {
        let i = self
            .位置(id)
            .ok_or_else(|| NotaError::other(format!("没有这个拓展：{id}")))?;
        let dir = self.plugins[i].manifest.dir.clone();

        // ⚠️ 复用 `从目录` 而不是自己走一遍目录：它与读 zip 那条**共用**
        // `路径合法吗`、同一组上限、同一个摘要算法。自己再写一遍的话，
        // "导出的包装不回来"这种事会以"两边规则哪天不一致"的形式出现。
        let 包 = package::包::从目录(&dir)?;

        // 签名带不带，判据见文件头。
        let (签名去向, 签名原文) = match &包.签名 {
            None => ("none", None),
            Some(_) => {
                // ⚠️ 验签**只看"这份载荷还是不是当初签的那一份"**，不看这把钥匙
                // 在不在本机信任库里：信任是**收包的人**的事，与打包无关
                //（`验签` 的返回值里就有这个区分，这里把 `Ok` 整个当成"载荷没变"）。
                let 原文 = std::fs::read(dir.join(package::签名文件)).ok();
                match (包.验签(&package::信任库::load()), 原文) {
                    (Ok(_), Some(原文)) => ("kept", Some(原文)),
                    // 验不过 → 摘掉（**故意不报错**：导出本身是能成的，
                    // 只是这个包不带签名。理由见文件头那张两行的表）。
                    _ => ("dropped", None),
                }
            }
        };

        let mut 文件数 = 0usize;
        let mut 字节数 = 0u64;
        let mut 缓冲 = std::io::Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut 缓冲);
            let 选项 = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            // ⚠️ `文件们` 在 `从文件们` 里**已经按路径排过序**了，这里不再排：
            // 顺序只影响"人翻包时看到的次序"（摘要自己会排序），而多排一次
            // 就多一处"以哪份为准"的疑问。
            for f in &包.文件们 {
                zw.start_file(f.路径.clone(), 选项)
                    .map_err(|e| NotaError::other(format!("往包里写 `{}` 失败：{e}", f.路径)))?;
                zw.write_all(&f.内容).map_err(|e| {
                    NotaError::other(format!("往包里写 `{}` 的内容失败：{e}", f.路径))
                })?;
                文件数 += 1;
                字节数 += f.内容.len() as u64;
            }
            if let Some(原文) = &签名原文 {
                zw.start_file(package::签名文件, 选项)
                    .map_err(|e| NotaError::other(format!("往包里写签名块失败：{e}")))?;
                zw.write_all(原文)
                    .map_err(|e| NotaError::other(format!("往包里写签名块的内容失败：{e}")))?;
                字节数 += 原文.len() as u64;
            }
            // ⚠️ `finish` 收的是 writer 本身（`Cursor`），不是 `&mut`——那个借用
            // 得在块结束前还回去，所以整个 zip 那一段包在一个块里，`缓冲` 出来之后再读。
            zw.finish()
                .map_err(|e| NotaError::other(format!("收尾包（写中央目录）失败：{e}")))?;
        }

        let 打包好 = 缓冲.into_inner();
        // ⚠️ 目标目录可能不存在（用户在保存框里手打了一个路径）。建出来——
        // "另存为"的框在三个平台上都不保证那一层已经在了。
        if let Some(父) = 目标.parent() {
            if !父.as_os_str().is_empty() {
                crate::paths::ensure_dir(父)?;
            }
        }
        std::fs::write(目标, &打包好).map_err(|source| NotaError::Write {
            path: 目标.to_path_buf(),
            source,
        })?;

        Ok(导出报告 {
            id: id.to_owned(),
            files: 文件数,
            bytes: 字节数,
            signature: 签名去向.to_owned(),
            path: crate::paths::path_to_string(目标)?,
        })
    }

    /// 导出对话框里那个**默认文件名**：`<id>-<版本>.nota-plugin`。
    ///
    /// ⚠️ 用 **id**，不用清单里那个 `name`（2026-09-27 改的，改的原因是开窗
    /// 目检时看到的默认名是 `AI__-0.1.0.nota-plugin`）：
    ///
    /// 1. `name` 是给人看的招牌，**可以是中文**。而 [`crate::paths::安全文件名`]
    ///    只留 ASCII 字母数字和 `.-_`，其余一律变 `_`——「AI 助手」于是成了
    ///    `AI__`：**一个字符的信息都没剩下**，而且「AI 助手」与「AI 插件」
    ///    会撞成同一个默认名（保存框不报错，用户自己覆盖自己）。
    /// 2. 作者侧那个打包器（`tools/pack-plugin.py`）输出的就是
    ///    `<id>-<版本>.nota-plugin`。两边同名，同一个插件由作者打出来的包和
    ///    用户在「拓展」页导出来的包才**对得上号**（比对、留档都靠这个）。
    ///
    /// ⚠️ 名字仍然过 [`crate::paths::安全文件名`]：`id` 虽然形如 `nota.ai`，
    /// 但它也是**作者写的**（`docs/11` 只要求"像个 id"）。拼进路径之前必须归一，
    /// 否则"另存为"的默认值会指到别处去——`paths.rs` 那条安全用例里
    /// `nota/../../etc/passwd` 这种 id 就是这么来的。
    pub fn 导出默认名(&self, id: &str) -> Result<String> {
        let i = self
            .位置(id)
            .ok_or_else(|| NotaError::other(format!("没有这个拓展：{id}")))?;
        let m = &self.plugins[i].manifest.meta;
        Ok(默认包名(id, &m.version))
    }
}

/// 导出的包叫什么名字。⚠️ 两件事都在这儿：**用 id**（见 [`PluginHost::导出默认名`]）
/// 和**过安全文件名**（id 也是作者写的）。单单拆出来是为了能用例钉住——
/// [`PluginHost::导出默认名`] 要一份宿主状态，而这里只是拼一个字符串。
fn 默认包名(id: &str, 版本: &str) -> String {
    format!(
        "{}-{}{}",
        crate::paths::安全文件名(id),
        版本,
        package::包后缀
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 造一个**临时插件目录**：清单 + 一个 lua 文件（够 `Manifest::load` 认）。
    ///
    /// ⚠️ 不用 `PluginHost`：装一个宿主要一份完整的 `HostContext`（语言、
    /// 应用句柄……），而这里要钉的是"目录 → 包"这一段**纯文件**的逻辑。
    /// 走 `包::从目录` ＋ 直接读 zip 校验，不碰宿主状态。
    fn 造目录(名: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-导出-{名}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("lua")).unwrap();
        std::fs::write(
            dir.join("plugin.toml"),
            "[plugin]\nid = \"t.e\"\nname = \"导出测试\"\nversion = \"0.1.0\"\n\
             api = 2\nentry = \"main.lua\"\ndescription = \"\"\n",
        )
        .unwrap();
        std::fs::write(dir.join("main.lua"), "return {}\n").unwrap();
        std::fs::write(dir.join("lua/工具.lua"), "-- 中文名字，顺带钉住 utf-8 那一位\n").unwrap();
        dir
    }

    /// 拿一个目录打一个包出来，返回字节。**与 `导出` 里那一段是同一套动作**
    /// （顺序、压缩、命名），区别只是不写盘、不查宿主。
    fn 打个包(目录: &Path, 带签名: bool) -> Vec<u8> {
        let 包 = package::包::从目录(目录).unwrap();
        let mut 缓冲 = std::io::Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut 缓冲);
            let 选项 = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for f in &包.文件们 {
                zw.start_file(f.路径.clone(), 选项).unwrap();
                zw.write_all(&f.内容).unwrap();
            }
            if 带签名 {
                let 原文 = std::fs::read(目录.join(package::签名文件)).unwrap();
                zw.start_file(package::签名文件, 选项).unwrap();
                zw.write_all(&原文).unwrap();
            }
            zw.finish().unwrap();
        }
        缓冲.into_inner()
    }

    /// **这一条是导出的核心承诺**：导出来的包能被同一套读取器解开，
    /// 而且解开之后**逐字节等于**原目录。
    #[test]
    fn 导出的包能被自己读回来() {
        let dir = 造目录("读回来");
        let bytes = 打个包(&dir, false);

        let 读回 = package::包::从zip(&bytes).unwrap();
        let 原地 = package::包::从目录(&dir).unwrap();

        assert_eq!(读回.文件们.len(), 原地.文件们.len());
        for (a, b) in 读回.文件们.iter().zip(原地.文件们.iter()) {
            assert_eq!(a.路径, b.路径);
            assert_eq!(a.内容, b.内容);
        }
        // 摘要也必须一致——验签是按它判的，这是"带不带签名"那条判据的地基。
        assert_eq!(读回.摘要(), 原地.摘要());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ⚠️ 中文路径要能**原样**进出：zip 里那一位（language encoding flag）
    /// 没设的话，`lua/工具.lua` 读回来会变成乱码——而乱码路径在装的时候
    /// 报的是"路径不合法"，看起来像插件包坏了。
    #[test]
    fn 中文路径原样进出() {
        let dir = 造目录("中文");
        let bytes = 打个包(&dir, false);
        let 读回 = package::包::从zip(&bytes).unwrap();
        assert!(
            读回.文件们.iter().any(|f| f.路径 == "lua/工具.lua"),
            "读回来的路径是：{:?}",
            读回.文件们.iter().map(|f| &f.路径).collect::<Vec<_>>()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 目录里那些**用户的东西**不会被收进来：`plugin-settings` 与 `plugin-data`
    /// 按设计在别的目录下（`paths.rs`），这里钉的是"它们就算被人手抄进插件目录，
    /// 也不会被导出"……⚠️ **其实会**——所以这条用例钉的是**别的东西**：
    /// 收目录只收普通文件，符号链接整条跳过（`package.rs::收目录`）。
    /// 留着它是为了记住"导出没有排除名单"这件事（见文件头最后一段）。
    #[test]
    fn 收目录跳过符号链接() {
        let dir = 造目录("链接");
        let 目标 = dir.join("真实.lua");
        std::fs::write(&目标, "return 1\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&目标, dir.join("链接.lua")).unwrap();

        let 包 = package::包::从目录(&dir).unwrap();
        assert!(!包.文件们.iter().any(|f| f.路径 == "链接.lua"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 默认文件名：`<id>-<版本>.nota-plugin`。
    ///
    /// ⚠️ 这一条钉的是**用 id 不用名字**那件事（2026-09-27 开窗目检看到
    /// `AI__-0.1.0.nota-plugin` 之后改的）：中文名字过一遍安全文件名会变成
    /// 一串下划线，等于把信息全丢了；而 id 与作者侧 `pack-plugin.py` 的输出同名。
    #[test]
    fn 默认包名用_id_而不是中文名字() {
        assert_eq!(默认包名("nota.ai", "0.1.0"), "nota.ai-0.1.0.nota-plugin");
        // 名字里带中文也一样——这里压根不看名字，所以「AI 助手」这类插件
        // 不会退化成 `AI__-0.1.0.nota-plugin`，两个中文名插件也不会撞名。
        assert_eq!(默认包名("nota.git", "0.0.9"), "nota.git-0.0.9.nota-plugin");
    }

    /// id 也是**作者写的**，所以它同样要过安全文件名（同 `paths.rs` 那条安全用例）。
    #[test]
    fn 默认包名把带斜杠的_id_归一() {
        assert_eq!(
            默认包名("nota/../../etc/passwd", "1"),
            "nota_.._.._etc_passwd-1.nota-plugin"
        );
        // 退化情况：整名都是点，`安全文件名` 会补一个 `plugin-` 前缀。
        assert_eq!(默认包名("..", "1"), "plugin-..-1.nota-plugin");
    }
}
