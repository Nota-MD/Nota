use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::installed::Signature;

pub use super::trust::*;
use crate::error::{NotaError, Result};

pub const PACKAGE_EXTENSION: &str = ".nota-plugin";

pub const SIGNATURE_FILE: &str = "nota-signature.toml";

pub const MANIFEST_FILE: &str = "plugin.toml";

const ZONG_SHANG_XIAN: u64 = 32 * 1024 * 1024;
const DAN_FILE_SHANG_XIAN: u64 = 16 * 1024 * 1024;
const TIAO_MU_SHANG_XIAN: usize = 2048;

const NAME_SHANG_XIAN: usize = 512;

#[derive(Debug, Clone)]
pub struct PackageFile {
    pub path_3: String,
    pub content_2: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct PackageSignature {
    pub algorithm: String,

    pub key_id: String,
    pub public_key: [u8; 32],
    pub signature: [u8; 64],
    pub signed_at: String,
}

#[derive(Debug, Clone)]
pub struct Package {
    pub files_2: Vec<PackageFile>,
    pub qian_ming: Option<PackageSignature>,
}

impl Package {
    pub fn cong_zip(bytes: &[u8]) -> Result<Self> {
        let mut ar = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| {
            NotaError::other(format!("This is not a readable extension package: {e}"))
        })?;

        if ar.len() > TIAO_MU_SHANG_XIAN {
            return Err(NotaError::other(format!(
                "The package has too many entries ({}; limit {TIAO_MU_SHANG_XIAN})",
                ar.len()
            )));
        }

        let mut files_2 = Vec::new();
        let mut zong: u64 = 0;

        for i in 0..ar.len() {
            let mut e = ar.by_index(i).map_err(|e| {
                NotaError::other(format!("Could not read package entry {}: {e}", i + 1))
            })?;
            if e.is_dir() {
                continue;
            }
            let path_3 = path_he_fa_ma(e.name())?;

            let mut content_2 = Vec::new();

            e.by_ref()
                .take(DAN_FILE_SHANG_XIAN + 1)
                .read_to_end(&mut content_2)
                .map_err(|e| {
                    NotaError::other(format!(
                        "Could not extract `{path_3}` from the package: {e}"
                    ))
                })?;
            if content_2.len() as u64 > DAN_FILE_SHANG_XIAN {
                return Err(NotaError::other(format!(
                    "Package entry `{path_3}` exceeds {DAN_FILE_SHANG_XIAN} bytes"
                )));
            }

            zong += content_2.len() as u64;
            if zong > ZONG_SHANG_XIAN {
                return Err(NotaError::other(format!(
                    "The extracted package exceeds {ZONG_SHANG_XIAN} bytes and was rejected"
                )));
            }
            files_2.push(PackageFile { path_3, content_2 });
        }

        Self::cong_files(files_2)
    }

    pub fn cong_directory(root: &Path) -> Result<Self> {
        let mut files_2 = Vec::new();
        let mut zong: u64 = 0;
        receive_directory(root, root, &mut files_2, &mut zong)?;
        Self::cong_files(files_2)
    }

    fn cong_files(mut files_2: Vec<PackageFile>) -> Result<Self> {
        let qian_ming = match files_2.iter().position(|f| f.path_3 == SIGNATURE_FILE) {
            None => None,
            Some(i) => {
                let f = files_2.remove(i);
                let text = String::from_utf8(f.content_2)
                    .map_err(|_| NotaError::other("The signature block is not UTF-8 text"))?;
                Some(read_qian_ming(&text)?)
            }
        };
        files_2.sort_by(|a, b| a.path_3.cmp(&b.path_3));
        Ok(Self { files_2, qian_ming })
    }

    pub fn summary(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        for f in &self.files_2 {
            h.update(f.path_3.as_bytes());
            h.update([0u8]);
            h.update(Sha256::digest(&f.content_2));
        }
        h.finalize().into()
    }

    pub fn zhao(&self, path_3: &str) -> Option<&[u8]> {
        self.files_2
            .iter()
            .find(|f| f.path_3 == path_3)
            .map(|f| f.content_2.as_slice())
    }

