use std::path::Path;

use serde::Serialize;

use crate::error::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PathKind {
    Dir,

    File,

    Missing,
}

#[tauri::command]
pub fn nota_paths_kind(paths: Vec<String>) -> Result<Vec<PathKind>> {
    Ok(paths.iter().map(|p| classify_2(p)).collect())
}

fn classify_2(path_3: &str) -> PathKind {
    match std::fs::metadata(Path::new(path_3)) {
        Ok(m) if m.is_dir() => PathKind::Dir,
        Ok(_) => PathKind::File,
        Err(_) => match std::fs::symlink_metadata(Path::new(path_3)) {
            Ok(m) if m.is_dir() => PathKind::Dir,
            Ok(_) => PathKind::File,
            Err(_) => PathKind::Missing,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directory_file_bu_cun_zai_san_zhong_dou_ren_de_chu() {
        let temp_2 = std::env::temp_dir().join(format!("nota-paths-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_2);
        std::fs::create_dir_all(&temp_2).unwrap();
        let file_3 = temp_2.join("\u{4e00}\u{7bc7}.md");
        std::fs::write(&file_3, "# \u{6807}\u{9898}\n").unwrap();

        let result_3 = nota_paths_kind(vec![
            temp_2.to_string_lossy().into_owned(),
            file_3.to_string_lossy().into_owned(),
            temp_2
                .join("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}")
                .to_string_lossy()
                .into_owned(),
        ])
        .unwrap();

        assert_eq!(
            result_3,
            vec![PathKind::Dir, PathKind::File, PathKind::Missing]
        );
        let _ = std::fs::remove_dir_all(&temp_2);
    }

    #[test]
    fn kong_ru_can_gei_kong_chu_can_yi_tiao_huai_de_ye_bu_tuo_kua_zheng_pi() {
        assert!(nota_paths_kind(vec![]).unwrap().is_empty());

        let result_3 = nota_paths_kind(vec![
            "/\u{7edd}\u{5bf9}\u{4e0d}\u{5b58}\u{5728}/\u{7532}".into(),
            "/\u{7edd}\u{5bf9}\u{4e0d}\u{5b58}\u{5728}/\u{4e59}".into(),
        ])
        .unwrap();
        assert_eq!(result_3.len(), 2);
        assert!(result_3.iter().all(|k| *k == PathKind::Missing));
    }

    #[test]
    fn kua_ipc_de_qu_value_shi_ying_wen_xiao_write() {
        for (kind_2, expected_2) in [
            (PathKind::Dir, "\"dir\""),
            (PathKind::File, "\"file\""),
            (PathKind::Missing, "\"missing\""),
        ] {
            assert_eq!(serde_json::to_string(&kind_2).unwrap(), expected_2);
        }
    }
}
