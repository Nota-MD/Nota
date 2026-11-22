use std::path::{Path, PathBuf};

use crate::error::{io_message, NotaError, Result};

pub fn yi_dong(cong: &Path, dao: &Path) -> Result<()> {
    if tong_yi_ge_file(cong, dao) {
        return Ok(());
    }

    let metadata_2 = std::fs::symlink_metadata(cong).map_err(|e| {
        NotaError::other(format!(
            "Could not inspect {}: {}",
            cong.display(),
            io_message(&e)
        ))
    })?;
    if metadata_2.is_dir() {
        return Err(NotaError::other(format!(
            "\"{}\" is a folder; Nota only moves files",
            cong.display()
        )));
    }

    if dao.symlink_metadata().is_ok() {
        return Err(NotaError::other(format!(
            "\"{}\" already exists; choose another name",
            dao.display()
        )));
    }

    if let Some(fu) = dao.parent() {
        if !fu.as_os_str().is_empty() {
            crate::paths::ensure_dir(fu)?;
        }
    }

    match std::fs::rename(cong, dao) {
        Ok(()) => Ok(()),

        Err(e) if shi_kua_she_bei(&e) => huan_she_bei_ban(cong, dao),
        Err(e) => Err(NotaError::other(format!(
            "Could not move \"{}\" to \"{}\": {}",
            cong.display(),
            dao.display(),
            io_message(&e)
        ))),
    }
}

fn tong_yi_ge_file(jia_4: &Path, yi_2: &Path) -> bool {
    match (std::fs::canonicalize(jia_4), std::fs::canonicalize(yi_2)) {
        (Ok(a), Ok(b)) => a == b,
        _ => jia_4 == yi_2,
    }
}

fn shi_kua_she_bei(e: &std::io::Error) -> bool {
    matches!(e.kind(), std::io::ErrorKind::CrossesDevices)
}

fn huan_she_bei_ban(cong: &Path, dao: &Path) -> Result<()> {
    let temp_2 = temp_target(dao);

    if let Err(e) = std::fs::copy(cong, &temp_2) {
        let _ = std::fs::remove_file(&temp_2);
        return Err(NotaError::other(format!(
            "Could not copy \"{}\" to \"{}\": {}",
            cong.display(),
            dao.display(),
            io_message(&e)
        )));
    }

    if let Err(e) = std::fs::rename(&temp_2, dao) {
        let _ = std::fs::remove_file(&temp_2);
        return Err(NotaError::other(format!(
            "\"{}\" was copied but could not be renamed to \"{}\": {}",
            cong.display(),
            dao.display(),
            io_message(&e)
        )));
    }

    if let Err(e) = std::fs::remove_file(cong) {
        return Err(NotaError::other(format!(
            "Copied to \"{}\", but the original \"{}\" could not be deleted ({}). Both files remain; delete one manually.",
            dao.display(),
            cong.display(),
            io_message(&e)
        )));
    }
    Ok(())
}