    pub fn yan_qian(&self, trust_store: &TrustStore) -> Result<Signature> {
        let Some(sig) = &self.qian_ming else {
            return Ok(Signature::Unsigned);
        };

        if sig.algorithm != "ed25519" {
            return Err(NotaError::other(format!(
                "Unsupported signature algorithm `{}`; only Ed25519 is accepted",
                sig.algorithm
            )));
        }

        let key = ed25519_dalek::VerifyingKey::from_bytes(&sig.public_key).map_err(|e| {
            NotaError::other(format!("Invalid public key in the signature block: {e}"))
        })?;

        key.verify_strict(
            &self.summary(),
            &ed25519_dalek::Signature::from_bytes(&sig.signature),
        )
        .map_err(|_| {
            NotaError::other(
                "Signature verification failed; the package was modified after signing or the signature block is invalid."
                    .to_owned(),
            )
        })?;

        let zhen_fingerprint = super::installed::gong_yao_fingerprint(&sig.public_key);
        if zhen_fingerprint != sig.key_id {
            return Err(NotaError::other(format!(
                "Signature key_id (`{}`) does not match the public key (`{zhen_fingerprint}`)",
                sig.key_id
            )));
        }

        Ok(if trust_store.contains(&zhen_fingerprint) {
            Signature::Verified
        } else {
            Signature::Unknown
        })
    }
}

impl PackageSignature {
    pub fn gong_yao_base64(&self) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(self.public_key)
    }
}

fn receive_directory(
    root: &Path,
    dir: &Path,
    out: &mut Vec<PackageFile>,
    zong: &mut u64,
) -> Result<()> {
    let entries = std::fs::read_dir(dir).map_err(|source| NotaError::Read {
        path: dir.to_path_buf(),
        source,
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        let ty = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        if ty.is_symlink() {
            continue;
        }

        if ty.is_dir() {
            receive_directory(root, &path, out, zong)?;
            continue;
        }
        if !ty.is_file() {
            continue;
        }

        let xiang_dui = path.strip_prefix(root).map_err(|_| {
            NotaError::other(format!(
                "{} is not inside the extension directory",
                path.display()
            ))
        })?;
        let ming = xiang_dui.to_string_lossy().replace('\\', "/");
        let path_3 = path_he_fa_ma(&ming)?;

        let content_2 = std::fs::read(&path).map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?;
        if content_2.len() as u64 > DAN_FILE_SHANG_XIAN {
            return Err(NotaError::other(format!(
                "`{path_3}` exceeds {DAN_FILE_SHANG_XIAN} bytes"
            )));
        }

        if *zong > ZONG_SHANG_XIAN {
            return Err(NotaError::other(format!(
                "The extension directory exceeds {ZONG_SHANG_XIAN} bytes and was rejected"
            )));
        }
        out.push(PackageFile { path_3, content_2 });
    }

    if out.len() > TIAO_MU_SHANG_XIAN {
        return Err(NotaError::other(format!(
            "Too many files (limit {TIAO_MU_SHANG_XIAN})"
        )));
    }
    Ok(())
}

pub fn path_he_fa_ma(ming: &str) -> Result<String> {
    let ming = ming.replace('\\', "/");
    let ming = ming.trim_end_matches('/').to_owned();

    if ming.is_empty() {
        return Err(NotaError::other("The package contains an empty path"));
    }
    if ming.len() > NAME_SHANG_XIAN {
        return Err(NotaError::other(format!(
            "The package contains an overlong path ({} bytes)",
            ming.len()
        )));
    }
    if ming.starts_with('/') || ming.contains(':') {
        return Err(NotaError::other(format!(
            "Package path `{ming}` is absolute or includes a drive prefix"
        )));
    }
    for duan in ming.split('/') {
        if duan.is_empty() || duan == "." || duan == ".." {
            return Err(NotaError::other(format!(
                "Package path `{ming}` contains `.`, `..`, or an empty segment"
            )));
        }
    }
    Ok(ming)
}

fn read_qian_ming(text: &str) -> Result<PackageSignature> {
    #[derive(Deserialize)]
    struct SignatureFile {
        signature: SignatureData,
    }
    #[derive(Deserialize)]
    struct SignatureData {
        #[serde(default = "default_suan_fa")]
        algorithm: String,
        key_id: String,
        public_key: String,
        signature: String,
        #[serde(default)]
        signed_at: String,
    }
    fn default_suan_fa() -> String {
        "ed25519".to_owned()
    }

    let f: SignatureFile = toml::from_str(text).map_err(|e| {
        NotaError::other(format!(
            "Could not read the signature block; a `[signature]` section is required: {e}"
        ))
    })?;

    let jie_2 = |s: &str, yao: usize, ming: &str| -> Result<Vec<u8>> {
        use base64::Engine;
        let v = base64::engine::general_purpose::STANDARD
            .decode(s.trim())
            .map_err(|e| {
                NotaError::other(format!("Signature field `{ming}` is not valid base64: {e}"))
            })?;
        if v.len() != yao {
            return Err(NotaError::other(format!(
                "Signature field `{ming}` must be {yao} bytes, received {}",
                v.len()
            )));
        }
        Ok(v)
    };

    let pk = jie_2(&f.signature.public_key, 32, "public_key")?;
    let sg = jie_2(&f.signature.signature, 64, "signature")?;

    let mut public_key = [0u8; 32];
    public_key.copy_from_slice(&pk);
    let mut signature = [0u8; 64];
    signature.copy_from_slice(&sg);

    Ok(PackageSignature {
        algorithm: f.signature.algorithm,
        key_id: f.signature.key_id,
        public_key,
        signature,
        signed_at: f.signature.signed_at,
    })
}

pub fn read_yi_ge_bao(path: &Path) -> Result<Package> {
    if path.is_dir() {
        return Package::cong_directory(path);
    }
    let bytes = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    Package::cong_zip(&bytes)
}

pub fn xiang_bao_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("nota-plugin") | Some("zip")
    )
}

