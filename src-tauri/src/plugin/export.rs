use std::io::Write;

use super::*;

#[derive(Debug, Clone, Serialize)]
pub struct ExportReport {
    pub id: String,

    pub files: usize,

    pub bytes: u64,

    pub signature: String,

    pub path: String,
}

impl PluginHost {
    pub fn export_2(&self, id: &str, target_2: &Path) -> Result<ExportReport> {
        let i = self
            .position_only(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;
        let dir = self.plugins[i].manifest.dir.clone();

        let package = package::Package::from_directory(&dir)?;

        let (before_name_get_item, before_name_source_text) = match &package.before_name {
            None => ("none", None),
            Some(_) => {
                let source_text = std::fs::read(dir.join(package::SIGNATURE_FILE)).ok();
                match (
                    package.validate_before(&package::TrustStore::load()),
                    source_text,
                ) {
                    (Ok(_), Some(source_text)) => ("kept", Some(source_text)),

                    _ => ("dropped", None),
                }
            }
        };

        let mut file_data = 0usize;
        let mut character_boundary_data = 0u64;
        let mut replace_duplicate = std::io::Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut replace_duplicate);
            let select_item = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            for f in &package.files_2 {
                zw.start_file(f.path_3.clone(), select_item).map_err(|e| {
                    NotaError::other(format!("Could not add `{}` to the package: {e}", f.path_3))
                })?;
                zw.write_all(&f.content_2).map_err(|e| {
                    NotaError::other(format!(
                        "Could not write the contents of `{}` to the package: {e}",
                        f.path_3
                    ))
                })?;
                file_data += 1;
                character_boundary_data += f.content_2.len() as u64;
            }
            if let Some(source_text) = &before_name_source_text {
                zw.start_file(package::SIGNATURE_FILE, select_item)
                    .map_err(|e| {
                        NotaError::other(format!("Could not write the signature block: {e}"))
                    })?;
                zw.write_all(source_text).map_err(|e| {
                    NotaError::other(format!("Could not write the signature block contents: {e}"))
                })?;
                character_boundary_data += source_text.len() as u64;
            }

            zw.finish().map_err(|e| {
                NotaError::other(format!(
                    "Could not finish the package central directory: {e}"
                ))
            })?;
        }

        let large_package_ok = replace_duplicate.into_inner();

        if let Some(service) = target_2.parent() {
            if !service.as_os_str().is_empty() {
                crate::paths::ensure_dir(service)?;
            }
        }
        std::fs::write(target_2, &large_package_ok).map_err(|source| NotaError::Write {
            path: target_2.to_path_buf(),
            source,
        })?;

        Ok(ExportReport {
            id: id.to_owned(),
            files: file_data,
            bytes: character_boundary_data,
            signature: before_name_get_item.to_owned(),
            path: crate::paths::path_to_string(target_2)?,
        })
    }

    pub fn default_export_name(&self, id: &str) -> Result<String> {
        let i = self
            .position_only(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;
        let m = &self.plugins[i].manifest.meta;
        Ok(default_package_name(id, &m.version))
    }
}

fn default_package_name(id: &str, half_current: &str) -> String {
    format!(
        "{}-{}{}",
        crate::paths::safe_filename(id),
        half_current,
        package::PACKAGE_EXTENSION
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_directory(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nota-\u{5bfc}\u{51fa}-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("lua")).unwrap();
        std::fs::write(
            dir.join("plugin.toml"),
            "[plugin]\nid = \"t.e\"\nname = \"\u{5bfc}\u{51fa}\u{6d4b}\u{8bd5}\"\nversion = \"0.1.0\"\n\
             api = \"v2.3\"\nentry = \"main.lua\"\ndescription = \"\"\n",
        )
        .unwrap();
        std::fs::write(dir.join("main.lua"), "return {}\n").unwrap();
        std::fs::write(dir.join("lua/\u{5de5}\u{5177}.lua"), "-- \u{4e2d}\u{6587}\u{540d}\u{5b57}\u{ff0c}\u{987a}\u{5e26}\u{9489}\u{4f4f} utf-8 \u{90a3}\u{4e00}\u{4f4d}\n").unwrap();
        dir
    }

    fn create_package(directory_2: &Path, pending_before_name: bool) -> Vec<u8> {
        let package = package::Package::from_directory(directory_2).unwrap();
        let mut replace_duplicate = std::io::Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut replace_duplicate);
            let select_item = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for f in &package.files_2 {
                zw.start_file(f.path_3.clone(), select_item).unwrap();
                zw.write_all(&f.content_2).unwrap();
            }
            if pending_before_name {
                let source_text = std::fs::read(directory_2.join(package::SIGNATURE_FILE)).unwrap();
                zw.start_file(package::SIGNATURE_FILE, select_item).unwrap();
                zw.write_all(&source_text).unwrap();
            }
            zw.finish().unwrap();
        }
        replace_duplicate.into_inner()
    }

    #[test]
    fn export_package_can_passive_character_record_read_return_incoming() {
        let dir = create_directory("\u{8bfb}\u{56de}\u{6765}");
        let bytes = create_package(&dir, false);

        let read_return = package::Package::from_zip(&bytes).unwrap();
        let source_base = package::Package::from_directory(&dir).unwrap();

        assert_eq!(read_return.files_2.len(), source_base.files_2.len());
        for (a, b) in read_return.files_2.iter().zip(source_base.files_2.iter()) {
            assert_eq!(a.path_3, b.path_3);
            assert_eq!(a.content_2, b.content_2);
        }

        assert_eq!(read_return.summary(), source_base.summary());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn middle_text_path_source_sample_enter_out() {
        let dir = create_directory("\u{4e2d}\u{6587}");
        let bytes = create_package(&dir, false);
        let read_return = package::Package::from_zip(&bytes).unwrap();
        assert!(
            read_return
                .files_2
                .iter()
                .any(|f| f.path_3 == "lua/\u{5de5}\u{5177}.lua"),
            "\u{8bfb}\u{56de}\u{6765}\u{7684}\u{8def}\u{5f84}\u{662f}\u{ff1a}{:?}",
            read_return
                .files_2
                .iter()
                .map(|f| &f.path_3)
                .collect::<Vec<_>>()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn receive_directory_item_passed_service_number_link_boundary() {
        let dir = create_directory("\u{94fe}\u{63a5}");
        let target_2 = dir.join("\u{771f}\u{5b9e}.lua");
        std::fs::write(&target_2, "return 1\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target_2, dir.join("\u{94fe}\u{63a5}.lua")).unwrap();

        let package = package::Package::from_directory(&dir).unwrap();
        assert!(!package
            .files_2
            .iter()
            .any(|f| f.path_3 == "\u{94fe}\u{63a5}.lua"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_package_name_use_id_two_not_is_middle_text_name() {
        assert_eq!(
            default_package_name("nota.ai", "0.1.0"),
            "nota.ai-0.1.0.nota-plugin"
        );

        assert_eq!(
            default_package_name("nota.git", "0.0.9"),
            "nota.git-0.0.9.nota-plugin"
        );
    }

    #[test]
    fn default_package_name_handle_pending_write_just_id_normalize_one() {
        assert_eq!(
            default_package_name("nota/../../etc/passwd", "1"),
            "nota_.._.._etc_passwd-1.nota-plugin"
        );

        assert_eq!(default_package_name("..", "1"), "plugin-..-1.nota-plugin");
    }
}
