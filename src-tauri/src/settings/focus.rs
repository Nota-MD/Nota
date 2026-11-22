use serde::{Deserialize, Serialize};

const MINUTE_MS: i64 = 60_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Focus {
    pub total_minutes: u32,

    pub alarm_minutes: u32,

    pub gain_per_minute: f64,

    pub drain_per_minute: f64,

    pub grace_seconds: u32,

    pub sound: bool,

    pub introduced: bool,
}

impl Default for Focus {
    fn default() -> Self {
        Self {
            total_minutes: 25,
            alarm_minutes: 20,
            gain_per_minute: 1.0,
            drain_per_minute: 1.0,
            grace_seconds: 10,
            sound: true,
            introduced: false,
        }
    }
}

impl Focus {
    pub fn cap_millis(&self) -> i64 {
        self.total_minutes as i64 * MINUTE_MS
    }

    pub fn initial_millis(&self) -> i64 {
        (self.alarm_minutes as i64 * MINUTE_MS).min(self.cap_millis())
    }

    pub fn gain(&self, tick_millis: i64) -> i64 {
        (tick_millis as f64 * self.gain_per_minute) as i64
    }

    pub fn drain(&self, tick_millis: i64) -> i64 {
        (tick_millis as f64 * self.drain_per_minute) as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_requested_configuration() {
        let f = Focus::default();
        assert_eq!(f.total_minutes, 25);
        assert_eq!(f.alarm_minutes, 20);
        assert_eq!(f.gain_per_minute, 1.0);
        assert_eq!(f.drain_per_minute, 1.0);
    }

    #[test]
    fn balance_reaches_zero_after_twenty_minutes_of_inaction() {
        let f = Focus::default();
        let mut balance = f.initial_millis();
        let tick = 1000;
        let mut seconds = 0;
        while balance > 0 {
            balance -= f.drain(tick);
            seconds += 1;
            assert!(seconds < 3600, "balance did not reach zero");
        }
        assert_eq!(
            seconds,
            20 * 60,
            "default balance should reach zero after 20 minutes"
        );
    }

    #[test]
    fn balance_is_capped() {
        let f = Focus::default();
        assert_eq!(f.cap_millis(), 25 * MINUTE_MS);
        assert_eq!(f.initial_millis(), 20 * MINUTE_MS);
    }

    #[test]
    fn initial_balance_never_exceeds_the_cap() {
        let f = Focus {
            total_minutes: 5,
            alarm_minutes: 40,
            ..Focus::default()
        };
        assert_eq!(f.initial_millis(), 5 * MINUTE_MS);
    }

    #[test]
    fn weights_can_be_fractional() {
        let f = Focus {
            drain_per_minute: 0.5,
            ..Focus::default()
        };

        assert_eq!(f.drain(60_000), 30_000);
        assert_eq!(f.drain(1000), 500);
    }

    #[test]
    fn grace_period_defaults_to_ten_seconds() {
        assert_eq!(Focus::default().grace_seconds, 10);
    }

    #[test]
    fn alarm_sound_is_enabled_by_default() {
        assert!(Focus::default().sound);
    }

    #[test]
    fn introduction_dialog_is_unseen_by_default() {
        assert!(!Focus::default().introduced);
    }

    #[test]
    fn focus_settings_do_not_inspect_other_applications() {
        let text = toml::to_string_pretty(&Focus::default())
            .unwrap()
            .to_lowercase();
        for forbidden in ["app", "window", "foreground", "xprop", "process", "title"] {
            assert!(
                !text.contains(forbidden),
                "Force Focus settings must not contain {forbidden}:\n{text}"
            );
        }
    }

    #[test]
    fn serialized_shape_uses_a_focus_table() {
        #[derive(Serialize)]
        struct Wrapper {
            focus: Focus,
        }
        let text = toml::to_string_pretty(&Wrapper {
            focus: Focus::default(),
        })
        .unwrap();
        assert!(text.contains("[focus]"), "{text}");
        assert!(text.contains("total_minutes = 25"), "{text}");
    }
}