pub fn pin_target(target_2: &Path, path_3: &str) -> PathBuf {
    target_2.join(path_3)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer;

    fn da_ge_bao(zai_he: &[(&str, &str)]) -> (Vec<(String, Vec<u8>)>, String, String) {
        use base64::Engine;
        use sha2::{Digest, Sha256};

        let key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let pk = key.verifying_key().to_bytes();

        let mut you_xu: Vec<(String, Vec<u8>)> = zai_he
            .iter()
            .map(|(p, c)| ((*p).to_owned(), c.as_bytes().to_vec()))
            .collect();
        you_xu.sort_by(|a, b| a.0.cmp(&b.0));

        let mut h = Sha256::new();
        for (p, c) in &you_xu {
            h.update(p.as_bytes());
            h.update([0u8]);
            h.update(Sha256::digest(c));
        }
        let summary: [u8; 32] = h.finalize().into();
        let sig = key.sign(&summary).to_bytes();

        let fingerprint_2 = super::super::installed::gong_yao_fingerprint(&pk);
        let qian_ming_kuai = format!(
            "[signature]\nalgorithm = \"ed25519\"\nkey_id = \"{fingerprint_2}\"\n\
             public_key = \"{}\"\nsignature = \"{}\"\nsigned_at = \"2026-09-24\"\n",
            base64::engine::general_purpose::STANDARD.encode(pk),
            base64::engine::general_purpose::STANDARD.encode(sig),
        );
        (you_xu, qian_ming_kuai, fingerprint_2)
    }

    fn dai_qian_ming_de_bao(zai_he: &[(&str, &str)]) -> (Package, String) {
        let (mut files_2, qian_ming_kuai, fingerprint_2) = da_ge_bao(zai_he);
        let files_2: Vec<PackageFile> = files_2
            .drain(..)
            .map(|(path_3, content_2)| PackageFile { path_3, content_2 })
            .collect();
        (
            Package::cong_files({
                let mut v = files_2;
                v.push(PackageFile {
                    path_3: SIGNATURE_FILE.to_owned(),
                    content_2: qian_ming_kuai.into_bytes(),
                });
                v
            })
            .unwrap(),
            fingerprint_2,
        )
    }

    #[test]
    fn mei_qian_ming_jiu_shi_wei_qian_ming_bu_shi_error() {
        let p = Package::cong_files(vec![
            PackageFile {
                path_3: MANIFEST_FILE.to_owned(),
                content_2: b"[plugin]\nid = \"a.b\"\n".to_vec(),
            },
            PackageFile {
                path_3: "main.lua".to_owned(),
                content_2: b"return {}\n".to_vec(),
            },
        ])
        .unwrap();
        assert!(p.qian_ming.is_none());
        assert_eq!(
            p.yan_qian(&TrustStore::from_text("")).unwrap(),
            Signature::Unsigned
        );
        assert_eq!(p.files_2.len(), 2);
        assert_eq!(
            p.files_2[0].path_3, "main.lua",
            "\u{6309}\u{8def}\u{5f84}\u{6392}\u{5e8f}"
        );
    }

    #[test]
    fn qian_ming_dui_qie_trust_ren_jiu_shi_yi_yan_zheng() {
        let (p, fingerprint_2) = dai_qian_ming_de_bao(&[
            (MANIFEST_FILE, "[plugin]\nid = \"a.b\"\n"),
            ("main.lua", "x"),
        ]);
        let ku = TrustStore::from_text(&format!(
            "[keys.\"{fingerprint_2}\"]\nname = \"\u{6d4b}\u{8bd5}\"\npublic_key = \"AA==\"\n"
        ));
        assert_eq!(p.yan_qian(&ku).unwrap(), Signature::Verified);
    }

    #[test]
    fn qian_ming_dui_dan_mei_trust_ren_jiu_shi_wei_zhi_qian_ming_zhe() {
        let (p, _) = dai_qian_ming_de_bao(&[(MANIFEST_FILE, "[plugin]\nid = \"a.b\"\n")]);
        assert_eq!(
            p.yan_qian(&TrustStore::from_text("")).unwrap(),
            Signature::Unknown
        );
    }

    #[test]
    fn qian_wan_zai_gai_yi_ge_zi_jie_jiu_ju() {
        let (mut p, _) = dai_qian_ming_de_bao(&[
            (MANIFEST_FILE, "[plugin]\nid = \"a.b\"\n"),
            ("main.lua", "x"),
        ]);
        let f = p
            .files_2
            .iter_mut()
            .find(|f| f.path_3 == "main.lua")
            .unwrap();
        f.content_2 = b"y".to_vec();

        let err = p
            .yan_qian(&TrustStore::from_text(""))
            .unwrap_err()
            .to_string();
        assert!(
            err.contains("Signature verification failed"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn rejects_spoofed_key_id_for_trusted_key() {
        let (mut p, _) = dai_qian_ming_de_bao(&[(MANIFEST_FILE, "[plugin]\nid = \"a.b\"\n")]);

        let sig = p.qian_ming.as_mut().unwrap();
        sig.key_id = "0000000000000000".to_owned();

        let err = p
            .yan_qian(&TrustStore::from_text(""))
            .unwrap_err()
            .to_string();
        assert!(err.contains("does not match"), "unexpected error: {err}");
    }

    #[test]
    fn summary_bu_han_qian_ming_file_zi_ji() {
        let (p, _) = dai_qian_ming_de_bao(&[(MANIFEST_FILE, "[plugin]\nid = \"a.b\"\n")]);
        let zhi_you_zai_he = Package::cong_files(p.files_2.clone()).unwrap();
        assert!(zhi_you_zai_he.qian_ming.is_none());
        assert_eq!(
            p.summary(),
            zhi_you_zai_he.summary(),
            "\u{7b7e}\u{540d}\u{6587}\u{4ef6}\u{4e0d}\u{8be5}\u{5f71}\u{54cd}\u{6458}\u{8981}"
        );
    }

    #[test]
    fn tiao_mu_shun_xu_bu_ying_xiang_summary() {
        let a = Package::cong_files(vec![
            PackageFile {
                path_3: "a".to_owned(),
                content_2: b"1".to_vec(),
            },
            PackageFile {
                path_3: "b".to_owned(),
                content_2: b"2".to_vec(),
            },
        ])
        .unwrap();
        let b = Package::cong_files(vec![
            PackageFile {
                path_3: "b".to_owned(),
                content_2: b"2".to_vec(),
            },
            PackageFile {
                path_3: "a".to_owned(),
                content_2: b"1".to_vec(),
            },
        ])
        .unwrap();
        assert_eq!(a.summary(), b.summary());
    }

    #[test]
    fn bao_li_de_path_tiao_bu_chu_target_directory() {
        for huai in [
            "../evil",
            "a/../../evil",
            "/etc/passwd",
            "C:/windows/x",
            "a\\..\\..\\evil",
            "a//b",
            "./x",
            "",
            "..",
        ] {
            assert!(
                path_he_fa_ma(huai).is_err(),
                "`{huai}` \u{8be5}\u{88ab}\u{62d2}"
            );
        }
        for ok_2 in ["plugin.toml", "main.lua", "icons/a.png", "a/b/c/d.lua"] {
            assert_eq!(
                path_he_fa_ma(ok_2).unwrap(),
                ok_2,
                "`{ok_2}` \u{662f}\u{5408}\u{6cd5}\u{8def}\u{5f84}"
            );
        }

        assert_eq!(path_he_fa_ma("a\\b").unwrap(), "a/b");

        assert_eq!(path_he_fa_ma("a/b/").unwrap(), "a/b");
    }

    #[test]
    fn cong_zip_jie_kai_neng_read_dao_file() {
        use std::io::Write;
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            w.start_file("plugin.toml", opts).unwrap();
            w.write_all(b"[plugin]\nid = \"a.b\"\n").unwrap();
            w.start_file("main.lua", opts).unwrap();
            w.write_all(b"return {}\n").unwrap();
            w.finish().unwrap();
        }

        let p = Package::cong_zip(&buf).unwrap();
        assert_eq!(p.files_2.len(), 2);
        assert_eq!(p.zhao("main.lua").unwrap(), b"return {}\n");
        assert_eq!(p.zhao("\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}"), None);
        assert!(p.qian_ming.is_none());
    }

    #[test]
    fn bu_shi_zip_jiu_bao_cuo_bu_panic() {
        let err = Package::cong_zip("\u{8fd9}\u{662f}\u{4e00}\u{6bb5}\u{666e}\u{901a}\u{6587}\u{672c}\u{ff0c}\u{4e0d}\u{662f} zip".as_bytes())
            .unwrap_err()
            .to_string();
        assert!(err.contains("extension package"), "unexpected error: {err}");
    }

    #[test]
    fn broken_trust_store_is_treated_as_empty() {
        let ku = TrustStore::from_text("\u{4e0d}\u{662f} TOML {{{");
        assert!(!ku.contains("\u{968f}\u{4fbf}"));
        assert_eq!(ku.len(), 0);
    }

    #[test]
    fn tian_shu_huan_cheng_gong_li_ri_qi() {
        assert_eq!(civil_date(0), (1970, 1, 1));
        assert_eq!(civil_date(-1), (1969, 12, 31));
        assert_eq!(civil_date(19_723), (2024, 1, 1));
        assert_eq!(civil_date(11_016), (2000, 2, 29));
        assert_eq!(civil_date(20_721), (2026, 9, 25));
    }

    #[test]
    fn jin_tian_zhang_de_xiang_ge_ri_qi() {
        let t = today();
        assert_eq!(t.len(), 10, "\u{5b9e}\u{9645}\u{ff1a}{t}");
        let wei: Vec<char> = t.chars().collect();
        assert_eq!(wei[4], '-');
        assert_eq!(wei[7], '-');
        for (i, c) in wei.iter().enumerate() {
            if i == 4 || i == 7 {
                continue;
            }
            assert!(
                c.is_ascii_digit(),
                "\u{7b2c} {i} \u{4f4d}\u{4e0d}\u{662f}\u{6570}\u{5b57}\u{ff1a}{t}"
            );
        }
        assert!(t.starts_with("20"), "\u{8fd9}\u{4e2a}\u{5b57}\u{6bb5}\u{662f}\u{7ed9}\u{4eba}\u{770b}\u{7684}\u{ff0c}\u{56db}\u{4f4d}\u{5e74}\u{ff1a}{t}");
    }

    #[test]
    fn ji_xia_de_yao_shi_dai_ri_qi() {
        let mut ku = TrustStore::from_text("");
        ku.insert_memory("deadbeefdeadbeef", "\u{67d0}\u{4eba}", "AAA=");
        let text_2 = ku.to_text().unwrap();
        assert!(
            !text_2.contains(r#"added_at = """#),
            "\u{65e5}\u{671f}\u{662f}\u{7a7a}\u{7684}\u{ff1a}{text_2}"
        );
        assert!(
            text_2.contains(&today()),
            "\u{5b9e}\u{9645}\u{ff1a}{text_2}"
        );
    }
}
