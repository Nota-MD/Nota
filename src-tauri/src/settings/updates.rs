//! 「更新设置」页。
//!
//! 这里只保存更新检查与通知的偏好。网络请求、安装包选择、摘要校验和覆盖安装
//! 都在 `crate::update`；设置层不持有任何更新状态，也不决定某个平台能否安装。
//!
//! ⚠️ 启动检查默认关闭。更新下载会访问网络，实验阶段不应在用户没选过的情况下
//! 自动发起请求。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NotificationPosition {
    /// 窗口上方居中。
    TopCenter,
    /// 窗口右下角。与旧版提示位置一致。
    #[default]
    BottomRight,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Updates {
    /// 每次启动后在后台检查一次。
    pub check_on_startup: bool,
    /// 检查发现新版本时显示一条可操作的常驻通知。
    /// 只有 `check_on_startup` 开启时界面才允许修改这一项。
    pub notify_when_available: bool,
    /// 所有应用内通知的位置。
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
    fn 更新检查默认不联网() {
        let u = Updates::default();
        assert!(!u.check_on_startup);
        assert!(u.notify_when_available);
        assert_eq!(
            u.notification_position,
            NotificationPosition::BottomRight
        );
    }

    #[test]
    fn 更新设置能按固定枚举值往返() {
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