fn temp_target(dao: &Path) -> PathBuf {
    let ming = dao
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    dao.with_file_name(format!(".{ming}.nota-move{}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct ShaHe(PathBuf);

    impl ShaHe {
        fn xin(ming: &str) -> Self {
            let di_2 =
                std::env::temp_dir().join(format!("nota-\u{632a}-{}-{ming}", std::process::id()));
            let _ = std::fs::remove_dir_all(&di_2);
            std::fs::create_dir_all(&di_2).unwrap();
            Self(di_2)
        }

        fn path_3(&self, ming: &str) -> PathBuf {
            self.0.join(ming)
        }

        fn write_2(&self, ming: &str, content_2: &str) -> PathBuf {
            let p = self.path_3(ming);
            std::fs::write(&p, content_2).unwrap();
            p
        }
    }

    impl Drop for ShaHe {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn move_to_zhi_hou_source_mei_le_target_zai_content_yi_yang() {
        let he = ShaHe::xin("\u{57fa}\u{672c}");
        let cong = he.write_2("\u{65e7}.md", "\u{6b63}\u{6587}");
        let dao = he.path_3("\u{65b0}.md");

        yi_dong(&cong, &dao).unwrap();

        assert!(!cong.exists(), "\u{6e90}\u{5e94}\u{5f53}\u{6ca1}\u{4e86}");
        assert_eq!(std::fs::read_to_string(&dao).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn target_yi_jing_zai_le_jiu_ju_jue_er_qie_yi_ge_zi_jie_dou_bu_dong() {
        let he = ShaHe::xin("\u{522b}\u{8986}\u{76d6}");
        let cong = he.write_2("\u{7532}.md", "\u{7532}\u{7684}\u{6b63}\u{6587}");
        let dao = he.write_2("\u{4e59}.md", "\u{4e59}\u{7684}\u{6b63}\u{6587}");

        let cuo = yi_dong(&cong, &dao).unwrap_err().to_string();

        assert!(
            cuo.contains("already exists"),
            "expected a clear conflict reason: {cuo}"
        );
        assert_eq!(
            std::fs::read_to_string(&cong).unwrap(),
            "\u{7532}\u{7684}\u{6b63}\u{6587}"
        );
        assert_eq!(
            std::fs::read_to_string(&dao).unwrap(),
            "\u{4e59}\u{7684}\u{6b63}\u{6587}",
            "\u{76ee}\u{6807}\u{4e00}\u{4e2a}\u{5b57}\u{90fd}\u{4e0d}\u{8bb8}\u{53d8}"
        );
    }

    #[test]
    fn target_shi_yi_tiao_huai_lian_jie_ye_suan_yi_jing_zai_le() {
        let he = ShaHe::xin("\u{574f}\u{94fe}\u{63a5}");
        let cong = he.write_2("\u{7532}.md", "\u{7532}\u{7684}\u{6b63}\u{6587}");
        let dao = he.path_3("\u{574f}.md");
        std::os::unix::fs::symlink(
            he.path_3("\u{538b}\u{6839}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}"),
            &dao,
        )
        .unwrap();

        yi_dong(&cong, &dao).unwrap_err();

        assert!(
            cong.exists(),
            "\u{62d2}\u{7edd}\u{4e4b}\u{540e}\u{6e90}\u{8981}\u{8fd8}\u{5728}"
        );
        assert!(
            dao.symlink_metadata().is_ok(),
            "\u{90a3}\u{6761}\u{94fe}\u{63a5}\u{4e5f}\u{8981}\u{8fd8}\u{5728}"
        );
    }

    #[test]
    fn target_jiu_shi_source_zi_ji_de_shi_hou_shen_me_dou_bu_zuo() {
        let he = ShaHe::xin("\u{6ca1}\u{6539}\u{540d}");
        let cong = he.write_2("\u{7532}.md", "\u{6b63}\u{6587}");

        yi_dong(&cong, &cong).unwrap();
        assert_eq!(std::fs::read_to_string(&cong).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn tong_yi_ge_file_de_ling_yi_zhong_write_fa_ye_suan_mei_gai_ming() {
        let he = ShaHe::xin("\u{522b}\u{540d}");
        let cong = he.write_2("\u{7532}.md", "\u{6b63}\u{6587}");
        let guai_le_ge_wan = he.0.join(".").join("\u{7532}.md");

        yi_dong(&cong, &guai_le_ge_wan).unwrap();
        assert_eq!(std::fs::read_to_string(&cong).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn source_bu_zai_le_hui_shuo_qing_shi_na_yi_ge() {
        let he = ShaHe::xin("\u{6e90}\u{6ca1}\u{4e86}");
        let cuo = yi_dong(
            &he.path_3("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}.md"),
            &he.path_3("\u{65b0}.md"),
        )
        .unwrap_err()
        .to_string();
        assert!(cuo.contains("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}.md"), "\u{9519}\u{8bef}\u{91cc}\u{8981}\u{5e26}\u{4e0a}\u{662f}\u{54ea}\u{4e2a}\u{6587}\u{4ef6}\u{ff1a}{cuo}");
    }

    #[test]
    fn file_jia_bu_nuo() {
        let he = ShaHe::xin("\u{662f}\u{76ee}\u{5f55}");
        let cong = he.path_3("\u{4e00}\u{4e2a}\u{76ee}\u{5f55}");
        std::fs::create_dir_all(&cong).unwrap();

        let cuo = yi_dong(&cong, &he.path_3("\u{65b0}\u{76ee}\u{5f55}"))
            .unwrap_err()
            .to_string();
        assert!(cuo.contains("folder"), "{cuo}");
        assert!(
            cong.is_dir(),
            "\u{6321}\u{4f4f}\u{4e4b}\u{540e}\u{76ee}\u{5f55}\u{8981}\u{8fd8}\u{5728}"
        );
    }

    #[test]
    fn target_na_yi_ceng_directory_hui_jian_chu_lai() {
        let he = ShaHe::xin("\u{5efa}\u{76ee}\u{5f55}");
        let cong = he.write_2("\u{7532}.md", "\u{6b63}\u{6587}");
        let dao = he
            .path_3("\u{5b50}")
            .join("\u{6df1}\u{4e00}\u{5c42}")
            .join("\u{7532}.md");

        yi_dong(&cong, &dao).unwrap();
        assert_eq!(std::fs::read_to_string(&dao).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn huan_she_bei_na_tiao_lu_shang_content_yu_quan_xian_dou_gen_zhe_zou() {
        use std::os::unix::fs::PermissionsExt;

        let he = ShaHe::xin("\u{642c}");
        let cong = he.write_2("\u{7532}.md", "\u{6b63}\u{6587}");

        std::fs::set_permissions(&cong, std::fs::Permissions::from_mode(0o600)).unwrap();
        let dao = he.path_3("\u{65b0}.md");

        huan_she_bei_ban(&cong, &dao).unwrap();

        assert_eq!(std::fs::read_to_string(&dao).unwrap(), "\u{6b63}\u{6587}");
        assert!(!cong.exists(), "\u{6e90}\u{8981}\u{5220}\u{6389}\u{ff08}\u{4e0d}\u{7136}\u{90a3}\u{662f}\u{300c}\u{590d}\u{5236}\u{300d}\u{4e0d}\u{662f}\u{300c}\u{632a}\u{300d}\u{ff09}");
        assert_eq!(
            std::fs::metadata(&dao).unwrap().permissions().mode() & 0o777,
            0o600
        );

        let sheng_xia_de: Vec<_> = std::fs::read_dir(&he.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("nota-\u{632a}"))
            .collect();
        assert!(sheng_xia_de.is_empty(), "\u{4e34}\u{65f6}\u{6587}\u{4ef6}\u{4e0d}\u{8be5}\u{7559}\u{4e0b}\u{ff1a}{sheng_xia_de:?}");
    }

    #[test]
    fn fu_zhi_shi_bai_shi_target_name_shang_shen_me_dou_mei_you() {
        let he = ShaHe::xin("\u{590d}\u{5236}\u{5931}\u{8d25}");
        let dao = he.path_3("\u{65b0}.md");

        huan_she_bei_ban(&he.path_3("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}.md"), &dao).unwrap_err();

        assert!(
            dao.symlink_metadata().is_err(),
            "\u{76ee}\u{6807}\u{540d}\u{4e0a}\u{4e0d}\u{8bb8}\u{51fa}\u{73b0}\u{4e1c}\u{897f}"
        );
        let sheng_xia_de: Vec<_> = std::fs::read_dir(&he.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(sheng_xia_de.is_empty(), "\u{4e34}\u{65f6}\u{6587}\u{4ef6}\u{4e5f}\u{8981}\u{6e05}\u{6389}\u{ff1a}{sheng_xia_de:?}");
    }

    #[test]
    fn kua_she_bei_de_pan_ju_ren_de_shi_error_kind_bu_shi_error_ma() {
        let e = std::io::Error::from_raw_os_error(18);
        assert!(
            shi_kua_she_bei(&e),
            "Linux \u{7684} EXDEV(18) \u{8981}\u{8ba4}\u{51fa}\u{6765}"
        );
        let bie_de = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "x");
        assert!(!shi_kua_she_bei(&bie_de));
    }

    #[test]
    fn zhen_kua_she_bei_shi_duan_dao_duan_ye_zou_de_tong() {
        use std::os::unix::fs::MetadataExt;

        let he = ShaHe::xin("\u{771f}\u{8de8}\u{8bbe}\u{5907}");
        let cong = he.write_2("\u{7532}.md", "\u{6b63}\u{6587}");

        let na_bian = PathBuf::from("/dev/shm");
        if !na_bian.is_dir() {
            eprintln!("\u{8df3}\u{8fc7}\u{ff1a}\u{8fd9}\u{53f0}\u{673a}\u{5668}\u{4e0a}\u{6ca1}\u{6709} /dev/shm");
            return;
        }
        let tong_she_bei = match (std::fs::metadata(&cong), std::fs::metadata(&na_bian)) {
            (Ok(a), Ok(b)) => a.dev() == b.dev(),
            _ => true,
        };
        if tong_she_bei {
            eprintln!("\u{8df3}\u{8fc7}\u{ff1a}/dev/shm \u{4e0e}\u{4e34}\u{65f6}\u{76ee}\u{5f55}\u{5728}\u{540c}\u{4e00}\u{4e2a}\u{8bbe}\u{5907}\u{4e0a}");
            return;
        }

        let dao = na_bian.join(format!(
            "nota-\u{632a}\u{771f}\u{8de8}-{}-\u{7532}.md",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&dao);
        let result_3 = yi_dong(&cong, &dao);
        let content_2 = std::fs::read_to_string(&dao).unwrap_or_default();
        let _ = std::fs::remove_file(&dao);

        result_3.unwrap();
        assert_eq!(content_2, "\u{6b63}\u{6587}");
        assert!(!cong.exists());
    }
}
