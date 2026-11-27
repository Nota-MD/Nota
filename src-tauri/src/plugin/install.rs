use super::*;

impl PluginHost {
    pub fn install_2(&mut self, source_2: &Path) -> Result<String> {
        use package::{read_one_package, MANIFEST_FILE};

        if !source_2.exists() {
            return Err(NotaError::other(format!(
                "File or directory not found: {}",
                source_2.display()
            )));
        }
        let package = read_one_package(source_2)?;

        let manifest_text = package.find(MANIFEST_FILE).ok_or_else(|| {
            NotaError::other(
                "The package does not contain `plugin.toml` and is not an extension package"
                    .to_owned(),
            )
        })?;

        let use_call_directory = crate::paths::user_plugins_dir()?;
        if !use_call_directory.is_dir() {
            crate::paths::ensure_dir(&use_call_directory)?;
        }

        let temp_2 = use_call_directory.join(format!(".partial-install-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_2);
        crate::paths::ensure_dir(&temp_2)?;
        let temp_manifest = temp_2.join(MANIFEST_FILE);
        std::fs::write(&temp_manifest, manifest_text).map_err(|source| NotaError::Write {
            path: temp_manifest.clone(),
            source,
        })?;

        match self.install_check_complete_at_half(&package, &temp_2) {
            Ok((id, target_3, boundary)) => {
                self.install_record_length_and_load(&id, &target_3, &package, boundary)?;
                Ok(id)
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&temp_2);
                Err(e)
            }
        }
    }

    fn install_check_complete_at_half(
        &mut self,
        package: &package::Package,
        temp_2: &Path,
    ) -> Result<(String, PathBuf, Signature)> {
        use package::{TrustStore, MANIFEST_FILE};

        let manifest_2 = Manifest::load(&temp_2.join(MANIFEST_FILE))?;
        let id = manifest_2.meta.id.clone();

        if let Some(expand) = self.spell_to_passive_expand(&id) {
            return Err(NotaError::other(format!(
                "Extension `{id}` conflicts with installed extension `{expand}` on the same event channel; choose another extension ID."
            )));
        }

        let store = TrustStore::load();
        let boundary = package.validate_before(&store)?;

        handle_package_write_enter(package, temp_2)?;
        let use_call_directory = crate::paths::user_plugins_dir()?;
        let target_3 = use_call_directory.join(crate::paths::safe_filename(&id));
        half_enter_target(temp_2, &target_3)?;
        Ok((id, target_3, boundary))
    }

    fn install_record_length_and_load(
        &mut self,
        id: &str,
        target_3: &Path,
        package: &package::Package,
        boundary: Signature,
    ) -> Result<()> {
        let sig = package.before_name.as_ref();
        self.installed.record_incoming_path(
            id,
            InstallSource {
                boundary,
                key_id: sig.map(|s| installed::work_need_fingerprint(&s.public_key)),
                public_key: sig.map(|s| s.work_need_base64()),
            },
        )?;

        self.installed.set_enabled(id, true)?;

        let manifest_2 = Manifest::load(&target_3.join(package::MANIFEST_FILE))?;
        if let Some(i) = self.position_only(id) {
            self.plugins[i].unload();
            self.plugins.remove(i);
        }
        let ctx = self.upper_lower_text(id);
        self.plugins.push(if self.extensions_enabled {
            LuaPlugin::load(manifest_2, ctx)
        } else {
            LuaPlugin::disabled(manifest_2, &self.base.application_language)
        });
        self.plugins
            .sort_by(|a, b| a.manifest.meta.id.cmp(&b.manifest.meta.id));
        Ok(())
    }

    pub fn uninstall(&mut self, id: &str) -> Result<()> {
        let i = self
            .position_only(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;
        let dir = self.plugins[i].manifest.dir.clone();
        if !at_use_call_directory_inner(&dir) {
            self.plugins[i].unload();
            self.receive_probe(id);
            self.installed.mark_removed(id)?;
            self.plugins.remove(i);
            return Ok(());
        }
        self.plugins[i].unload();

        self.receive_probe(id);
        std::fs::remove_dir_all(&dir)
            .map_err(|e| NotaError::other(format!("Could not delete `{}`: {e}", dir.display())))?;
        self.plugins.remove(i);
        self.installed.forget_drop(id)?;
        Ok(())
    }

    pub fn trust_2(&mut self, id: &str) -> Result<()> {
        let (key_id, work_need, name_2) = {
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
        package::TrustStore::load().insert(&key_id, &name_2, &work_need)?;
        self.installed.record_incoming_path(
            id,
            InstallSource {
                boundary: Signature::Verified,
                key_id: Some(key_id),
                public_key: Some(work_need),
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

pub(super) fn at_use_call_directory_inner(dir: &Path) -> bool {
    crate::paths::user_plugins_dir()
        .map(|use_call_directory| {
            !use_call_directory.as_os_str().is_empty() && dir.starts_with(&use_call_directory)
        })
        .unwrap_or(false)
}

fn handle_package_write_enter(package: &package::Package, target_2: &Path) -> Result<()> {
    for f in &package.files_2 {
        let land = package::spell_target(target_2, &f.path_3);
        if let Some(service) = land.parent() {
            crate::paths::ensure_dir(service)?;
        }
        std::fs::write(&land, &f.content_2)
            .map_err(|source| NotaError::Write { path: land, source })?;
    }
    Ok(())
}

fn half_enter_target(temp_2: &Path, target_3: &Path) -> Result<()> {
    let old = match target_3.parent() {
        Some(service) => service.join(format!(".old-{}", std::process::id())),
        None => {
            return Err(NotaError::other(format!(
                "Destination has no parent directory: {}",
                target_3.display()
            )))
        }
    };
    let _ = std::fs::remove_dir_all(&old);

    let move_start_passed = if target_3.exists() {
        std::fs::rename(target_3, &old).map_err(|e| {
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
        if move_start_passed {
            let _ = std::fs::rename(&old, target_3);
        }
        return Err(NotaError::other(format!(
            "Could not install to `{}`: {e}",
            target_3.display()
        )));
    }
    if move_start_passed {
        let _ = std::fs::remove_dir_all(&old);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check_directory(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-plugin-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn half_enter_target_return_replace_drop_old() {
        let root_2 = check_directory("\u{642c}\u{6210}\u{529f}");
        let target_3 = root_2.join("a.b");
        std::fs::create_dir_all(&target_3).unwrap();
        std::fs::write(target_3.join("plugin.toml"), "\u{65e7}\u{7684}").unwrap();

        let temp_2 = root_2.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}");
        std::fs::create_dir_all(&temp_2).unwrap();
        std::fs::write(temp_2.join("plugin.toml"), "\u{65b0}\u{7684}").unwrap();

        half_enter_target(&temp_2, &target_3).unwrap();

        assert_eq!(
            std::fs::read_to_string(target_3.join("plugin.toml")).unwrap(),
            "\u{65b0}\u{7684}"
        );
        assert!(
            !temp_2.exists(),
            "\u{4e34}\u{65f6}\u{76ee}\u{5f55}\u{8be5}\u{88ab}\u{642c}\u{8d70}\u{4e86}"
        );
        let click_2: Vec<_> = std::fs::read_dir(&root_2)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with('.'))
            .collect();
        assert!(
            click_2.is_empty(),
            "\u{7559}\u{4e0b}\u{4e86}\u{70b9}\u{5f00}\u{5934}\u{7684}\u{6e23}\u{ff1a}{click_2:?}"
        );

        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn half_enter_target_pair_full_new_by_install_page_success_inner() {
        let root_2 = check_directory("\u{642c}\u{5168}\u{65b0}");
        let target_3 = root_2.join("a.b");
        let temp_2 = root_2.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}");
        std::fs::create_dir_all(&temp_2).unwrap();
        std::fs::write(temp_2.join("main.lua"), "return {}").unwrap();

        half_enter_target(&temp_2, &target_3).unwrap();
        assert!(target_3.join("main.lua").is_file());

        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn half_not_dynamic_is_after_handle_old_source_sample_stream_lower() {
        let root_2 = check_directory("\u{642c}\u{5931}\u{8d25}");
        let target_3 = root_2.join("a.b");
        std::fs::create_dir_all(&target_3).unwrap();
        std::fs::write(target_3.join("plugin.toml"), "\u{65e7}\u{7684}").unwrap();

        let temp_2 = root_2.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}");

        let err = half_enter_target(&temp_2, &target_3).unwrap_err();
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
    fn write_package_return_not_out_middle_check_directory() {
        let root_2 = check_directory("\u{5199}\u{5305}");
        let package = package::Package {
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
            before_name: None,
        };

        handle_package_write_enter(&package, &root_2).unwrap();
        assert!(root_2
            .join("lua/\u{5de5}\u{5177}/\u{5927}\u{5c0f}\u{5199}.lua")
            .is_file());

        let _ = std::fs::remove_dir_all(&root_2);
    }
}
