//! **装 / 卸 / 停用 / 信任**四件事的实现（2026-09-25 从 `mod.rs` 拆出）。
//!
//! # 为什么单独一个文件
//!
//! `mod.rs` 那边装的是「**装着什么、怎么发现、怎么派发**」——运行时的常态；
//! 这一份装的是「**插件从哪来、怎么没的**」——用户偶尔点一下的动作，而它比
//! 常态那半复杂得多（解包、验签、临时目录、rename、回滚、记账）。
//! 两块合起来快 950 行，贴着 `docs/09` §4 那条 900 的线，所以顺着这条缝切开。
//!
//! ⚠️ **这些仍然是 `PluginHost` 的方法**（`impl` 写在子模块里是允许的：
//! 私有的字段与方法对子模块可见），不是另起一个类型——装卸要改的正是宿主的
//! 那几张表，隔一个类型反而得把它们对外开放。
//!
//! ⚠️ 那三条自由函数（`在用户目录里` / `把包写进` / `搬进落点`）剥在外面是为了
//! **能被用例钉住**：它们一个字节的宿主状态都不碰，而 `搬进落点` 那段回滚
//! 是全流程里最容易错、又最难靠手点验出来的一段。
//!
//! # 对外的口径
//!
//! 用户与插件作者视角的说明在 `docs/11` §1.6：**只有"有签名但验不过"是硬拒**、
//! **未知签名者也装得进来**、**停用 = 真卸载**。改这里的流程要连带改那一节。

use super::*;

