//! Collect build metadata for the diagnostics view.
//!
//! Missing optional tools produce empty strings instead of failing the build.
//! The generated timestamp is Unix seconds; the frontend handles localization.

use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Return the first stdout line, or an empty string when unavailable.
fn command_version(program: &str, args: &[&str]) -> String {
    let output = match Command::new(program).args(args).output() {
        Ok(o) if o.status.success() => o,
        _ => return String::new(),
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

/// Return the locked version of a package, or an empty string.
fn locked_version(lockfile: &str, package: &str) -> String {
    let wanted_name = format!("name = \"{package}\"");
    let mut previous_was_package = false;
    for line in lockfile.lines() {
        let line = line.trim();
        if line == wanted_name {
            previous_was_package = true;
            continue;
        }
        if previous_was_package {
            if let Some(version) = line.strip_prefix("version = ") {
                return version.trim().trim_matches('"').to_string();
            }
            previous_was_package = false;
        }
    }
    String::new()
}

/// Escape an external value as a Rust string literal.
fn rust_literal(value: &str) -> String {
    let mut result = String::with_capacity(value.len() + 2);
    result.push('"');
    for character in value.chars() {
        match character {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                result.push_str(&format!("\\u{{{:x}}}", control as u32))
            }
            other => result.push(other),
        }
    }
    result.push('"');
    result
}

fn json_text<'a>(value: &'a serde_json::Value, path: &[&str], fallback: &'a str) -> &'a str {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(serde_json::Value::as_str)
        .unwrap_or(fallback)
}

fn json_optional_text(value: &serde_json::Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}

fn json_bool(value: &serde_json::Value, path: &[&str], fallback: bool) -> bool {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(fallback)
}

fn package_slug(value: &str) -> String {
    let mut result = String::new();
    let mut dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            result.push(character.to_ascii_lowercase());
            dash = false;
        } else if !dash && !result.is_empty() {
            result.push('-');
            dash = true;
        }
    }
    result.trim_matches('-').to_owned()
}

