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
            .wei_zhi(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;
        let dir = self.plugins[i].manifest.dir.clone();

        let bao = package::Package::cong_directory(&dir)?;

        let (qian_ming_qu_xiang, qian_ming_yuan_wen) = match &bao.qian_ming {
            None => ("none", None),
            Some(_) => {
                let yuan_wen = std::fs::read(dir.join(package::SIGNATURE_FILE)).ok();
                match (bao.yan_qian(&package::TrustStore::load()), yuan_wen) {
                    (Ok(_), Some(yuan_wen)) => ("kept", Some(yuan_wen)),

                    _ => ("dropped", None),
                }
            }
        };

        let mut file_shu = 0usize;
        let mut zi_jie_shu = 0u64;
        let mut huan_chong = std::io::Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut huan_chong);
            let xuan_xiang = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            for f in &bao.files_2 {
                zw.start_file(f.path_3.clone(), xuan_xiang).map_err(|e| {
                    NotaError::other(format!("Could not add `{}` to the package: {e}", f.path_3))
                })?;
                zw.write_all(&f.content_2).map_err(|e| {
                    NotaError::other(format!(
                        "Could not write the contents of `{}` to the package: {e}",
                        f.path_3
                    ))
                })?;
                file_shu += 1;
                zi_jie_shu += f.content_2.len() as u64;
            }
            if let Some(yuan_wen) = &qian_ming_yuan_wen {
                zw.start_file(package::SIGNATURE_FILE, xuan_xiang)
                    .map_err(|e| {
                        NotaError::other(format!("Could not write the signature block: {e}"))
                    })?;
                zw.write_all(yuan_wen).map_err(|e| {
                    NotaError::other(format!("Could not write the signature block contents: {e}"))
                })?;
                zi_jie_shu += yuan_wen.len() as u64;
            }

            zw.finish().map_err(|e| {
                NotaError::other(format!(
                    "Could not finish the package central directory: {e}"
                ))
            })?;
        }

        let da_bao_ok = huan_chong.into_inner();

        if let Some(fu) = target_2.parent() {
            if !fu.as_os_str().is_empty() {
                crate::paths::ensure_dir(fu)?;
            }
        }
        std::fs::write(target_2, &da_bao_ok).map_err(|source| NotaError::Write {
            path: target_2.to_path_buf(),
            source,
        })?;

        Ok(ExportReport {
            id: id.to_owned(),
            files: file_shu,
            bytes: zi_jie_shu,
            signature: qian_ming_qu_xiang.to_owned(),
            path: crate::paths::path_to_string(target_2)?,
        })
    }

    pub fn default_export_name(&self, id: &str) -> Result<String> {
        let i = self
            .wei_zhi(id)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {id}")))?;
        let m = &self.plugins[i].manifest.meta;
        Ok(default_bao_ming(id, &m.version))
    }
}

fn default_bao_ming(id: &str, ban_ben: &str) -> String {
    format!(
        "{}-{}{}",
        crate::paths::an_fulldocument_jian_ming(id),
        ban_ben,
        package::PACKAGE_EXTENSION
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zao_directory(ming: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nota-\u{5bfc}\u{51fa}-{ming}-{}",
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

    fn da_ge_bao(directory_2: &Path, dai_qian_ming: bool) -> Vec<u8> {
        let bao = package::Package::cong_directory(directory_2).unwrap();
        let mut huan_chong = std::io::Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut huan_chong);
            let xuan_xiang = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for f in &bao.files_2 {
                zw.start_file(f.path_3.clone(), xuan_xiang).unwrap();
                zw.write_all(&f.content_2).unwrap();
            }
            if dai_qian_ming {
                let yuan_wen = std::fs::read(directory_2.join(package::SIGNATURE_FILE)).unwrap();
                zw.start_file(package::SIGNATURE_FILE, xuan_xiang).unwrap();
                zw.write_all(&yuan_wen).unwrap();
            }
            zw.finish().unwrap();
        }
        huan_chong.into_inner()
    }

    #[test]
    fn export_de_bao_neng_bei_zi_ji_read_hui_lai() {
        let dir = zao_directory("\u{8bfb}\u{56de}\u{6765}");
        let bytes = da_ge_bao(&dir, false);

        let read_hui = package::Package::cong_zip(&bytes).unwrap();
        let yuan_di = package::Package::cong_directory(&dir).unwrap();

        assert_eq!(read_hui.files_2.len(), yuan_di.files_2.len());
        for (a, b) in read_hui.files_2.iter().zip(yuan_di.files_2.iter()) {
            assert_eq!(a.path_3, b.path_3);
            assert_eq!(a.content_2, b.content_2);
        }

        assert_eq!(read_hui.summary(), yuan_di.summary());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn zhong_wen_path_yuan_yang_jin_chu() {
        let dir = zao_directory("\u{4e2d}\u{6587}");
        let bytes = da_ge_bao(&dir, false);
        let read_hui = package::Package::cong_zip(&bytes).unwrap();
        assert!(
            read_hui
                .files_2
                .iter()
                .any(|f| f.path_3 == "lua/\u{5de5}\u{5177}.lua"),
            "\u{8bfb}\u{56de}\u{6765}\u{7684}\u{8def}\u{5f84}\u{662f}\u{ff1a}{:?}",
            read_hui
                .files_2
                .iter()
                .map(|f| &f.path_3)
                .collect::<Vec<_>>()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn receive_directory_tiao_guo_fu_hao_lian_jie() {
        let dir = zao_directory("\u{94fe}\u{63a5}");
        let target_2 = dir.join("\u{771f}\u{5b9e}.lua");
        std::fs::write(&target_2, "return 1\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target_2, dir.join("\u{94fe}\u{63a5}.lua")).unwrap();

        let bao = package::Package::cong_directory(&dir).unwrap();
        assert!(!bao
            .files_2
            .iter()
            .any(|f| f.path_3 == "\u{94fe}\u{63a5}.lua"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_bao_ming_yong_id_er_bu_shi_zhong_wen_name() {
        assert_eq!(
            default_bao_ming("nota.ai", "0.1.0"),
            "nota.ai-0.1.0.nota-plugin"
        );

        assert_eq!(
            default_bao_ming("nota.git", "0.0.9"),
            "nota.git-0.0.9.nota-plugin"
        );
    }

    #[test]
    fn default_bao_ming_ba_dai_xie_gang_de_id_gui_yi() {
        assert_eq!(
            default_bao_ming("nota/../../etc/passwd", "1"),
            "nota_.._.._etc_passwd-1.nota-plugin"
        );

        assert_eq!(default_bao_ming("..", "1"), "plugin-..-1.nota-plugin");
    }
}
