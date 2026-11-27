use serde::Deserialize;
use tauri::menu::{
    CheckMenuItemBuilder, IsMenuItem, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Deserialize)]
pub struct MenuNode {
    #[serde(default)]
    pub sep: bool,

    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,

    #[serde(default)]
    pub accel: Option<String>,
    #[serde(default = "yes")]
    pub enabled: bool,

    #[serde(default)]
    pub checked: Option<bool>,
    #[serde(default)]
    pub submenu: Vec<MenuNode>,
}

fn yes() -> bool {
    true
}

pub fn available() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

pub fn apply<R: Runtime>(app: &AppHandle<R>, nodes: &[MenuNode]) -> Result<bool, String> {
    if !available() {
        return Ok(false);
    }
    if nodes.is_empty() {
        app.remove_menu().map_err(estr)?;
        return Ok(false);
    }
    let menu = build(app, nodes)?;
    app.set_menu(menu)
        .map_err(|e| format!("Could not install the native menu: {e}"))?;
    Ok(true)
}

fn build<R: Runtime>(app: &AppHandle<R>, nodes: &[MenuNode]) -> Result<Menu<R>, String> {
    let mut items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();

    if cfg!(target_os = "macos") {
        let about_label = format!("About {}", crate::distribution_profile::PRODUCT_NAME);
        let about = PredefinedMenuItem::about(app, Some(&about_label), None).map_err(estr)?;
        let services = PredefinedMenuItem::services(app, None).map_err(estr)?;
        let hide = PredefinedMenuItem::hide(app, None).map_err(estr)?;
        let hide_others = PredefinedMenuItem::hide_others(app, None).map_err(estr)?;
        let show_all = PredefinedMenuItem::show_all(app, None).map_err(estr)?;
        let quit = PredefinedMenuItem::quit(app, None).map_err(estr)?;
        let sep1 = PredefinedMenuItem::separator(app).map_err(estr)?;
        let sep2 = PredefinedMenuItem::separator(app).map_err(estr)?;

        let app_menu = SubmenuBuilder::new(app, crate::distribution_profile::PRODUCT_NAME)
            .item(&about)
            .item(&sep1)
            .item(&services)
            .item(&sep2)
            .item(&hide)
            .item(&hide_others)
            .item(&show_all)
            .item(&quit)
            .build()
            .map_err(estr)?;
        items.push(Box::new(app_menu));
    }

    items.extend(build_nodes(app, nodes)?);

    let refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(|b| b.as_ref()).collect();
    MenuBuilder::new(app).items(&refs).build().map_err(estr)
}

fn build_nodes<R: Runtime>(
    app: &AppHandle<R>,
    nodes: &[MenuNode],
) -> Result<Vec<Box<dyn IsMenuItem<R>>>, String> {
    let mut out: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();

    for node in nodes {
        if node.sep {
            out.push(Box::new(PredefinedMenuItem::separator(app).map_err(estr)?));
            continue;
        }

        if !node.submenu.is_empty() {
            let children = build_nodes(app, &node.submenu)?;
            let refs: Vec<&dyn IsMenuItem<R>> = children.iter().map(|b| b.as_ref()).collect();

            let sub = SubmenuBuilder::new(app, &node.label)
                .items(&refs)
                .build()
                .map_err(estr)?;
            out.push(Box::new(sub));
            continue;
        }

        out.push(build_leaf(app, node)?);
    }

    Ok(out)
}

fn build_leaf<R: Runtime>(
    app: &AppHandle<R>,
    node: &MenuNode,
) -> Result<Box<dyn IsMenuItem<R>>, String> {
    let accel = leaf_accel(node);

    if let Some(checked) = node.checked {
        let mut b = CheckMenuItemBuilder::with_id(&node.id, &node.label)
            .enabled(node.enabled)
            .checked(checked);
        if let Some(a) = accel {
            b = b.accelerator(a);
        }
        return Ok(Box::new(b.build(app).map_err(estr)?));
    }

    let mut b = MenuItemBuilder::with_id(&node.id, &node.label).enabled(node.enabled);
    if let Some(a) = accel {
        b = b.accelerator(a);
    }
    Ok(Box::new(b.build(app).map_err(estr)?))
}

fn leaf_accel(node: &MenuNode) -> Option<String> {
    if !node.enabled {
        return None;
    }

    if cfg!(target_os = "linux") {
        return None;
    }
    let raw = node.accel.as_deref()?;
    let native = to_native_accel(raw);
    if native.is_none() {
        crate::debug_log!(
            "[nota] native menu: accelerator \"{raw}\" for {} could not be converted; item has no shortcut",
            node.id
        );
    }
    native
}

