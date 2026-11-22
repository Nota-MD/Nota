use std::path::{Path, PathBuf};

pub const DESKTOP_FILE: &str = "nota-url-handler.desktop";

pub const SCHEME: &str = "nota";

pub fn zhuo_mian_xiang_content(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Nota\n\
         Comment=Open Markdown notes in Nota\n\
         Exec=\"{}\" %u\n\
         Terminal=false\n\
         NoDisplay=true\n\
         Categories=Utility;\n\
         MimeType=x-scheme-handler/{SCHEME};\n",
        exe.display()
    )
}

pub fn zhuo_mian_xiang_path() -> crate::error::Result<PathBuf> {
    let di_2 = dirs::data_dir().ok_or(crate::error::NotaError::NoHomeDir)?;
    Ok(di_2.join("applications").join(DESKTOP_FILE))
}

pub fn yao_zhong_write_ma(xian_you: Option<&str>, xin: &str) -> bool {
    match xian_you {
        Some(s) => s != xin,
        None => true,
    }
}

pub fn guan_lian_args() -> Vec<String> {
    vec![
        "default".to_owned(),
        DESKTOP_FILE.to_owned(),
        format!("x-scheme-handler/{SCHEME}"),
    ]
}

pub fn zhu_ce() {
    match zhu_ce_nei_bu() {
        Ok(()) => {}
        Err(e) => {
            crate::debug_log!("[nota] failed to register nota:// handler (startup continues): {e}")
        }
    }
}

fn zhu_ce_nei_bu() -> crate::error::Result<()> {
    use crate::error::NotaError;

    let exe = std::env::current_exe()
        .map_err(|e| NotaError::Other(format!("Could not determine the executable path: {e}")))?;
    let xiang_yao = zhuo_mian_xiang_content(&exe);
    let target_3 = zhuo_mian_xiang_path()?;

    let xian_you = std::fs::read_to_string(&target_3).ok();
    if !yao_zhong_write_ma(xian_you.as_deref(), &xiang_yao) {
        return Ok(());
    }

    if let Some(fu) = target_3.parent() {
        crate::paths::ensure_dir(fu)?;
    }
    std::fs::write(&target_3, xiang_yao).map_err(|e| NotaError::Write {
        path: target_3.clone(),
        source: e,
    })?;
    crate::debug_log!("[nota] wrote desktop entry {}", target_3.display());

    match crate::proc::background_command("xdg-mime")
        .args(guan_lian_args())
        .status()
    {
        Ok(zhuang) if zhuang.success() => {
            crate::debug_log!("[nota] associated nota:// with {DESKTOP_FILE}")
        }
        Ok(zhuang) => crate::debug_log!(
            "[nota] xdg-mime exited with {:?}; association failed",
            zhuang.code()
        ),
        Err(e) => crate::debug_log!(
            "[nota] could not start xdg-mime ({e}); desktop entry written without association"
        ),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zhuo_mian_xiang_li_gai_you_de_na_ji_jian_dou_zai() {
        let wen = zhuo_mian_xiang_content(Path::new("/usr/bin/nota"));
        assert!(wen.contains("MimeType=x-scheme-handler/nota;"), "\u{8ba4}\u{4e0d}\u{8ba4}\u{8fd9}\u{4e2a}\u{534f}\u{8bae}\u{5168}\u{9760}\u{8fd9}\u{4e00}\u{884c}");
        assert!(
            wen.contains("Exec=\"/usr/bin/nota\" %u"),
            "\u{600e}\u{4e48}\u{8d77}\u{3001}\u{53c2}\u{6570}\u{653e}\u{54ea}\u{513f}"
        );
        assert!(
            wen.starts_with("[Desktop Entry]\n"),
            "\u{7b2c}\u{4e00}\u{884c}\u{5fc5}\u{987b}\u{662f}\u{7ec4}\u{540d}"
        );
        assert!(wen.contains("Type=Application"), "\u{5c11}\u{4e86}\u{5b83}\u{4e0d}\u{5c11}\u{684c}\u{9762}\u{73af}\u{5883}\u{76f4}\u{63a5}\u{4e0d}\u{8ba4}\u{8fd9}\u{4e2a}\u{6587}\u{4ef6}");
    }

    #[test]
    fn ke_zhi_xing_file_path_dai_kong_ge_ye_yao_yin_qi_lai() {
        let wen = zhuo_mian_xiang_content(Path::new("/opt/my apps/nota"));
        assert!(wen.contains("Exec=\"/opt/my apps/nota\" %u"));
    }

    #[test]
    fn args_zhan_wei_fu_shi_dan_ge_u() {
        let wen = zhuo_mian_xiang_content(Path::new("/usr/bin/nota"));
        assert!(wen.contains(" %u\n"), "\u{5360}\u{4f4d}\u{7b26}\u{540e}\u{9762}\u{90a3}\u{4e00}\u{884c}\u{662f}\u{6211}\u{4eec}\u{81ea}\u{5df1}\u{7684}\u{6362}\u{884c}\u{ff0c}\u{7528}\u{6765}\u{9489}\u{4f4f}\u{5b83}\u{6ca1}\u{88ab}\u{5199}\u{6210}\u{522b}\u{7684}");
        assert!(!wen.contains("%U"));
    }

    #[test]
    fn content_yi_yang_jiu_bu_zhong_write() {
        let wen = zhuo_mian_xiang_content(Path::new("/usr/bin/nota"));
        assert!(!yao_zhong_write_ma(Some(&wen), &wen));
        assert!(
            yao_zhong_write_ma(None, &wen),
            "\u{6ca1}\u{6709}\u{8fd9}\u{4e00}\u{4efd}\u{ff0c}\u{8981}\u{5199}"
        );
        assert!(
            yao_zhong_write_ma(Some("[Desktop Entry]\nName=\u{522b}\u{7684}\n"), &wen),
            "\u{522b}\u{4eba}\u{5360}\u{4e86}\u{8fd9}\u{4e2a}\u{540d}\u{5b57}\u{4e5f}\u{8981}\u{6539}\u{5199}\u{5b83}\u{ff08}\u{90a3}\u{662f}\u{6211}\u{4eec}\u{81ea}\u{5df1}\u{7684}\u{6587}\u{4ef6}\u{540d}\u{ff0c}\u{89c1}\u{6587}\u{4ef6}\u{5934}\u{ff09}"
        );
    }

    #[test]
    fn xdgmime_de_args_shun_xu_shi_default_zai_qian() {
        let can_2 = guan_lian_args();
        assert_eq!(can_2[0], "default");
        assert_eq!(can_2[1], DESKTOP_FILE);
        assert_eq!(can_2[2], "x-scheme-handler/nota");
    }

    #[test]
    fn xie_yi_ming_yu_cli_na_bian_shuo_ok_de_shi_tong_yi_ge() {
        assert_eq!(SCHEME, "nota");
        assert!(crate::cli::is_nota_link(&format!(
            "{SCHEME}://open?path=%2Ftmp%2Fa.md"
        )));
    }
}
