use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, NotaError>;

#[derive(Debug, thiserror::Error)]
pub enum NotaError {
    #[error("Could not read {path}: {}", io_message(source))]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Could not write {path}: {}", io_message(source))]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Could not delete {path}: {}", io_message(source))]
    Delete {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Path is not valid UTF-8: {0}")]
    NonUtf8Path(PathBuf),

    #[error("Could not locate the user directory through $HOME or $XDG_CONFIG_HOME")]
    NoHomeDir,

    #[error("Could not access configuration: {0}")]
    Config(String),

    #[error("Invalid extension manifest ({file}): {reason}")]
    Manifest { file: PathBuf, reason: String },

    #[error("Extension {id} requires API {wanted}, but the host provides {have}")]
    PluginApiMismatch {
        id: String,
        wanted: String,
        have: String,
    },

    #[error("Lua error in extension {plugin}: {message}")]
    Lua { plugin: String, message: String },

    #[error("There is no active document")]
    NoActiveDocument,

    #[error("{0}")]
    Other(String),
}

pub(crate) fn io_message(error: &std::io::Error) -> String {
    use std::io::ErrorKind as K;
    match error.kind() {
        K::NotFound => "Path does not exist".to_string(),
        K::PermissionDenied => "Permission denied".to_string(),
        K::InvalidData => "Content is not valid UTF-8 text".to_string(),
        K::IsADirectory => "The path is a directory, not a file".to_string(),
        K::AlreadyExists => "A file with this name already exists".to_string(),
        K::StorageFull => "Not enough disk space".to_string(),
        _ => error.to_string(),
    }
}

impl NotaError {
    pub fn other(msg: impl Into<String>) -> Self {
        NotaError::Other(msg.into())
    }
}

impl serde::Serialize for NotaError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::ErrorKind;

    #[test]
    fn known_io_errors_are_localized_to_english() {
        let cases = [
            (ErrorKind::NotFound, "Path does not exist"),
            (ErrorKind::PermissionDenied, "Permission denied"),
            (ErrorKind::InvalidData, "Content is not valid UTF-8 text"),
            (
                ErrorKind::IsADirectory,
                "The path is a directory, not a file",
            ),
        ];
        for (kind, want) in cases {
            let e = std::io::Error::new(kind, "whatever");
            assert_eq!(io_message(&e), want, "unexpected message for {kind:?}");
        }
    }

    #[test]
    fn unknown_io_errors_keep_the_original_message() {
        let e = std::io::Error::new(ErrorKind::Other, "some exotic failure");
        assert_eq!(io_message(&e), "some exotic failure");

        let full_error = NotaError::Read {
            path: PathBuf::from("/tmp/x.md"),
            source: std::io::Error::new(ErrorKind::NotFound, "nope"),
        };
        let message = full_error.to_string();
        assert!(message.contains("/tmp/x.md"), "path is missing: {message}");
        assert!(
            message.contains("Path does not exist"),
            "message is missing: {message}"
        );
        assert!(!message.contains("nope"), "raw OS text leaked: {message}");
    }
}