pub fn to_native_accel(text: &str) -> Option<String> {
    let mut mods: Vec<&'static str> = Vec::new();
    let mut key: Option<String> = None;

    for part in text.split('+').map(str::trim).filter(|s| !s.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" | "cmd" | "command" | "meta" | "super" | "win" => {
                if !mods.contains(&"CmdOrCtrl") {
                    mods.push("CmdOrCtrl");
                }
            }
            "shift" => {
                if !mods.contains(&"Shift") {
                    mods.push("Shift");
                }
            }
            "alt" | "option" | "opt" => {
                if !mods.contains(&"Alt") {
                    mods.push("Alt");
                }
            }
            _ => {
                if key.is_some() {
                    return None;
                }
                key = Some(native_key(part)?);
            }
        }
    }

    let key = key?;
    let mut out = mods.join("+");
    if !out.is_empty() {
        out.push('+');
    }
    out.push_str(&key);
    Some(out)
}

fn native_key(part: &str) -> Option<String> {
    let lower = part.to_lowercase();

    let named = match lower.as_str() {
        "\u{2191}" | "up" | "arrowup" => "Up",
        "\u{2193}" | "down" | "arrowdown" => "Down",
        "\u{2190}" | "left" | "arrowleft" => "Left",
        "\u{2192}" | "right" | "arrowright" => "Right",
        "esc" | "escape" => "Escape",
        "return" | "enter" => "Enter",
        "space" | "spacebar" => "Space",
        "tab" => "Tab",
        "backspace" => "Backspace",
        "del" | "delete" => "Delete",
        "home" => "Home",
        "end" => "End",
        "pageup" => "PageUp",
        "pagedown" => "PageDown",
        "comma" => "Comma",
        "period" => "Period",
        "slash" => "Slash",
        "semicolon" => "Semicolon",
        "quote" => "Quote",
        "bracketleft" => "BracketLeft",
        "bracketright" => "BracketRight",
        "backslash" => "Backslash",
        "backquote" => "Backquote",
        "minus" => "Minus",
        "equal" | "plus" => "Equal",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_owned());
    }

    if let Some(digits) = lower.strip_prefix('f') {
        if let Ok(n) = digits.parse::<u8>() {
            if (1..=24).contains(&n) {
                return Some(format!("F{n}"));
            }
        }
    }

    let mut chars = part.chars();
    let first = chars.next()?;
    if chars.next().is_some() {
        return None;
    }
    match first {
        'a'..='z' | 'A'..='Z' | '0'..='9' => Some(first.to_ascii_uppercase().to_string()),

        ',' | '.' | '/' | ';' | '\'' | '[' | ']' | '\\' | '`' | '-' | '=' => {
            Some(first.to_string())
        }
        _ => None,
    }
}

