use std::path::{Path, PathBuf};

use crate::error::{io_message, NotaError, Result};

pub fn one_dynamic(from: &Path, to: &Path) -> Result<()> {
    if same_one_file(from, to) {
        return Ok(());
    }

    let metadata_2 = std::fs::symlink_metadata(from).map_err(|e| {
        NotaError::other(format!(
            "Could not inspect {}: {}",
            from.display(),
            io_message(&e)
        ))
    })?;
    if metadata_2.is_dir() {
        return Err(NotaError::other(format!(
            "\"{}\" is a folder; Nota only moves files",
            from.display()
        )));
    }

    if to.symlink_metadata().is_ok() {
        return Err(NotaError::other(format!(
            "\"{}\" already exists; choose another name",
            to.display()
        )));
    }

    if let Some(service) = to.parent() {
        if !service.as_os_str().is_empty() {
            crate::paths::ensure_dir(service)?;
        }
    }

    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),

        Err(e) if is_cross_set_passive(&e) => replace_set_passive_half(from, to),
        Err(e) => Err(NotaError::other(format!(
            "Could not move \"{}\" to \"{}\": {}",
            from.display(),
            to.display(),
            io_message(&e)
        ))),
    }
}

fn same_one_file(value_4: &Path, value_2: &Path) -> bool {
    match (
        std::fs::canonicalize(value_4),
        std::fs::canonicalize(value_2),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => value_4 == value_2,
    }
}

fn is_cross_set_passive(e: &std::io::Error) -> bool {
    matches!(e.kind(), std::io::ErrorKind::CrossesDevices)
}

fn replace_set_passive_half(from: &Path, to: &Path) -> Result<()> {
    let temp_2 = temp_target(to);

    if let Err(e) = std::fs::copy(from, &temp_2) {
        let _ = std::fs::remove_file(&temp_2);
        return Err(NotaError::other(format!(
            "Could not copy \"{}\" to \"{}\": {}",
            from.display(),
            to.display(),
            io_message(&e)
        )));
    }

    if let Err(e) = std::fs::rename(&temp_2, to) {
        let _ = std::fs::remove_file(&temp_2);
        return Err(NotaError::other(format!(
            "\"{}\" was copied but could not be renamed to \"{}\": {}",
            from.display(),
            to.display(),
            io_message(&e)
        )));
    }

    if let Err(e) = std::fs::remove_file(from) {
        return Err(NotaError::other(format!(
            "Copied to \"{}\", but the original \"{}\" could not be deleted ({}). Both files remain; delete one manually.",
            to.display(),
            from.display(),
            io_message(&e)
        )));
    }
    Ok(())
}

