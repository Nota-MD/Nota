use std::fs;
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::PathBuf;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(super) struct SecurityFile {
    #[serde(default)]
    pub(super) password_hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Network {
    V4(Ipv4Addr, u8),
    V6(Ipv6Addr, u8),
}

fn security_path() -> Result<PathBuf> {
    crate::paths::dev_bridge_file()
}

pub(super) fn read_security() -> Result<SecurityFile> {
    let path = security_path()?;
    match fs::read_to_string(&path) {
        Ok(source) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
            }
            toml::from_str(&source).map_err(|error| NotaError::other(error.to_string()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(SecurityFile::default()),
        Err(error) => Err(NotaError::other(error.to_string())),
    }
}

pub(super) fn write_security(value: &SecurityFile) -> Result<()> {
    let path = security_path()?;
    if let Some(parent) = path.parent() {
        crate::paths::ensure_dir(parent)?;
    }
    let source =
        toml::to_string_pretty(value).map_err(|error| NotaError::other(error.to_string()))?;
    let temporary = path.with_extension(format!(
        "toml.tmp-{}-{:016x}",
        std::process::id(),
        OsRng.next_u64()
    ));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|error| NotaError::other(error.to_string()))?;
        file.write_all(source.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| NotaError::other(error.to_string()))?;
        #[cfg(windows)]
        if path.exists() {
            fs::remove_file(&path).map_err(|error| NotaError::other(error.to_string()))?;
        }
        fs::rename(&temporary, &path).map_err(|error| NotaError::other(error.to_string()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub(super) fn hash_password(password: &str) -> Result<String> {
    if password.len() < 8 {
        return Err(NotaError::other(
            "Developer bridge password must contain at least 8 characters",
        ));
    }
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|value| value.to_string())
        .map_err(|error| NotaError::other(error.to_string()))
}

pub(super) fn verify_password(password: &str, encoded: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(encoded) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn parse_network(value: &str) -> Option<Network> {
    let (address, prefix) = value
        .split_once('/')
        .map_or((value, None), |(address, prefix)| (address, Some(prefix)));
    let address: IpAddr = address.trim().parse().ok()?;
    match address {
        IpAddr::V4(address) => {
            let prefix = prefix.map(str::parse).transpose().ok()?.unwrap_or(32);
            (prefix <= 32).then_some(Network::V4(address, prefix))
        }
        IpAddr::V6(address) => {
            let prefix = prefix.map(str::parse).transpose().ok()?.unwrap_or(128);
            (prefix <= 128).then_some(Network::V6(address, prefix))
        }
    }
}

fn network_matches(network: &Network, address: IpAddr) -> bool {
    match (*network, address) {
        (Network::V4(network, prefix), IpAddr::V4(address)) => {
            let mask = if prefix == 0 {
                0
            } else {
                u32::MAX << (32 - prefix)
            };
            u32::from(network) & mask == u32::from(address) & mask
        }
        (Network::V6(network, prefix), IpAddr::V6(address)) => {
            let mask = if prefix == 0 {
                0
            } else {
                u128::MAX << (128 - prefix)
            };
            u128::from(network) & mask == u128::from(address) & mask
        }
        (Network::V4(network, prefix), IpAddr::V6(address)) => {
            address.to_ipv4_mapped().is_some_and(|address| {
                network_matches(&Network::V4(network, prefix), IpAddr::V4(address))
            })
        }
        _ => false,
    }
}

pub(super) fn normalize_whitelist(values: &[String]) -> Result<Vec<String>> {
    let mut output = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        if parse_network(trimmed).is_none() {
            return Err(NotaError::other(format!(
                "Invalid developer bridge IP or CIDR: {trimmed}"
            )));
        }
        if !output.iter().any(|item| item == trimmed) {
            output.push(trimmed.to_owned());
        }
    }
    if output.is_empty() {
        return Err(NotaError::other(
            "Developer bridge whitelist cannot be empty",
        ));
    }
    Ok(output)
}

pub(super) fn allowed(whitelist: &[String], address: IpAddr) -> bool {
    whitelist
        .iter()
        .filter_map(|value| parse_network(value))
        .any(|network| network_matches(&network, address))
}

pub(super) fn bind_addresses(whitelist: &[String]) -> Vec<SocketAddr> {
    let loopback_only = whitelist.iter().all(|value| {
        let Some(network) = parse_network(value) else {
            return false;
        };
        match network {
            Network::V4(address, prefix) => {
                prefix >= 8 && (address.is_loopback() || address.octets()[0] == 127)
            }
            Network::V6(address, prefix) => prefix >= 128 && address.is_loopback(),
        }
    });
    if loopback_only {
        let mut addresses = Vec::new();
        if whitelist
            .iter()
            .filter_map(|value| parse_network(value))
            .any(|network| matches!(network, Network::V4(address, _) if address.is_loopback()))
        {
            addresses.push(SocketAddr::from(([127, 0, 0, 1], 0)));
        }
        if whitelist
            .iter()
            .filter_map(|value| parse_network(value))
            .any(|network| matches!(network, Network::V6(address, _) if address.is_loopback()))
        {
            addresses.push(SocketAddr::from((Ipv6Addr::LOCALHOST, 0)));
        }
        addresses
    } else if whitelist.iter().any(|value| {
        matches!(parse_network(value), Some(Network::V6(address, _)) if !address.is_loopback())
    }) {
        vec![SocketAddr::from((Ipv6Addr::UNSPECIFIED, 0))]
    } else {
        vec![SocketAddr::from(([0, 0, 0, 0], 0))]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelist_matches_individual_and_cidr_addresses() {
        let checks = vec![
            "127.0.0.1".to_string(),
            "192.168.1.0/24".to_string(),
            "::1".to_string(),
        ];
        assert!(allowed(&checks, "127.0.0.1".parse().unwrap()));
        assert!(allowed(&checks, "192.168.1.42".parse().unwrap()));
        assert!(allowed(&checks, "::1".parse().unwrap()));
        assert!(!allowed(&checks, "10.0.0.1".parse().unwrap()));
    }

    #[test]
    fn cidr_matching_respects_network_boundaries() {
        let network = parse_network("192.168.4.0/23").unwrap();
        assert!(network_matches(&network, "192.168.4.1".parse().unwrap()));
        assert!(network_matches(&network, "192.168.5.254".parse().unwrap()));
        assert!(!network_matches(&network, "192.168.6.0".parse().unwrap()));
    }

    #[test]
    fn invalid_whitelist_entries_are_rejected() {
        assert!(normalize_whitelist(&["not-an-ip".into()]).is_err());
        assert!(normalize_whitelist(&["192.168.1.1/33".into()]).is_err());
        assert!(normalize_whitelist(&[]).is_err());
    }

    #[test]
    fn loopback_whitelist_binds_only_loopback() {
        let addresses = bind_addresses(&["127.0.0.1".into(), "::1".into()]);
        assert_eq!(addresses.len(), 2);
        assert!(addresses.iter().all(|address| address.ip().is_loopback()));
        let addresses = bind_addresses(&["192.168.1.0/24".into()]);
        assert_eq!(addresses.len(), 1);
        assert!(!addresses[0].ip().is_loopback());
    }

    #[test]
    fn password_hash_round_trips() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password("correct horse battery staple", &hash));
        assert!(!verify_password("wrong password", &hash));
        assert!(hash_password("short").is_err());
    }
}
