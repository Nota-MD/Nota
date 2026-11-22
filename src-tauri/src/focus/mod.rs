pub mod alarm;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use tauri::{Emitter, Manager};

use crate::settings::Focus;

const ONE_SCHEDULE: Duration = Duration::from_millis(1000);

const SERVICE_ACTIVE_THREAD_MOST_SMALL: i64 = 10_000;
const SERVICE_ACTIVE_THREAD_MOST_LARGE: i64 = 60_000;

pub const EVENT_FOCUS: &str = "nota:focus-state";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FocusStage {
    Focusing,

    Away { start_and_2: Instant },

    Alarm,
}

impl FocusStage {
    fn name_2(&self) -> &'static str {
        match self {
            FocusStage::Focusing => "focusing",
            FocusStage::Away { .. } => "away",
            FocusStage::Alarm => "alarm",
        }
    }
}

struct FocusSession {
    and_e_number_description: i64,
    upper_thread_number_description: i64,
    start_and: Instant,
    upper_one_schedule: Instant,
    boundary_segment: FocusStage,

    kind_record_convert_main: Duration,

    kind_record_inner_start: Duration,

    static_package_word_data: u32,

    cold_missing_middle: bool,
}

impl FocusSession {
    fn service_active_thread(&self) -> i64 {
        (self.upper_thread_number_description / 4).clamp(
            SERVICE_ACTIVE_THREAD_MOST_SMALL,
            SERVICE_ACTIVE_THREAD_MOST_LARGE,
        )
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusSnapshot {
    pub running: bool,

    pub balance_ms: i64,

    pub cap_ms: i64,

    pub phase: &'static str,

    pub away_ms: u64,

    pub grace_ms: u64,

    pub elapsed_ms: u64,

    pub focused_ms: u64,

    pub away_total_ms: u64,

    pub alarms: u32,
}

impl FocusSnapshot {
    fn empty() -> Self {
        Self {
            running: false,
            balance_ms: 0,
            cap_ms: 0,
            phase: "focusing",
            away_ms: 0,
            grace_ms: 0,
            elapsed_ms: 0,
            focused_ms: 0,
            away_total_ms: 0,
            alarms: 0,
        }
    }
}

#[derive(Default)]
pub struct FocusState {
    inner: Mutex<Option<FocusSession>>,
}

pub fn start_2(status_2: &FocusState, settings_2: &Focus) -> FocusSnapshot {
    let mut inner = match status_2.inner.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };

    if let Some(s) = inner.as_ref() {
        return install_snapshot(s, settings_2);
    }
    let now = Instant::now();
    *inner = Some(FocusSession {
        and_e_number_description: settings_2.initial_millis(),
        upper_thread_number_description: settings_2.cap_millis(),
        start_and: now,
        upper_one_schedule: now,
        boundary_segment: FocusStage::Focusing,
        kind_record_convert_main: Duration::ZERO,
        kind_record_inner_start: Duration::ZERO,
        static_package_word_data: 0,
        cold_missing_middle: false,
    });
    install_snapshot(inner.as_ref().unwrap(), settings_2)
}

pub fn stop_2(status_2: &FocusState) -> FocusSnapshot {
    let mut inner = match status_2.inner.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    *inner = None;
    FocusSnapshot::empty()
}

pub fn now(status_2: &FocusState) -> FocusSnapshot {
    let inner = match status_2.inner.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    match inner.as_ref() {
        None => FocusSnapshot::empty(),

        Some(s) => install_snapshot(s, &Focus::default()),
    }
}

pub fn window_port_call_point(status_2: &FocusState, has_call_point: bool) {
    let mut inner = match status_2.inner.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let Some(s) = inner.as_mut() else { return };
    match (has_call_point, s.boundary_segment) {
        (true, FocusStage::Away { .. }) => s.boundary_segment = FocusStage::Focusing,

        (false, FocusStage::Focusing) => {
            s.boundary_segment = FocusStage::Away {
                start_and_2: Instant::now(),
            }
        }
        _ => {}
    }
}

pub fn confirm(status_2: &FocusState) -> FocusSnapshot {
    let mut inner = match status_2.inner.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let Some(s) = inner.as_mut() else {
        return FocusSnapshot::empty();
    };
    s.boundary_segment = FocusStage::Focusing;
    s.and_e_number_description = 0;
    s.cold_missing_middle = true;
    install_snapshot(s, &Focus::default())
}

fn install_snapshot(s: &FocusSession, settings_2: &Focus) -> FocusSnapshot {
    let now = Instant::now();

    let boundary_segment_name = s.boundary_segment.name_2();
    let walk_deep_multiple_old = match s.boundary_segment {
        FocusStage::Away { start_and_2 } => now.saturating_duration_since(start_and_2),
        _ => Duration::ZERO,
    };
    FocusSnapshot {
        running: true,
        balance_ms: s.and_e_number_description,
        cap_ms: s.upper_thread_number_description,
        phase: boundary_segment_name,
        away_ms: walk_deep_multiple_old.as_millis() as u64,
        elapsed_ms: now.saturating_duration_since(s.start_and).as_millis() as u64,
        grace_ms: settings_2.grace_seconds as u64 * 1000,
        focused_ms: s.kind_record_convert_main.as_millis() as u64,
        away_total_ms: s.kind_record_inner_start.as_millis() as u64,
        alarms: s.static_package_word_data,
    }
}

enum TickOutcome {
    Idle,
    Expired,
}

fn walk_one_schedule(s: &mut FocusSession, settings_2: &Focus, now: Instant) -> TickOutcome {
    let is_schedule = now.saturating_duration_since(s.upper_one_schedule);
    s.upper_one_schedule = now;
    let number_description = is_schedule.as_millis() as i64;
    if number_description <= 0 {
        return TickOutcome::Idle;
    }

    match s.boundary_segment {
        FocusStage::Focusing => {
            s.kind_record_convert_main += is_schedule;
            s.and_e_number_description = (s.and_e_number_description
                + settings_2.gain(number_description))
            .min(s.upper_thread_number_description);
        }
        FocusStage::Away { start_and_2 } => {
            let walk = now.saturating_duration_since(start_and_2);
            let width_thread = Duration::from_secs(settings_2.grace_seconds as u64);
            if walk > width_thread {
                let port = settings_2.drain(number_description);
                s.kind_record_inner_start += is_schedule;
                s.and_e_number_description = (s.and_e_number_description - port).max(0);
            }
        }

        FocusStage::Alarm => {}
    }

    if s.cold_missing_middle && s.and_e_number_description >= s.service_active_thread() {
        s.cold_missing_middle = false;
    }

    if s.and_e_number_description <= 0
        && !s.cold_missing_middle
        && s.boundary_segment != FocusStage::Alarm
    {
        s.boundary_segment = FocusStage::Alarm;
        s.static_package_word_data += 1;
        s.cold_missing_middle = true;
        return TickOutcome::Expired;
    }
    TickOutcome::Idle
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(ONE_SCHEDULE);

        let Some(status_2) = app.try_state::<FocusState>() else {
            continue;
        };
        let Some(app_2) = app.try_state::<crate::state::AppState>() else {
            continue;
        };

        let settings_2 = match app_2.settings.lock() {
            Ok(g) => g.focus.clone(),
            Err(_) => continue,
        };

        let (snapshot_2, item, boundary_segment) = {
            let mut inner = match status_2.inner.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let Some(s) = inner.as_mut() else { continue };
            let r = walk_one_schedule(s, &settings_2, Instant::now());
            (
                install_snapshot(s, &settings_2),
                matches!(r, TickOutcome::Expired),
                s.boundary_segment,
            )
        };

        let _ = app.emit(EVENT_FOCUS, &snapshot_2);

        if item {
            alarm::sound_alarm(&app, &settings_2);
        }

        alarm::reconcile(&app, boundary_segment);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_session(settings_2: &Focus) -> FocusSession {
        let now = Instant::now();
        FocusSession {
            and_e_number_description: settings_2.initial_millis(),
            upper_thread_number_description: settings_2.cap_millis(),
            start_and: now,
            upper_one_schedule: now,
            boundary_segment: FocusStage::Focusing,
            kind_record_convert_main: Duration::ZERO,
            kind_record_inner_start: Duration::ZERO,
            static_package_word_data: 0,
            cold_missing_middle: false,
        }
    }

    fn derive_enter(s: &mut FocusSession, settings_2: &Focus, description: u32) -> u32 {
        let mut t = Instant::now();
        let mut item = 0;
        for _ in 0..description {
            t += Duration::from_secs(1);
            if matches!(walk_one_schedule(s, settings_2, t), TickOutcome::Expired) {
                item += 1;
            }
        }
        item
    }

    #[test]
    fn one_only_convert_main_return_zan_to_upper_thread_old_listen() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);