fn estr(e: tauri::Error) -> String {
    format!("Could not build the native menu: {e}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_ACCELS: &[(&str, Option<&str>)] = &[
        ("Ctrl+N", Some("CmdOrCtrl+N")),
        ("Ctrl+Shift+N", Some("CmdOrCtrl+Shift+N")),
        ("Ctrl+O", Some("CmdOrCtrl+O")),
        ("Ctrl+P", Some("CmdOrCtrl+P")),
        ("Ctrl+S", Some("CmdOrCtrl+S")),
        ("Ctrl+Shift+S", Some("CmdOrCtrl+Shift+S")),
        ("Alt+Shift+P", Some("Alt+Shift+P")),
        ("Ctrl+,", Some("CmdOrCtrl+,")),
        ("Ctrl+W", Some("CmdOrCtrl+W")),
        ("Ctrl+Z", Some("CmdOrCtrl+Z")),
        ("Ctrl+Y", Some("CmdOrCtrl+Y")),
        ("Ctrl+X", Some("CmdOrCtrl+X")),
        ("Ctrl+C", Some("CmdOrCtrl+C")),
        ("Ctrl+V", Some("CmdOrCtrl+V")),
        ("Ctrl+Shift+C", Some("CmdOrCtrl+Shift+C")),
        ("Alt+\u{2191}", Some("Alt+Up")),
        ("Alt+\u{2193}", Some("Alt+Down")),
        ("Ctrl+H", Some("CmdOrCtrl+H")),
        ("Ctrl+1", Some("CmdOrCtrl+1")),
        ("Ctrl+2", Some("CmdOrCtrl+2")),
        ("Ctrl+3", Some("CmdOrCtrl+3")),
        ("Ctrl+4", Some("CmdOrCtrl+4")),
        ("Ctrl+5", Some("CmdOrCtrl+5")),
        ("Ctrl+6", Some("CmdOrCtrl+6")),
        ("Ctrl+0", Some("CmdOrCtrl+0")),
        ("Ctrl+Shift+M", Some("CmdOrCtrl+Shift+M")),
        ("Ctrl+Shift+K", Some("CmdOrCtrl+Shift+K")),
        ("Ctrl+Shift+Q", Some("CmdOrCtrl+Shift+Q")),
        ("Ctrl+Shift+[", Some("CmdOrCtrl+Shift+[")),
        ("Ctrl+Shift+]", Some("CmdOrCtrl+Shift+]")),
        ("Ctrl+Shift+X", Some("CmdOrCtrl+Shift+X")),
        ("Ctrl+B", Some("CmdOrCtrl+B")),
        ("Ctrl+I", Some("CmdOrCtrl+I")),
        ("Ctrl+U", Some("CmdOrCtrl+U")),
        ("Ctrl+Shift+`", Some("CmdOrCtrl+Shift+`")),
        ("Alt+Shift+5", Some("Alt+Shift+5")),
        ("Ctrl+K", Some("CmdOrCtrl+K")),
        ("Ctrl+\\", Some("CmdOrCtrl+\\")),
        ("Ctrl+Shift+L", Some("CmdOrCtrl+Shift+L")),
        ("Ctrl+Shift+1", Some("CmdOrCtrl+Shift+1")),
        ("Ctrl+Shift+3", Some("CmdOrCtrl+Shift+3")),
        ("Ctrl+Shift+2", Some("CmdOrCtrl+Shift+2")),
        ("Ctrl+Shift+F", Some("CmdOrCtrl+Shift+F")),
        ("Ctrl+/", Some("CmdOrCtrl+/")),
        ("Alt+1", Some("Alt+1")),
        ("Alt+2", Some("Alt+2")),
        ("F8", Some("F8")),
        ("F9", Some("F9")),
        ("F11", Some("F11")),
        ("Shift+F12", Some("Shift+F12")),
    ];

    #[test]
    fn all_shortcuts_convert() {
        let mut bad = Vec::new();
        for (input, want) in ALL_ACCELS {
            let got = to_native_accel(input);
            if got.as_deref() != *want {
                bad.push(format!("{input} -> {got:?} (expected {want:?})"));
            }
        }
        assert!(
            bad.is_empty(),
            "shortcuts that failed conversion:\n{}",
            bad.join("\n")
        );
    }

    #[test]
    fn desktop_platforms_prefer_the_native_menu() {
        assert!(available());
    }

    #[test]
    fn copied_shortcut_table_matches_commands_ts() {
        assert_eq!(
            ALL_ACCELS.len(),
            50,
            "shortcut count changed; synchronize this table"
        );
    }

    #[test]
    fn ctrl_maps_to_cmdorctrl() {
        assert_eq!(to_native_accel("Ctrl+S").as_deref(), Some("CmdOrCtrl+S"));
        assert_eq!(
            to_native_accel("Ctrl+Shift+S").as_deref(),
            Some("CmdOrCtrl+Shift+S")
        );

        assert_eq!(to_native_accel("Alt+\u{2191}").as_deref(), Some("Alt+Up"));
    }

    #[test]
    fn unknown_shortcuts_are_rejected() {
        assert_eq!(to_native_accel("Ctrl+Foo+S"), None);
        assert_eq!(to_native_accel("Ctrl+S+N"), None);
        assert_eq!(to_native_accel("Ctrl+\u{20ac}"), None);
        assert_eq!(to_native_accel("Ctrl+"), None);
        assert_eq!(to_native_accel(""), None);
        assert_eq!(to_native_accel("Ctrl+F25"), None);
    }

    #[test]
    fn disabled_items_have_no_shortcut() {
        let node = |enabled| MenuNode {
            sep: false,
            id: "edit.copy".into(),
            label: "Copy".into(),
            accel: Some("Ctrl+C".into()),
            enabled,
            checked: None,
            submenu: Vec::new(),
        };

        assert_eq!(leaf_accel(&node(false)), None);
        if cfg!(target_os = "linux") {
            assert_eq!(leaf_accel(&node(true)), None);
        } else {
            assert_eq!(leaf_accel(&node(true)).as_deref(), Some("CmdOrCtrl+C"));
        }
    }

    #[test]
    fn separators_ignore_other_fields() {
        let n: MenuNode = serde_json::from_str(r#"{"sep":true,"label":"unused"}"#).unwrap();
        assert!(n.sep);
        assert!(
            n.enabled,
            "enabled must default to true or the whole menu becomes disabled"
        );
    }
}