impl PluginHost {
    /// 从一个文件（`.nota-plugin` / `.zip`）或一个目录装一个插件。返回它的 id。
    ///
    /// # 签名是"验完记账"，不是"没信任就不给装"
    ///
    /// 验签结论记在 `plugins.toml` 里，界面上照实显示（已验证 / 未知签名者 / 未签名），
    /// 未知签名者**照样装得进来**，只是行上多一颗「信任」（[`Self::信`]）。
    /// 理由：拒绝未知签名者等于"任何新作者都发不出插件"，而签名在这里要防的是
    /// **被改过**（那个是硬拒，`验签` 里就是 `Err`），不是"没打过招呼"。
    ///
    /// 硬拒只有一条：**有签名但验不过**（见 `package.rs` 文件头那张表）。
    ///
    /// # 顺序是刻意的：**先把所有会失败的检查做完，再动磁盘**
    ///
    /// 每一步都可能失败（包坏了、签名对不上、id 撞了、目录不可写）。要是边查边写，
    /// 一次失败的安装就会留下一个半拉子的插件目录——而用户看到的只是"装失败了"，
    /// 下次启动却会多出一个报错的插件。所以这里一律**先解到临时目录、
    /// 检查全过之后再搬过去**（搬是一次 `rename`，同一个文件系统内是原子的）。
    ///
    /// ⚠️ 装同一个 id 是**升级**：旧的先挪开、新的就位、最后删旧的；中间任何一步
    /// 失败都把旧的挪回去——一次失败的升级不该把用户原来那个插件也弄没了。
    ///
    /// ⚠️ 插件**自己的设置文件**（`plugin-settings/<id>.toml`，AI 插件的 API 密钥
    /// 就在那里）**不动**：那是用户的东西，不是插件的一部分。升级完密钥照旧好使。
    pub fn 装(&mut self, 来源: &Path) -> Result<String> {
        use package::{清单文件, 读一个包};

        if !来源.exists() {
            return Err(NotaError::other(format!(
                "找不到这个文件或目录：{}",
                来源.display()
            )));
        }
        let 包 = 读一个包(来源)?;

        // ── 1. 清单：id 决定了落点，也决定了要不要拒 ──────────────────────
        // ⚠️ 用临时目录里那一份 `plugin.toml` 走**真的** `Manifest::load`，
        // 不另写一个"从字节解清单"的解析器——校验规则只能有一份，两份迟早对不上。
        let 清单文本 = 包.找(清单文件).ok_or_else(|| {
            NotaError::other("这个包里没有 `plugin.toml`——它不是一个插件包".to_owned())
        })?;

        let 用户目录 = crate::paths::user_plugins_dir()?;
        if !用户目录.is_dir() {
            crate::paths::ensure_dir(&用户目录)?;
        }
        // ⚠️ 临时目录名以 `.` 开头：`find_manifests` 扫的是 `*/plugin.toml`，
        // 一个半路死掉的临时目录不该在下次启动时变成一个"装了一半的插件"。
        let 临时 = 用户目录.join(format!(".装到一半-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&临时);
        crate::paths::ensure_dir(&临时)?;
        let 临时清单 = 临时.join(清单文件);
        std::fs::write(&临时清单, 清单文本).map_err(|source| NotaError::Write {
            path: 临时清单.clone(),
            source,
        })?;

        // 从这里起，任何一条 `?` 都要把临时目录收干净再走。
        match self.装_检查完再搬(&包, &临时) {
            Ok((id, 落点, 结)) => {
                self.装_记账并加载(&id, &落点, &包, 结)?;
                Ok(id)
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&临时);
                Err(e)
            }
        }
    }

    /// [`Self::装`] 的中间一段：**全部检查 + 把文件搬到落点**。
    ///
    /// ⚠️ 它**不记账**（不写 `plugins.toml`）：记账是"装成功了"才该发生的事，
    /// 混在一起就会出现"文件都搬好了但记账失败"这种半截状态没人收拾。
    fn 装_检查完再搬(
        &mut self,
        包: &package::包,
        临时: &Path,
    ) -> Result<(String, PathBuf, Signature)> {
        use package::{信任库, 清单文件};

        let 清单 = Manifest::load(&临时.join(清单文件))?;
        let id = 清单.meta.id.clone();

        if let Some(占) = self.频道被占(&id) {
            return Err(NotaError::other(format!(
                "`{id}` 与已经装着的 `{占}` 抢同一个事件频道\
                 （插件 id 里的 `.` 在事件名里写作 `-`）——换一个 id 再装"
            )));
        }

        // 验签。⚠️ **先验再搬**：验不过的包连解都不该解开（见 `package.rs` 文件头
        // 那张表——"签名对不上"是唯一一条硬拒的路径）。
        let 库 = 信任库::load();
        let 结 = 包.验签(&库)?;

        // ── 解到临时目录，然后搬过去 ────────────────────────────────────
        把包写进(包, 临时)?;
        let 用户目录 = crate::paths::user_plugins_dir()?;
        let 落点 = 用户目录.join(crate::paths::安全文件名(&id));
        搬进落点(临时, &落点)?;
        Ok((id, 落点, 结))
    }

    /// [`Self::装`] 的最后一段：记账（来路 + 开着）并**当场加载**。
    fn 装_记账并加载(
        &mut self,
        id: &str,
        落点: &Path,
        包: &package::包,
        结: Signature,
    ) -> Result<()> {
        let sig = 包.签名.as_ref();
        self.installed.记来路(
            id,
            来路 {
                结,
                key_id: sig.map(|s| installed::公钥指纹(&s.public_key)),
                public_key: sig.map(|s| s.公钥base64()),
            },
        )?;
        // 装完就是开着的：用户刚点完「安装」，不该还要再点一次「启用」。
        self.installed.set_enabled(id, true)?;

        // ⚠️ 从**落点**重新读一遍清单（不是复用临时目录那份）：`Manifest.dir` 要指向
        // 真正的家，否则新装的插件的 `entry_path()` 会指到一个马上被删掉的临时目录。
        let 清单 = Manifest::load(&落点.join(package::清单文件))?;
        if let Some(i) = self.位置(id) {
            self.plugins[i].unload();
            self.plugins.remove(i);
        }
        let ctx = self.上下文(id);
        self.plugins.push(LuaPlugin::load(清单, ctx));
        self.plugins
            .sort_by(|a, b| a.manifest.meta.id.cmp(&b.manifest.meta.id));
        Ok(())
    }

    /// 卸掉一个插件：**磁盘上删掉、内存里拿掉、账本上忘掉**。
    ///
    /// ⚠️ 内置插件卸不掉（它在安装包里/仓库里，那个目录通常还是只读的，
    /// 删了下次启动又回来）。要让它彻底不起作用，用**停用**——停用也是真卸载
    /// （见 [`Self::set_enabled`]），差别只在磁盘上那些文件还在不在。
    ///
    /// ⚠️ **先删磁盘、再改内存**：删不掉就如实报错、状态原样不动。
    /// 反过来的话会出现"界面上没了、文件还在"，下次启动它又回来了。
    pub fn 卸(&mut self, id: &str) -> Result<()> {
        let i = self
            .位置(id)
            .ok_or_else(|| NotaError::other(format!("没有这个插件：{id}")))?;
        let dir = self.plugins[i].manifest.dir.clone();
        if !在用户目录里(&dir) {
            return Err(NotaError::other(format!(
                "`{id}` 是内置插件（{}），卸不掉——它在安装包里，删了下次启动还会回来。\
                 要让它不起作用，用「停用」",
                dir.display()
            )));
        }
        self.plugins[i].unload();
        std::fs::remove_dir_all(&dir)
            .map_err(|e| NotaError::other(format!("删不掉 `{}`：{e}", dir.display())))?;
        self.plugins.remove(i);
        self.installed.忘掉(id)?;
        Ok(())
    }

    /// 信任这个插件的签名者。见 [`Self::装`] 与 `package.rs` 里信任库那一段。
    pub fn 信(&mut self, id: &str) -> Result<()> {
        let (key_id, 公钥, 名字) = {
            let r = self.installed.record(id).ok_or_else(|| {
                NotaError::other(format!("没有 `{id}` 的来路记录——它多半是内置插件"))
            })?;
            let 名字 = self
                .get(id)
                .map(|p| p.manifest.meta.name.clone())
                .unwrap_or_else(|| id.to_owned());
            match (r.key_id.clone(), r.public_key.clone()) {
                (Some(k), Some(p)) => (k, p, 名字),
                // 没签名（或者签名块没记下来）就没有"钥匙"可信任——签名缺失不是
                // "信任一个陌生人"，而是"压根没人签"，那时该做的是让作者去签。
                _ => {
                    return Err(NotaError::other(format!(
                        "`{id}` 的包里没有签名块，没有可信任的钥匙"
                    )))
                }
            }
        };
        package::信任库::load().记下(&key_id, &名字, &公钥)?;
        self.installed.记来路(
            id,
            来路 {
                结: Signature::Verified,
                key_id: Some(key_id),
                public_key: Some(公钥),
            },
        )?;
        Ok(())
    }

    /// 信任库里现在有哪几把钥匙（给界面列出来看）。
    pub fn 信任表(&self) -> Vec<信任记录> {
        package::信任库::load()
            .列()
            .into_iter()
            .map(|(key_id, name)| 信任记录 { key_id, name })
            .collect()
    }
}

/// 这个插件的目录是**用户自己装的那一类**吗（在 `paths::user_plugins_dir()` 下）。
///
/// ⚠️ 必须是**落点判据**，不能看"哪个先扫到"：`discover` 先扫用户目录只是为了
/// 让用户装的覆盖内置同名的，那是去重顺序，不是来源。`plugin.toml` 里也没有
/// "我是内置的"这种自称——那种自称可以随便写，而落点是文件系统的事实。
///
/// ⚠️ `user_plugins_dir()` 拿不到时返回 `false`（当成内置）：内置是**更保守**的
/// 那一侧——卸不掉的错误只是"多一次解释"，而把内置插件当用户插件卸掉是不可逆的。
pub(super) fn 在用户目录里(dir: &Path) -> bool {
    crate::paths::user_plugins_dir()
        .map(|用户目录| !用户目录.as_os_str().is_empty() && dir.starts_with(&用户目录))
        .unwrap_or(false)
}

/// 把一个包里的文件**全部**写进某个目录（安装流程里的"临时目录"那一步）。
///
/// ⚠️ 路径**不再校验第二遍**：解包时（[`package::包::从zip`] / [`package::包::从目录`]）
/// 每一条都过了 [`package::路径合法吗`]，归一过的就是最终用的。再验一遍看着"更安全"，
/// 实际是两处相乘——两处规则哪天不一致，得看走的是哪条路决定行为。
fn 把包写进(包: &package::包, 目标: &Path) -> Result<()> {
    for f in &包.文件们 {
        let 落 = package::拼落点(目标, &f.路径);
        if let Some(父) = 落.parent() {
            crate::paths::ensure_dir(父)?;
        }
        std::fs::write(&落, &f.内容).map_err(|source| NotaError::Write { path: 落, source })?;
    }
    Ok(())
}

/// 把装好的**临时目录**搬到最终落点。旧的（同一个 id 的上一版）先挪开、新的就位、
/// 最后删旧的；中途失败就把旧的挪回去。
///
/// # ⚠️ 为什么不是直接 `remove_dir_all(落点)` 再 `rename`
///
/// 那样有两条坏路：删到一半失败 → 用户原来那个插件**也没了**；而"删完到搬进去"
/// 之间程序被杀 → 插件目录整个不见了，用户看到的是"我的插件自己消失了"。
/// 现在的顺序里**每一步失败都留下一个完整可用的目录**（要么旧的那份，要么新的那份）。
///
/// `rename` 是关键：同一个文件系统内它是原子的，而且比"复制一遍"快得多
/// （插件包里可能是几十 MB 的图标和模板）。
///
/// ⚠️ 剥成自由函数（不收 `&mut PluginHost`）是为了**能被用例钉住**：
/// 这段是全流程里最容易错、又最难靠手点验出来的一段，而它一个字节的宿主状态都不碰。
fn 搬进落点(临时: &Path, 落点: &Path) -> Result<()> {
    let 旧 = match 落点.parent() {
        Some(父) => 父.join(format!(".旧-{}", std::process::id())),
        None => return Err(NotaError::other(format!("落点没有父目录：{}", 落点.display()))),
    };
    let _ = std::fs::remove_dir_all(&旧);

    let 挪开过 = if 落点.exists() {
        std::fs::rename(落点, &旧).map_err(|e| {
            NotaError::other(format!("挪不开原来那个 `{}`：{e}", 落点.display()))
        })?;
        true
    } else {
        false
    };

    if let Err(e) = std::fs::rename(临时, 落点) {
        // ⚠️ 回滚：一次失败的安装不能连用户原来那个插件一起弄丢。
        if 挪开过 {
            let _ = std::fs::rename(&旧, 落点);
        }
        return Err(NotaError::other(format!(
            "装到 `{}` 失败：{e}",
            落点.display()
        )));
    }
    if 挪开过 {
        // 删不掉**不算失败**：新的那份已经就位了，留下一个点开头的目录
        // 顶多占点地方（而且 `find_manifests` 不看点开头的目录）。
        let _ = std::fs::remove_dir_all(&旧);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 建个目录(名: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nota-plugin-{名}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 正常那一路：旧的那份被换掉，新的在原地，**不留渣**。
    #[test]
    fn 搬进落点会换掉旧的() {
        let 根 = 建个目录("搬成功");
        let 落点 = 根.join("a.b");
        std::fs::create_dir_all(&落点).unwrap();
        std::fs::write(落点.join("plugin.toml"), "旧的").unwrap();

        let 临时 = 根.join(".装到一半");
        std::fs::create_dir_all(&临时).unwrap();
        std::fs::write(临时.join("plugin.toml"), "新的").unwrap();

        搬进落点(&临时, &落点).unwrap();

        assert_eq!(
            std::fs::read_to_string(落点.join("plugin.toml")).unwrap(),
            "新的"
        );
        assert!(!临时.exists(), "临时目录该被搬走了");
        let 渣: Vec<_> = std::fs::read_dir(&根)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with('.'))
            .collect();
        assert!(渣.is_empty(), "留下了点开头的渣：{渣:?}");

        let _ = std::fs::remove_dir_all(&根);
    }

    /// 全新安装（落点本来不存在）也要能搬。
    #[test]
    fn 搬进落点对全新安装也成立() {
        let 根 = 建个目录("搬全新");
        let 落点 = 根.join("a.b");
        let 临时 = 根.join(".装到一半");
        std::fs::create_dir_all(&临时).unwrap();
        std::fs::write(临时.join("main.lua"), "return {}").unwrap();

        搬进落点(&临时, &落点).unwrap();
        assert!(落点.join("main.lua").is_file());

        let _ = std::fs::remove_dir_all(&根);
    }

    /// ⚠️ 这条钉的是**回滚**：搬不过去时，用户原来那个插件必须还在原地。
    ///
    /// 造失败的办法是**临时目录根本不存在**（`rename` 必然报 ENOENT），
    /// 而不是靠权限——测试跑在容器里是 root，权限位拦不住 root，
    /// 那种用例会在别人的机器上时绿时红。
    #[test]
    fn 搬不动的时候把旧的原样留下() {
        let 根 = 建个目录("搬失败");
        let 落点 = 根.join("a.b");
        std::fs::create_dir_all(&落点).unwrap();
        std::fs::write(落点.join("plugin.toml"), "旧的").unwrap();

        let 临时 = 根.join(".装到一半"); // 故意不建

        let err = 搬进落点(&临时, &落点).unwrap_err();
        assert!(err.to_string().contains("装到"), "实际：{err}");
        assert_eq!(
            std::fs::read_to_string(落点.join("plugin.toml")).unwrap(),
            "旧的",
            "回滚没做：原来那个插件被弄没了"
        );

        let _ = std::fs::remove_dir_all(&根);
    }

    /// 包里的目录结构要**照原样**铺开（`lua/foo.lua` 这种要建出中间那层）。
    #[test]
    fn 写包会补出中间的目录() {
        let 根 = 建个目录("写包");
        let 包 = package::包 {
            文件们: vec![
                package::包文件 {
                    路径: "plugin.toml".to_owned(),
                    内容: b"[plugin]".to_vec(),
                },
                package::包文件 {
                    路径: "lua/工具/大小写.lua".to_owned(),
                    内容: b"return {}".to_vec(),
                },
            ],
            签名: None,
        };

        把包写进(&包, &根).unwrap();
        assert!(根.join("lua/工具/大小写.lua").is_file());

        let _ = std::fs::remove_dir_all(&根);
    }
}