fn main() {
    // Re-run when the generator or locked dependency versions change.
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=Cargo.lock");
    // Tauri embeds `frontendDist` from this repository-relative directory.
    // Without this line `cargo build --release` can keep the previous asset
    // bundle even after `npm run build`, producing a binary whose hashed chunk
    // files no longer exist.
    println!("cargo:rerun-if-changed=../dist");
    // Keep the timestamp aligned with source changes without forcing rebuilds.
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-env-changed=NOTA_DISTRIBUTION_PROFILE");

    let build_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut host = command_version("hostname", &[]);
    if host.is_empty() {
        host = std::fs::read_to_string("/etc/hostname")
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
    }

    // Record the build host rather than the end user's runtime machine.
    let host_triple = std::env::var("HOST").unwrap_or_default();
    let platform = if cfg!(windows) {
        let version = command_version("cmd", &["/C", "ver"]);
        match (version.is_empty(), host_triple.is_empty()) {
            (true, true) => String::new(),
            (true, false) => host_triple,
            (false, true) => version,
            (false, false) => format!("{version} [{host_triple}]"),
        }
    } else {
        let uname = command_version("uname", &["-srm"]);
        match (uname.is_empty(), host_triple.is_empty()) {
            (true, true) => String::new(),
            (true, false) => host_triple,
            (false, true) => uname,
            (false, false) => format!("{uname} [{host_triple}]"),
        }
    };

    let lockfile = std::fs::read_to_string("Cargo.lock").unwrap_or_default();

    // TARGET and PROFILE are available only while the build script runs.
    let target = std::env::var("TARGET").unwrap_or_default();
    let profile = std::env::var("PROFILE").unwrap_or_default();

    let contents = format!(
        "// Generated by build.rs. Do not edit or commit.\n\
         // Consumed by src/diagnostics.rs.\n\
         \n\
         pub const BUILD_TIME: u64 = {build_time};\n\
         pub const BUILD_HOST: &str = {host};\n\
         pub const BUILD_PLATFORM: &str = {platform};\n\
         pub const TARGET_TRIPLE: &str = {target};\n\
         pub const BUILD_PROFILE: &str = {profile};\n\
         pub const RUSTC: &str = {rustc};\n\
         pub const CARGO: &str = {cargo};\n\
         pub const NODE: &str = {node};\n\
         pub const NPM: &str = {npm};\n\
         pub const TAURI_VERSION: &str = {tauri};\n\
         pub const WEBKIT_CRATE_VERSION: &str = {webkit};\n\
         pub const GTK_CRATE_VERSION: &str = {gtk};\n\
         pub const MLUA_VERSION: &str = {mlua};\n",
        host = rust_literal(&host),
        platform = rust_literal(&platform),
        target = rust_literal(&target),
        profile = rust_literal(&profile),
        rustc = rust_literal(&command_version("rustc", &["-V"])),
        cargo = rust_literal(&command_version("cargo", &["-V"])),
        node = rust_literal(&command_version("node", &["-v"])),
        npm = rust_literal(&command_version("npm", &["-v"])),
        tauri = rust_literal(&locked_version(&lockfile, "tauri")),
        webkit = rust_literal(&locked_version(&lockfile, "webkit2gtk")),
        gtk = rust_literal(&locked_version(&lockfile, "gtk")),
        mlua = rust_literal(&locked_version(&lockfile, "mlua")),
    );

    let output = std::path::Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR is not set"))
        .join("build_info.rs");
    std::fs::write(&output, contents).expect("Could not write build_info.rs");

    let profile = std::env::var("NOTA_DISTRIBUTION_PROFILE")
        .ok()
        .and_then(|path| {
            println!("cargo:rerun-if-changed={path}");
            std::fs::read_to_string(path)
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        })
        .or_else(|| {
            let path = std::path::Path::new("../distributions/official/distribution.json");
            println!("cargo:rerun-if-changed={}", path.display());
            std::fs::read_to_string(path)
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        });
    let profile = profile.unwrap_or_else(|| {
        serde_json::json!({
            "schemaVersion": 1,
            "kind": "official",
            "id": "official",
            "identity": {
                "name": "Nota",
                "productName": "Nota",
                "binaryName": "nota",
                "identifier": "io.github.nota.Nota",
                "publisher": "Leo Lee",
                "website": "https://nota-md.github.io/",
                "supportUrl": "https://github.com/Nota-MD/Nota/issues",
                "dataDirectory": "nota"
            },
            "branding": {
                "uiStyle": "adwaita",
                "documentTheme": ""
            },
            "defaults": {
                "language": "auto",
                "uiMode": "auto",
                "documentTheme": "",
                "checkForUpdates": false
            },
            "legal": {
                "copyright": null,
                "upstreamLicense": "LICENSE"
            },
            "updates": {
                "manifestUrl": "https://github.com/Nota-MD/Nota/releases/latest/download/latest.json",
                "releasePrefix": "https://github.com/Nota-MD/Nota/releases/download/",
                "releasePage": "https://github.com/Nota-MD/Nota/releases"
            },
            "onboarding": {
                "mode": "default",
                "fallbackLocale": "en"
            }
        })
    });
    let optional_literal = |value: Option<String>, fallback: &str| match value {
        Some(value) => format!("Some({})", rust_literal(&value)),
        None => fallback.to_owned(),
    };
    let distribution_contents = format!(
        "// Generated by build.rs from a validated Distribution Profile.\n\
         pub const SCHEMA_VERSION: u32 = {};\n\
         pub const KIND: &str = {};\n\
         pub const ID: &str = {};\n\
         pub const NAME: &str = {};\n\
         pub const PRODUCT_NAME: &str = {};\n\
         pub const PACKAGE_NAME: &str = {};\n\
         pub const BINARY_NAME: &str = {};\n\
         pub const IDENTIFIER: &str = {};\n\
         pub const PUBLISHER: &str = {};\n\
         pub const WEBSITE: &str = {};\n\
         pub const SUPPORT_URL: &str = {};\n\
         pub const DATA_DIRECTORY: &str = {};\n\
         pub const DEFAULT_LANGUAGE: &str = {};\n\
         pub const DEFAULT_UI_MODE: &str = {};\n\
         pub const DEFAULT_UI_STYLE: &str = {};\n\
         pub const DEFAULT_DOCUMENT_THEME: &str = {};\n\
         pub const DEFAULT_ACCENT: Option<&str> = {};\n\
         pub const DEFAULT_CHECK_UPDATES: bool = {};\n\
         pub const UPDATE_MANIFEST_URL: Option<&str> = {};\n\
         pub const UPDATE_RELEASE_PREFIX: Option<&str> = {};\n\
         pub const UPDATE_RELEASE_PAGE: Option<&str> = {};\n\
         pub const ONBOARDING_MODE: &str = {};\n\
         pub const ONBOARDING_FALLBACK_LOCALE: &str = {};\n\
         pub const BOOTSTRAP_RESOURCE: Option<&str> = {};\n\
         pub const PROFILE_RESOURCE: &str = \"distribution/distribution.json\";\n",
        profile
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(1),
        rust_literal(json_text(&profile, &["kind"], "official")),
        rust_literal(json_text(&profile, &["id"], "official")),
        rust_literal(json_text(&profile, &["identity", "name"], "Nota")),
        rust_literal(json_text(&profile, &["identity", "productName"], "Nota")),
        rust_literal(&package_slug(json_text(
            &profile,
            &["identity", "productName"],
            "Nota"
        ))),
        rust_literal(json_text(&profile, &["identity", "binaryName"], "nota")),
        rust_literal(json_text(
            &profile,
            &["identity", "identifier"],
            "io.github.nota.Nota"
        )),
        rust_literal(json_text(&profile, &["identity", "publisher"], "Leo Lee")),
        rust_literal(json_text(
            &profile,
            &["identity", "website"],
            "https://nota-md.github.io/"
        )),
        rust_literal(json_text(
            &profile,
            &["identity", "supportUrl"],
            "https://github.com/Nota-MD/Nota/issues"
        )),
        rust_literal(json_text(&profile, &["identity", "dataDirectory"], "nota")),
        rust_literal(json_text(&profile, &["defaults", "language"], "auto")),
        rust_literal(json_text(&profile, &["defaults", "uiMode"], "auto")),
        rust_literal(json_text(&profile, &["branding", "uiStyle"], "adwaita")),
        rust_literal(json_text(&profile, &["defaults", "documentTheme"], "")),
        optional_literal(
            json_optional_text(&profile, &["branding", "primaryColor"]),
            "None"
        ),
        json_bool(&profile, &["defaults", "checkForUpdates"], false),
        optional_literal(
            json_optional_text(&profile, &["updates", "manifestUrl"]),
            "None"
        ),
        optional_literal(
            json_optional_text(&profile, &["updates", "releasePrefix"]),
            "None"
        ),
        optional_literal(
            json_optional_text(&profile, &["updates", "releasePage"]),
            "None"
        ),
        rust_literal(json_text(&profile, &["onboarding", "mode"], "default")),
        rust_literal(json_text(&profile, &["onboarding", "fallbackLocale"], "en")),
        optional_literal(
            json_optional_text(&profile, &["resources", "bootstrap"]),
            "None"
        ),
    );
    let distribution_output =
        std::path::Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR is not set"))
            .join("distribution_profile.rs");
    std::fs::write(distribution_output, distribution_contents)
        .expect("Could not write distribution_profile.rs");

    tauri_build::build()
}
