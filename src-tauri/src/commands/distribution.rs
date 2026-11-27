use std::fs;

use serde::Serialize;
use tauri::Manager;

use crate::error::{NotaError, Result};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct DistributionOnboarding {
    pub mode: String,
    pub locale: String,
    pub title: Option<String>,
    pub html: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DistributionLegal {
    pub locale: String,
    pub copyright: Option<String>,
    pub distribution_license: Option<String>,
    pub notice: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DistributionBranding {
    pub logo_svg: Option<String>,
    pub primary_color: Option<String>,
}

fn localized_value<'a>(
    value: Option<&'a serde_json::Value>,
    language: &str,
    fallback: &str,
) -> Option<&'a str> {
    let map = value?.as_object()?;
    map.get(language)
        .or_else(|| map.get(fallback))
        .and_then(serde_json::Value::as_str)
}

#[tauri::command]
pub fn nota_distribution_onboarding(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<DistributionOnboarding> {
    let language = state.app_language.clone();
    let Some(resource_dir) = app.path().resource_dir().ok() else {
        return Ok(DistributionOnboarding {
            mode: "default".to_owned(),
            locale: language,
            title: None,
            html: None,
        });
    };
    let profile_path = resource_dir.join(crate::distribution_profile::PROFILE_RESOURCE);
    let profile = match fs::read_to_string(&profile_path) {
        Ok(text) => serde_json::from_str::<serde_json::Value>(&text).map_err(|error| {
            NotaError::other(format!("Could not parse distribution profile: {error}"))
        })?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DistributionOnboarding {
                mode: "default".to_owned(),
                locale: language,
                title: None,
                html: None,
            })
        }
        Err(error) => {
            return Err(NotaError::Read {
                path: profile_path,
                source: error,
            })
        }
    };
    let onboarding = profile.get("onboarding");
    let mode = onboarding
        .and_then(|value| value.get("mode"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("default")
        .to_owned();
    let fallback = onboarding
        .and_then(|value| value.get("fallbackLocale"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("en");
    let title = localized_value(
        onboarding.and_then(|value| value.get("title")),
        &language,
        fallback,
    )
    .map(str::to_owned);
    let guide = localized_value(
        onboarding.and_then(|value| value.get("guide")),
        &language,
        fallback,
    );
    let html = guide.and_then(|relative| {
        fs::read_to_string(resource_dir.join("distribution").join(relative)).ok()
    });
    Ok(DistributionOnboarding {
        mode,
        locale: language,
        title,
        html,
    })
}

#[tauri::command]
pub fn nota_distribution_legal(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<DistributionLegal> {
    let language = state.app_language.clone();
    let Some(resource_dir) = app.path().resource_dir().ok() else {
        return Ok(DistributionLegal {
            locale: language,
            copyright: None,
            distribution_license: None,
            notice: None,
        });
    };
    let profile_path = resource_dir.join(crate::distribution_profile::PROFILE_RESOURCE);
    let profile = match fs::read_to_string(&profile_path) {
        Ok(text) => serde_json::from_str::<serde_json::Value>(&text).map_err(|error| {
            NotaError::other(format!("Could not parse distribution profile: {error}"))
        })?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DistributionLegal {
                locale: language,
                copyright: None,
                distribution_license: None,
                notice: None,
            })
        }
        Err(error) => {
            return Err(NotaError::Read {
                path: profile_path,
                source: error,
            })
        }
    };
    let legal = profile.get("legal");
    let fallback = "en";
    let read_resource = |relative: Option<&str>| {
        relative.and_then(|relative| {
            fs::read_to_string(resource_dir.join("distribution").join(relative)).ok()
        })
    };
    let copyright = legal
        .and_then(|value| value.get("copyright"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let distribution_license = read_resource(
        legal
            .and_then(|value| value.get("distributionLicense"))
            .and_then(serde_json::Value::as_str),
    );
    let notice = localized_value(
        legal.and_then(|value| value.get("notice")),
        &language,
        fallback,
    )
    .and_then(|relative| read_resource(Some(relative)));
    Ok(DistributionLegal {
        locale: language,
        copyright,
        distribution_license,
        notice,
    })
}

#[tauri::command]
pub fn nota_distribution_branding(app: tauri::AppHandle) -> Result<DistributionBranding> {
    let Some(resource_dir) = app.path().resource_dir().ok() else {
        return Ok(DistributionBranding {
            logo_svg: None,
            primary_color: None,
        });
    };
    let profile_path = resource_dir.join(crate::distribution_profile::PROFILE_RESOURCE);
    let profile = match fs::read_to_string(&profile_path) {
        Ok(text) => serde_json::from_str::<serde_json::Value>(&text).ok(),
        Err(_) => None,
    };
    let logo_svg = profile
        .as_ref()
        .and_then(|profile| profile.pointer("/branding/logo"))
        .and_then(serde_json::Value::as_str)
        .and_then(|relative| {
            fs::read_to_string(resource_dir.join("distribution").join(relative)).ok()
        });
    let primary_color = profile
        .as_ref()
        .and_then(|profile| profile.pointer("/branding/primaryColor"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    Ok(DistributionBranding {
        logo_svg,
        primary_color,
    })
}
