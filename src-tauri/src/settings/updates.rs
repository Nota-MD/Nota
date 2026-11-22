use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NotificationPosition {
    TopCenter,

    #[default]
    BottomRight,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Updates {
    pub check_on_startup: bool,

    pub notify_when_available: bool,

    pub notification_position: NotificationPosition,
}

impl Default for Updates {
    fn default() -> Self {
        Self {
            check_on_startup: false,
            notify_when_available: true,
            notification_position: NotificationPosition::BottomRight,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_check_is_offline_by_default() {
        let u = Updates::default();
        assert!(!u.check_on_startup);
        assert!(u.notify_when_available);
        assert_eq!(u.notification_position, NotificationPosition::BottomRight);
    }

    #[test]
    fn update_settings_round_trip_with_stable_enum_values() {
        let u = Updates {
            check_on_startup: true,
            notify_when_available: false,
            notification_position: NotificationPosition::TopCenter,
        };
        let text = toml::to_string_pretty(&u).unwrap();
        assert!(text.contains("notification_position = \"top-center\""));
        let back: Updates = toml::from_str(&text).unwrap();
        assert_eq!(back, u);
    }
}