fn temp_target(to: &Path) -> PathBuf {
    let name = to
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    to.with_file_name(format!(".{name}.nota-move{}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Sandbox(PathBuf);

    impl Sandbox {
        fn new(name: &str) -> Self {
            let data_directory_value =
                std::env::temp_dir().join(format!("nota-\u{632a}-{}-{name}", std::process::id()));
            let _ = std::fs::remove_dir_all(&data_directory_value);
            std::fs::create_dir_all(&data_directory_value).unwrap();
            Self(data_directory_value)
        }

        fn path_3(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }

        fn write_2(&self, name: &str, content_2: &str) -> PathBuf {
            let p = self.path_3(name);
            std::fs::write(&p, content_2).unwrap();
            p
        }
    }

    impl Drop for Sandbox {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn move_to_only_after_source_each_target_at_content_one_sample() {
        let sandbox = Sandbox::new("\u{57fa}\u{672c}");
        let from = sandbox.write_2("\u{65e7}.md", "\u{6b63}\u{6587}");
        let to = sandbox.path_3("\u{65b0}.md");

        one_dynamic(&from, &to).unwrap();

        assert!(!from.exists(), "\u{6e90}\u{5e94}\u{5f53}\u{6ca1}\u{4e86}");
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn target_one_static_at_old_sentence_absolute_two_cut_one_character_boundary_all_not_dynamic() {
        let sandbox = Sandbox::new("\u{522b}\u{8986}\u{76d6}");
        let from = sandbox.write_2("\u{7532}.md", "\u{7532}\u{7684}\u{6b63}\u{6587}");
        let to = sandbox.write_2("\u{4e59}.md", "\u{4e59}\u{7684}\u{6b63}\u{6587}");

        let error = one_dynamic(&from, &to).unwrap_err().to_string();

        assert!(
            error.contains("already exists"),
            "expected a clear conflict reason: {error}"
        );
        assert_eq!(
            std::fs::read_to_string(&from).unwrap(),
            "\u{7532}\u{7684}\u{6b63}\u{6587}"
        );
        assert_eq!(
            std::fs::read_to_string(&to).unwrap(),
            "\u{4e59}\u{7684}\u{6b63}\u{6587}",
            "\u{76ee}\u{6807}\u{4e00}\u{4e2a}\u{5b57}\u{90fd}\u{4e0d}\u{8bb8}\u{53d8}"
        );
    }

    #[test]
    fn target_is_one_item_broken_link_boundary_page_compute_one_static_at() {
        let sandbox = Sandbox::new("\u{574f}\u{94fe}\u{63a5}");
        let from = sandbox.write_2("\u{7532}.md", "\u{7532}\u{7684}\u{6b63}\u{6587}");
        let to = sandbox.path_3("\u{574f}.md");
        std::os::unix::fs::symlink(
            sandbox.path_3("\u{538b}\u{6839}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}"),
            &to,
        )
        .unwrap();

        one_dynamic(&from, &to).unwrap_err();

        assert!(
            from.exists(),
            "\u{62d2}\u{7edd}\u{4e4b}\u{540e}\u{6e90}\u{8981}\u{8fd8}\u{5728}"
        );
        assert!(
            to.symlink_metadata().is_ok(),
            "\u{90a3}\u{6761}\u{94fe}\u{63a5}\u{4e5f}\u{8981}\u{8fd8}\u{5728}"
        );
    }

    #[test]
    fn target_old_is_source_character_record_is_after_deep_all_not_left() {
        let sandbox = Sandbox::new("\u{6ca1}\u{6539}\u{540d}");
        let from = sandbox.write_2("\u{7532}.md", "\u{6b63}\u{6587}");

        one_dynamic(&from, &from).unwrap();
        assert_eq!(std::fs::read_to_string(&from).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn same_one_file_zero_one_middle_write_method_page_compute_each_change_name() {
        let sandbox = Sandbox::new("\u{522b}\u{540d}");
        let from = sandbox.write_2("\u{7532}.md", "\u{6b63}\u{6587}");
        let alias_path = sandbox.0.join(".").join("\u{7532}.md");

        one_dynamic(&from, &alias_path).unwrap();
        assert_eq!(std::fs::read_to_string(&from).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn source_not_at_return_say_request_is_that_one() {
        let sandbox = Sandbox::new("\u{6e90}\u{6ca1}\u{4e86}");
        let error = one_dynamic(
            &sandbox.path_3("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}.md"),
            &sandbox.path_3("\u{65b0}.md"),
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}.md"), "\u{9519}\u{8bef}\u{91cc}\u{8981}\u{5e26}\u{4e0a}\u{662f}\u{54ea}\u{4e2a}\u{6587}\u{4ef6}\u{ff1a}{error}");
    }

    #[test]
    fn file_add_not_move() {
        let sandbox = Sandbox::new("\u{662f}\u{76ee}\u{5f55}");
        let from = sandbox.path_3("\u{4e00}\u{4e2a}\u{76ee}\u{5f55}");
        std::fs::create_dir_all(&from).unwrap();

        let error = one_dynamic(&from, &sandbox.path_3("\u{65b0}\u{76ee}\u{5f55}"))
            .unwrap_err()
            .to_string();
        assert!(error.contains("folder"), "{error}");
        assert!(
            from.is_dir(),
            "\u{6321}\u{4f4f}\u{4e4b}\u{540e}\u{76ee}\u{5f55}\u{8981}\u{8fd8}\u{5728}"
        );
    }

    #[test]
    fn target_that_one_layer_directory_return_check_out_incoming() {
        let sandbox = Sandbox::new("\u{5efa}\u{76ee}\u{5f55}");
        let from = sandbox.write_2("\u{7532}.md", "\u{6b63}\u{6587}");
        let to = sandbox
            .path_3("\u{5b50}")
            .join("\u{6df1}\u{4e00}\u{5c42}")
            .join("\u{7532}.md");

        one_dynamic(&from, &to).unwrap();
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "\u{6b63}\u{6587}");
    }

    #[test]
    fn replace_set_passive_that_item_path_upper_content_and_full_thread_all_root_walk() {
        use std::os::unix::fs::PermissionsExt;

        let sandbox = Sandbox::new("\u{642c}");
        let from = sandbox.write_2("\u{7532}.md", "\u{6b63}\u{6587}");

        std::fs::set_permissions(&from, std::fs::Permissions::from_mode(0o600)).unwrap();
        let to = sandbox.path_3("\u{65b0}.md");

        replace_set_passive_half(&from, &to).unwrap();

        assert_eq!(std::fs::read_to_string(&to).unwrap(), "\u{6b63}\u{6587}");
        assert!(!from.exists(), "\u{6e90}\u{8981}\u{5220}\u{6389}\u{ff08}\u{4e0d}\u{7136}\u{90a3}\u{662f}\u{300c}\u{590d}\u{5236}\u{300d}\u{4e0d}\u{662f}\u{300c}\u{632a}\u{300d}\u{ff09}");
        assert_eq!(
            std::fs::metadata(&to).unwrap().permissions().mode() & 0o777,
            0o600
        );

        let leftovers: Vec<_> = std::fs::read_dir(&sandbox.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("nota-\u{632a}"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "\u{4e34}\u{65f6}\u{6587}\u{4ef6}\u{4e0d}\u{8be5}\u{7559}\u{4e0b}\u{ff1a}{leftovers:?}"
        );
    }

    #[test]
    fn service_only_is_percent_is_target_name_upper_deep_all_each_has() {
        let sandbox = Sandbox::new("\u{590d}\u{5236}\u{5931}\u{8d25}");
        let to = sandbox.path_3("\u{65b0}.md");

        replace_set_passive_half(&sandbox.path_3("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}.md"), &to)
            .unwrap_err();

        assert!(
            to.symlink_metadata().is_err(),
            "\u{76ee}\u{6807}\u{540d}\u{4e0a}\u{4e0d}\u{8bb8}\u{51fa}\u{73b0}\u{4e1c}\u{897f}"
        );
        let leftovers: Vec<_> = std::fs::read_dir(&sandbox.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            leftovers.is_empty(),
            "\u{4e34}\u{65f6}\u{6587}\u{4ef6}\u{4e5f}\u{8981}\u{6e05}\u{6389}\u{ff1a}{leftovers:?}"
        );
    }

    #[test]
    fn cross_set_passive_parse_sentence_person_is_error_kind_not_is_error() {
        let e = std::io::Error::from_raw_os_error(18);
        assert!(
            is_cross_set_passive(&e),
            "Linux \u{7684} EXDEV(18) \u{8981}\u{8ba4}\u{51fa}\u{6765}"
        );
        let other = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "x");
        assert!(!is_cross_set_passive(&other));
    }

    #[test]
    fn real_cross_set_passive_is_segment_to_segment_page_walk_same() {
        use std::os::unix::fs::MetadataExt;

        let sandbox = Sandbox::new("\u{771f}\u{8de8}\u{8bbe}\u{5907}");
        let from = sandbox.write_2("\u{7532}.md", "\u{6b63}\u{6587}");

        let that_edit = PathBuf::from("/dev/shm");
        if !that_edit.is_dir() {
            eprintln!("\u{8df3}\u{8fc7}\u{ff1a}\u{8fd9}\u{53f0}\u{673a}\u{5668}\u{4e0a}\u{6ca1}\u{6709} /dev/shm");
            return;
        }
        let same_set_passive = match (std::fs::metadata(&from), std::fs::metadata(&that_edit)) {
            (Ok(a), Ok(b)) => a.dev() == b.dev(),
            _ => true,
        };
        if same_set_passive {
            eprintln!("\u{8df3}\u{8fc7}\u{ff1a}/dev/shm \u{4e0e}\u{4e34}\u{65f6}\u{76ee}\u{5f55}\u{5728}\u{540c}\u{4e00}\u{4e2a}\u{8bbe}\u{5907}\u{4e0a}");
            return;
        }

        let to = that_edit.join(format!(
            "nota-\u{632a}\u{771f}\u{8de8}-{}-\u{7532}.md",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&to);
        let result_3 = one_dynamic(&from, &to);
        let content_2 = std::fs::read_to_string(&to).unwrap_or_default();
        let _ = std::fs::remove_file(&to);

        result_3.unwrap();
        assert_eq!(content_2, "\u{6b63}\u{6587}");
        assert!(!from.exists());
    }
}
