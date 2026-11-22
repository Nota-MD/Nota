use super::*;

impl PluginHost {
    pub fn install_2(&mut self, source_2: &Path) -> Result<String> {
        use package::{read_yi_ge_bao, MANIFEST_FILE};

        if !source_2.exists() {
            return Err(NotaError::other(format!(
                "File or directory not found: {}",
                source_2.display()
            )));
        }
        let bao = read_yi_ge_bao(source_2)?;

        let manifest_text = bao.zhao(MANIFEST_FILE).ok_or_else(|| {
            NotaError::other(
                "The package does not contain `plugin.toml` and is not an extension package"
                    .to_owned(),
            )
        })?;

        let yong_hu_directory = crate::paths::user_plugins_dir()?;
        if !yong_hu_directory.is_dir() {
            crate::paths::ensure_dir(&yong_hu_directory)?;
        }

        let temp_2 = yong_hu_directory.join(format!(".partial-install-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_2);
        crate::paths::ensure_dir(&temp_2)?;
        let temp_manifest = temp_2.join(MANIFEST_FILE);
        std::fs::write(&temp_manifest, manifest_text).map_err(|source| NotaError::Write {
            path: temp_manifest.clone(),
            source,
        })?;

        match self.install_check_wan_zai_ban(&bao, &temp_2) {
            Ok((id, target_3, jie)) => {
                self.install_ji_zhang_bing_load(&id, &target_3, &bao, jie)?;
                Ok(id)
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&temp_2);
                Err(e)
            }
        }
    }

    fn install_check_wan_zai_ban(
        &mut self,
        bao: &package::Package,
        temp_2: &Path,
    ) -> Result<(String, PathBuf, Signature)> {
        use package::{TrustStore, MANIFEST_FILE};

        let manifest_2 = Manifest::load(&temp_2.join(MANIFEST_FILE))?;
        let id = manifest_2.meta.id.clone();

        if let Some(zhan) = self.pin_dao_bei_zhan(&id) {
            return Err(NotaError::other(format!(
                "Extension `{id}` conflicts with installed extension `{zhan}` on the same event channel; choose another extension ID."
            )));
        }

        let ku = TrustStore::load();
        let jie = bao.yan_qian(&ku)?;

        ba_bao_write_jin(bao, temp_2)?;
        let yong_hu_directory = crate::paths::user_plugins_dir()?;
        let target_3 = yong_hu_directory.join(crate::paths::an_fulldocument_jian_ming(&id));
        ban_jin_target(temp_2, &target_3)?;
        Ok((id, target_3, jie))
    }

    fn install_ji_zhang_bing_load(
        &mut self,
        id: &str,
        target_3: &Path,
        bao: &package::Package,
        jie: Signature,
    ) -> Result<()> {
        let sig = bao.qian_ming.as_ref();
        self.installed.ji_lai_lu(
            id,
            InstallSource {
                jie,
                key_id: sig.map(|s| installed::gong_yao_fingerprint(&s.public_key)),
                public_key: sig.map(|s| s.gong_yao_base64()),
            },
        )?;

        self.installed.set_enabled(id, true)?;

        let manifest_2 = Manifest::load(&target_3.join(package::MANIFEST_FILE))?;
        if let Some(i) = self.wei_zhi(id) {
            self.plugins[i].unload();
            self.plugins.remove(i);
        }
        let ctx = self.shang_xia_wen(id);
        self.plugins.push(if self.extensions_enabled {
            LuaPlugin::load(manifest_2, ctx)
        } else {
            LuaPlugin::disabled(manifest_2, &self.base.application_language)
        });
        self.plugins
            .sort_by(|a, b| a.manifest.meta.id.cmp(&b.manifest.meta.id));
        self.apply_setting_locks()?;
        Ok(())
    }

    pub fn uninstall(&mut self, id: &str) -> Result<()> {
        let i = self
            .wei_zhi(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;
        let dir = self.plugins[i].manifest.dir.clone();
        if !zai_yong_hu_directory_li(&dir) {
            self.plugins[i].unload();
            self.receive_tan(id);
            self.installed.mark_removed(id)?;
            self.plugins.remove(i);
            self.apply_setting_locks()?;
            return Ok(());
        }
        self.plugins[i].unload();

        self.receive_tan(id);
        std::fs::remove_dir_all(&dir)
            .map_err(|e| NotaError::other(format!("Could not delete `{}`: {e}", dir.display())))?;
        self.plugins.remove(i);
        self.restore_setting_backups_for(id)?;
        self.installed.forget_diao(id)?;
        self.apply_setting_locks()?;
        Ok(())
    }

    pub fn trust_2(&mut self, id: &str) -> Result<()> {
        let (key_id, gong_yao, name_2) = {
            let r = self.installed.record(id).ok_or_else(|| {
                NotaError::other(format!(
                    "No source record exists for `{id}`; it is probably built in"
                ))
            })?;
            let name_2 = self
                .get(id)
                .map(|p| p.manifest.meta.name.clone())
                .unwrap_or_else(|| id.to_owned());
            match (r.key_id.clone(), r.public_key.clone()) {
                (Some(k), Some(p)) => (k, p, name_2),

                _ => {
                    return Err(NotaError::other(format!(
                        "The package for `{id}` has no signature block or trusted key"
                    )))
                }
            }
        };
        package::TrustStore::load().insert(&key_id, &name_2, &gong_yao)?;
        self.installed.ji_lai_lu(
            id,
            InstallSource {
                jie: Signature::Verified,
                key_id: Some(key_id),
                public_key: Some(gong_yao),
            },
        )?;
        Ok(())
    }

    pub fn trust_records(&self) -> Vec<TrustRecord> {
        package::TrustStore::load()
            .entries()
            .into_iter()
            .map(|(key_id, name)| TrustRecord { key_id, name })
            .collect()
    }
}

pub(super) fn zai_yong_hu_directory_li(dir: &Path) -> bool {
    crate::paths::user_plugins_dir()
        .map(|yong_hu_directory| {
            !yong_hu_directory.as_os_str().is_empty() && dir.starts_with(&yong_hu_directory)
        })
        .unwrap_or(false)
}

fn ba_bao_write_jin(bao: &package::Package, target_2: &Path) -> Result<()> {
    for f in &bao.files_2 {
        let luo = package::pin_target(target_2, &f.path_3);
        if let Some(fu) = luo.parent() {
            crate::paths::ensure_dir(fu)?;
        }
        std::fs::write(&luo, &f.content_2)
            .map_err(|source| NotaError::Write { path: luo, source })?;
    }
    Ok(())
}

fn ban_jin_target(temp_2: &Path, target_3: &Path) -> Result<()> {
    let jiu = match target_3.parent() {
        Some(fu) => fu.join(format!(".old-{}", std::process::id())),
        None => {
            return Err(NotaError::other(format!(
                "Destination has no parent directory: {}",
                target_3.display()
            )))
        }
    };
    let _ = std::fs::remove_dir_all(&jiu);

    let nuo_kai_guo = if target_3.exists() {
        std::fs::rename(target_3, &jiu).map_err(|e| {
            NotaError::other(format!(
                "Could not move the existing `{}` aside: {e}",
                target_3.display()
            ))
        })?;
        true
    } else {
        false
    };

    if let Err(e) = std::fs::rename(temp_2, target_3) {
        if nuo_kai_guo {
            let _ = std::fs::rename(&jiu, target_3);
        }
        return Err(NotaError::other(format!(
            "Could not install to `{}`: {e}",
            target_3.display()
        )));
    }
    if nuo_kai_guo {
        let _ = std::fs::remove_dir_all(&jiu);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jian_ge_directory(ming: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-plugin-{ming}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn ban_jin_target_hui_huan_diao_jiu_de() {
        let root_2 = jian_ge_directory("\u{642c}\u{6210}\u{529f}");
        let target_3 = root_2.join("a.b");
        std::fs::create_dir_all(&target_3).unwrap();
        std::fs::write(target_3.join("plugin.toml"), "\u{65e7}\u{7684}").unwrap();

        let temp_2 = root_2.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}");
        std::fs::create_dir_all(&temp_2).unwrap();
        std::fs::write(temp_2.join("plugin.toml"), "\u{65b0}\u{7684}").unwrap();

        ban_jin_target(&temp_2, &target_3).unwrap();

        assert_eq!(
            std::fs::read_to_string(target_3.join("plugin.toml")).unwrap(),
            "\u{65b0}\u{7684}"
        );
        assert!(
            !temp_2.exists(),
            "\u{4e34}\u{65f6}\u{76ee}\u{5f55}\u{8be5}\u{88ab}\u{642c}\u{8d70}\u{4e86}"
        );
        let zha_2: Vec<_> = std::fs::read_dir(&root_2)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with('.'))
            .collect();
        assert!(
            zha_2.is_empty(),
            "\u{7559}\u{4e0b}\u{4e86}\u{70b9}\u{5f00}\u{5934}\u{7684}\u{6e23}\u{ff1a}{zha_2:?}"
        );

        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn ban_jin_target_dui_quan_xin_an_install_ye_cheng_li() {
        let root_2 = jian_ge_directory("\u{642c}\u{5168}\u{65b0}");
        let target_3 = root_2.join("a.b");
        let temp_2 = root_2.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}");
        std::fs::create_dir_all(&temp_2).unwrap();
        std::fs::write(temp_2.join("main.lua"), "return {}").unwrap();

        ban_jin_target(&temp_2, &target_3).unwrap();
        assert!(target_3.join("main.lua").is_file());

        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn ban_bu_dong_de_shi_hou_ba_jiu_de_yuan_yang_liu_xia() {
        let root_2 = jian_ge_directory("\u{642c}\u{5931}\u{8d25}");
        let target_3 = root_2.join("a.b");
        std::fs::create_dir_all(&target_3).unwrap();
        std::fs::write(target_3.join("plugin.toml"), "\u{65e7}\u{7684}").unwrap();

        let temp_2 = root_2.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}");

        let err = ban_jin_target(&temp_2, &target_3).unwrap_err();
        assert!(
            err.to_string().contains("Could not install to"),
            "unexpected error: {err}"
        );
        assert_eq!(
            std::fs::read_to_string(target_3.join("plugin.toml")).unwrap(),
            "\u{65e7}\u{7684}",
            "\u{56de}\u{6eda}\u{6ca1}\u{505a}\u{ff1a}\u{539f}\u{6765}\u{90a3}\u{4e2a}\u{62d3}\u{5c55}\u{88ab}\u{5f04}\u{6ca1}\u{4e86}"
        );

        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn write_bao_hui_bu_chu_zhong_jian_de_directory() {
        let root_2 = jian_ge_directory("\u{5199}\u{5305}");
        let bao = package::Package {
            files_2: vec![
                package::PackageFile {
                    path_3: "plugin.toml".to_owned(),
                    content_2: b"[plugin]".to_vec(),
                },
                package::PackageFile {
                    path_3: "lua/\u{5de5}\u{5177}/\u{5927}\u{5c0f}\u{5199}.lua".to_owned(),
                    content_2: b"return {}".to_vec(),
                },
            ],
            qian_ming: None,
        };

        ba_bao_write_jin(&bao, &root_2).unwrap();
        assert!(root_2
            .join("lua/\u{5de5}\u{5177}/\u{5927}\u{5c0f}\u{5199}.lua")
            .is_file());

        let _ = std::fs::remove_dir_all(&root_2);
    }
}