        s.and_e_number_description = 0;
        derive_enter(&mut s, &settings_2, 3600);
        assert_eq!(s.and_e_number_description, settings_2.cap_millis());
        assert_eq!(s.static_package_word_data, 0);
    }

    #[test]
    fn one_only_walk_deep_to_normalize_zero_extract_item_one_word() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);
        s.boundary_segment = FocusStage::Away {
            start_and_2: Instant::now(),
        };

        s.boundary_segment = FocusStage::Away {
            start_and_2: Instant::now() - Duration::from_secs(60),
        };
        let item = derive_enter(&mut s, &settings_2, 25 * 60);
        assert_eq!(item, 1, "\u{9ed8}\u{8ba4}\u{8bbe}\u{7f6e}\u{4e0b}\u{8d70}\u{795e}\u{8be5}\u{53ea}\u{54cd}\u{4e00}\u{6b21}\u{ff08}\u{51b7}\u{5374}\u{7ba1}\u{7740}\u{ff09}");
        assert_eq!(s.and_e_number_description, 0);
    }

    #[test]
    fn width_thread_start_inner_not_port_before() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);
        let source = s.and_e_number_description;
        s.boundary_segment = FocusStage::Away {
            start_and_2: Instant::now(),
        };

        derive_enter(&mut s, &settings_2, 5);
        assert_eq!(
            s.and_e_number_description, source,
            "\u{5bbd}\u{9650}\u{671f}\u{5185}\u{4e00}\u{5206}\u{90fd}\u{4e0d}\u{8be5}\u{6263}"
        );
    }

    #[test]
    fn walk_deep_overflow_passed_width_thread_extract_start_port() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);
        let source = s.and_e_number_description;
        s.boundary_segment = FocusStage::Away {
            start_and_2: Instant::now() - Duration::from_secs(11),
        };
        derive_enter(&mut s, &settings_2, 10);

        let port = source - s.and_e_number_description;
        assert!((9_000..=11_000).contains(&port), "\u{6263}\u{4e86} {port} \u{6beb}\u{79d2}\u{ff0c}\u{8be5}\u{662f} 10 \u{79d2}\u{4e0a}\u{4e0b}");
    }

    #[test]
    fn cut_return_incoming_one_lower_refresh_not_out_e_read() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);

        s.boundary_segment = FocusStage::Away {
            start_and_2: Instant::now() - Duration::from_secs(11),
        };
        derive_enter(&mut s, &settings_2, 19 * 60);
        assert_eq!(
            s.static_package_word_data, 0,
            "19 \u{5206}\u{949f}\u{8fd8}\u{4e0d}\u{8be5}\u{54cd}"
        );

        assert!(
            (58_000..=62_000).contains(&s.and_e_number_description),
            "\u{8d70}\u{795e} 19 \u{5206}\u{949f}\u{8be5}\u{53ea}\u{5269}\u{4e00}\u{5206}\u{949f}\u{4e0a}\u{4e0b}\u{ff0c}\u{5b9e}\u{5f97} {}",
            s.and_e_number_description
        );

        s.boundary_segment = FocusStage::Focusing;
        derive_enter(&mut s, &settings_2, 3);
        assert!(
            s.and_e_number_description < 66_000,
            "\u{5207}\u{56de}\u{6765} 3 \u{79d2}\u{53ea}\u{8be5}\u{8865}\u{56de} 3 \u{79d2}\u{ff0c}\u{5b9e}\u{5f97} {}",
            s.and_e_number_description
        );

        s.boundary_segment = FocusStage::Away {
            start_and_2: Instant::now() - Duration::from_secs(11),
        };
        let item = derive_enter(&mut s, &settings_2, 120);
        assert_eq!(item, 1, "\u{9760}\u{5207}\u{56de}\u{6765} 3 \u{79d2}\u{7eed}\u{547d}\u{ff0c}\u{5f88}\u{5feb}\u{5c31}\u{8be5}\u{54cd}\u{4e86}");
        assert_eq!(s.static_package_word_data, 1, "\u{54cd}\u{8fc7}\u{4e00}\u{6b21}\u{4e4b}\u{540e}\u{51b7}\u{5374}\u{7ba1}\u{7740}\u{ff0c}\u{4e0d}\u{8be5}\u{8fde}\u{7740}\u{54cd}");
    }

    #[test]
    fn static_package_middle_length_current_dynamic_boundary() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);
        s.boundary_segment = FocusStage::Alarm;
        s.and_e_number_description = 0;
        let item = derive_enter(&mut s, &settings_2, 600);
        assert_eq!(
            item, 0,
            "\u{8b66}\u{62a5}\u{4e2d}\u{4e0d}\u{8be5}\u{91cd}\u{590d}\u{89e6}\u{53d1}"
        );
        assert_eq!(
            s.and_e_number_description, 0,
            "\u{8b66}\u{62a5}\u{4e2d}\u{4f59}\u{989d}\u{4e0d}\u{8be5}\u{52a8}"
        );
    }

    #[test]
    fn cold_missing_need_zan_return_service_active_thread_extract_boundary_out() {
        let settings_2 = Focus::default();
        let mut s = new_session(&settings_2);
        s.cold_missing_middle = true;
        s.and_e_number_description = 0;
        s.boundary_segment = FocusStage::Focusing;

        derive_enter(&mut s, &settings_2, 10);
        assert!(
            s.cold_missing_middle,
            "\u{624d}\u{6512} 10 \u{79d2}\u{ff0c}\u{51b7}\u{5374}\u{4e0d}\u{8be5}\u{89e3}\u{9664}"
        );
        assert!(s.and_e_number_description < s.service_active_thread());

        derive_enter(&mut s, &settings_2, 120);
        assert!(
            !s.cold_missing_middle,
            "\u{6512}\u{8fc7}\u{590d}\u{6d3b}\u{7ebf}\u{8be5}\u{89e3}\u{9664}\u{51b7}\u{5374}"
        );
    }

    #[test]
    fn confirm_only_after_and_e_normalize_zero_cut_pending_cold_missing() {
        let status_2 = FocusState::default();
        let settings_2 = Focus::default();
        start_2(&status_2, &settings_2);
        confirm(&status_2);
        let snapshot_2 = now(&status_2);
        assert!(snapshot_2.running);
        assert_eq!(snapshot_2.balance_ms, 0);
    }

    #[test]
    fn each_at_run_is_after_one_cut_all_is_empty() {
        let status_2 = FocusState::default();
        let snapshot_2 = now(&status_2);
        assert!(!snapshot_2.running);
        assert_eq!(snapshot_2.balance_ms, 0);
    }

    #[test]
    fn middle_service_start_not_return_middle_only_and_e() {
        let status_2 = FocusState::default();
        let settings_2 = Focus::default();
        start_2(&status_2, &settings_2);
        {
            let mut inner = status_2.inner.lock().unwrap();
            inner.as_mut().unwrap().and_e_number_description = 12345;
        }
        let snapshot_2 = start_2(&status_2, &settings_2);
        assert_eq!(snapshot_2.balance_ms, 12345, "\u{7b2c}\u{4e8c}\u{6b21}\u{5f00}\u{59cb}\u{4e0d}\u{8be5}\u{628a}\u{4f59}\u{989d}\u{6e05}\u{6389}");
    }

    #[test]
    fn stop_only_after_snapshot_is_empty() {
        let status_2 = FocusState::default();
        start_2(&status_2, &Focus::default());
        stop_2(&status_2);
        assert!(!now(&status_2).running);
    }

    #[test]
    fn call_return_handle_walk_deep_change_return_convert_main() {
        let status_2 = FocusState::default();
        start_2(&status_2, &Focus::default());
        window_port_call_point(&status_2, false);
        assert_eq!(now(&status_2).phase, "away");
        window_port_call_point(&status_2, true);
        assert_eq!(now(&status_2).phase, "focusing");
    }

    #[test]
    fn static_package_middle_is_call_not_return_change_boundary_segment() {
        let status_2 = FocusState::default();
        start_2(&status_2, &Focus::default());
        {
            let mut inner = status_2.inner.lock().unwrap();
            inner.as_mut().unwrap().boundary_segment = FocusStage::Alarm;
        }
        window_port_call_point(&status_2, false);
        assert_eq!(now(&status_2).phase, "alarm", "\u{8b66}\u{62a5}\u{4e2d}\u{4e0d}\u{80fd}\u{88ab}\u{5931}\u{7126}\u{4e8b}\u{4ef6}\u{62fd}\u{8d70}");
    }
}
