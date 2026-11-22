pub mod alarm;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use tauri::{Emitter, Manager};

use crate::settings::Focus;

const YI_PAI: Duration = Duration::from_millis(1000);

const FU_HUO_XIAN_ZUI_XIAO: i64 = 10_000;
const FU_HUO_XIAN_ZUI_DA: i64 = 60_000;

pub const EVENT_FOCUS: &str = "nota:focus-state";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FocusStage {
    Focusing,

    Away { qi_yu_2: Instant },

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
    yu_e_hao_miao: i64,
    shang_xian_hao_miao: i64,
    start_yu: Instant,
    shang_yi_pai: Instant,
    jie_duan: FocusStage,

    lei_ji_zhuan_zhu: Duration,

    lei_ji_li_kai: Duration,

    jing_bao_ci_shu: u32,

    leng_que_zhong: bool,
}

impl FocusSession {
    fn fu_huo_xian(&self) -> i64 {
        (self.shang_xian_hao_miao / 4).clamp(FU_HUO_XIAN_ZUI_XIAO, FU_HUO_XIAN_ZUI_DA)
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
    fn kong() -> Self {
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
    nei: Mutex<Option<FocusSession>>,
}

pub fn start_2(status_2: &FocusState, settings_2: &Focus) -> FocusSnapshot {
    let mut nei = match status_2.nei.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };

    if let Some(s) = nei.as_ref() {
        return install_snapshot(s, settings_2);
    }
    let now = Instant::now();
    *nei = Some(FocusSession {
        yu_e_hao_miao: settings_2.initial_millis(),
        shang_xian_hao_miao: settings_2.cap_millis(),
        start_yu: now,
        shang_yi_pai: now,
        jie_duan: FocusStage::Focusing,
        lei_ji_zhuan_zhu: Duration::ZERO,
        lei_ji_li_kai: Duration::ZERO,
        jing_bao_ci_shu: 0,
        leng_que_zhong: false,
    });
    install_snapshot(nei.as_ref().unwrap(), settings_2)
}

pub fn stop_2(status_2: &FocusState) -> FocusSnapshot {
    let mut nei = match status_2.nei.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    *nei = None;
    FocusSnapshot::kong()
}

pub fn xian_zai(status_2: &FocusState) -> FocusSnapshot {
    let nei = match status_2.nei.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    match nei.as_ref() {
        None => FocusSnapshot::kong(),

        Some(s) => install_snapshot(s, &Focus::default()),
    }
}

pub fn window_kou_jiao_dian(status_2: &FocusState, you_jiao_dian: bool) {
    let mut nei = match status_2.nei.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let Some(s) = nei.as_mut() else { return };
    match (you_jiao_dian, s.jie_duan) {
        (true, FocusStage::Away { .. }) => s.jie_duan = FocusStage::Focusing,

        (false, FocusStage::Focusing) => {
            s.jie_duan = FocusStage::Away {
                qi_yu_2: Instant::now(),
            }
        }
        _ => {}
    }
}

pub fn confirm(status_2: &FocusState) -> FocusSnapshot {
    let mut nei = match status_2.nei.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let Some(s) = nei.as_mut() else {
        return FocusSnapshot::kong();
    };
    s.jie_duan = FocusStage::Focusing;
    s.yu_e_hao_miao = 0;
    s.leng_que_zhong = true;
    install_snapshot(s, &Focus::default())
}

fn install_snapshot(s: &FocusSession, settings_2: &Focus) -> FocusSnapshot {
    let now = Instant::now();

    let jie_duan_ming = s.jie_duan.name_2();
    let zou_shen_duo_jiu = match s.jie_duan {
        FocusStage::Away { qi_yu_2 } => now.saturating_duration_since(qi_yu_2),
        _ => Duration::ZERO,
    };
    FocusSnapshot {
        running: true,
        balance_ms: s.yu_e_hao_miao,
        cap_ms: s.shang_xian_hao_miao,
        phase: jie_duan_ming,
        away_ms: zou_shen_duo_jiu.as_millis() as u64,
        elapsed_ms: now.saturating_duration_since(s.start_yu).as_millis() as u64,
        grace_ms: settings_2.grace_seconds as u64 * 1000,
        focused_ms: s.lei_ji_zhuan_zhu.as_millis() as u64,
        away_total_ms: s.lei_ji_li_kai.as_millis() as u64,
        alarms: s.jing_bao_ci_shu,
    }
}

enum TickOutcome {
    Idle,
    Expired,
}

fn zou_yi_pai(s: &mut FocusSession, settings_2: &Focus, now: Instant) -> TickOutcome {
    let shi_pai = now.saturating_duration_since(s.shang_yi_pai);
    s.shang_yi_pai = now;
    let hao_miao = shi_pai.as_millis() as i64;
    if hao_miao <= 0 {
        return TickOutcome::Idle;
    }

    match s.jie_duan {
        FocusStage::Focusing => {
            s.lei_ji_zhuan_zhu += shi_pai;
            s.yu_e_hao_miao =
                (s.yu_e_hao_miao + settings_2.gain(hao_miao)).min(s.shang_xian_hao_miao);
        }
        FocusStage::Away { qi_yu_2 } => {
            let zou_le = now.saturating_duration_since(qi_yu_2);
            let kuan_xian = Duration::from_secs(settings_2.grace_seconds as u64);
            if zou_le > kuan_xian {
                let kou = settings_2.drain(hao_miao);
                s.lei_ji_li_kai += shi_pai;
                s.yu_e_hao_miao = (s.yu_e_hao_miao - kou).max(0);
            }
        }

        FocusStage::Alarm => {}
    }

    if s.leng_que_zhong && s.yu_e_hao_miao >= s.fu_huo_xian() {
        s.leng_que_zhong = false;
    }

    if s.yu_e_hao_miao <= 0 && !s.leng_que_zhong && s.jie_duan != FocusStage::Alarm {
        s.jie_duan = FocusStage::Alarm;
        s.jing_bao_ci_shu += 1;
        s.leng_que_zhong = true;
        return TickOutcome::Expired;
    }
    TickOutcome::Idle
}

pub fn qi(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(YI_PAI);

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

        let (snapshot_2, xiang_le, jie_duan) = {
            let mut nei = match status_2.nei.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let Some(s) = nei.as_mut() else { continue };
            let r = zou_yi_pai(s, &settings_2, Instant::now());
            (
                install_snapshot(s, &settings_2),
                matches!(r, TickOutcome::Expired),
                s.jie_duan,
            )
        };

        let _ = app.emit(EVENT_FOCUS, &snapshot_2);

        if xiang_le {
            alarm::sound_alarm(&app, &settings_2);
        }

        alarm::reconcile(&app, jie_duan);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn xin_session(settings_2: &Focus) -> FocusSession {
        let now = Instant::now();
        FocusSession {
            yu_e_hao_miao: settings_2.initial_millis(),
            shang_xian_hao_miao: settings_2.cap_millis(),
            start_yu: now,
            shang_yi_pai: now,
            jie_duan: FocusStage::Focusing,
            lei_ji_zhuan_zhu: Duration::ZERO,
            lei_ji_li_kai: Duration::ZERO,
            jing_bao_ci_shu: 0,
            leng_que_zhong: false,
        }
    }

    fn tui_jin(s: &mut FocusSession, settings_2: &Focus, miao: u32) -> u32 {
        let mut t = Instant::now();
        let mut xiang = 0;
        for _ in 0..miao {
            t += Duration::from_secs(1);
            if matches!(zou_yi_pai(s, settings_2, t), TickOutcome::Expired) {
                xiang += 1;
            }
        }
        xiang
    }

    #[test]
    fn yi_zhi_zhuan_zhu_hui_zan_dao_shang_xian_jiu_ting() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);

        s.yu_e_hao_miao = 0;
        tui_jin(&mut s, &settings_2, 3600);
        assert_eq!(s.yu_e_hao_miao, settings_2.cap_millis());
        assert_eq!(s.jing_bao_ci_shu, 0);
    }

    #[test]
    fn yi_zhi_zou_shen_dao_gui_ling_cai_xiang_yi_ci() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);
        s.jie_duan = FocusStage::Away {
            qi_yu_2: Instant::now(),
        };

        s.jie_duan = FocusStage::Away {
            qi_yu_2: Instant::now() - Duration::from_secs(60),
        };
        let xiang = tui_jin(&mut s, &settings_2, 25 * 60);
        assert_eq!(xiang, 1, "\u{9ed8}\u{8ba4}\u{8bbe}\u{7f6e}\u{4e0b}\u{8d70}\u{795e}\u{8be5}\u{53ea}\u{54cd}\u{4e00}\u{6b21}\u{ff08}\u{51b7}\u{5374}\u{7ba1}\u{7740}\u{ff09}");
        assert_eq!(s.yu_e_hao_miao, 0);
    }

    #[test]
    fn kuan_xian_qi_nei_bu_kou_qian() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);
        let yuan = s.yu_e_hao_miao;
        s.jie_duan = FocusStage::Away {
            qi_yu_2: Instant::now(),
        };

        tui_jin(&mut s, &settings_2, 5);
        assert_eq!(
            s.yu_e_hao_miao, yuan,
            "\u{5bbd}\u{9650}\u{671f}\u{5185}\u{4e00}\u{5206}\u{90fd}\u{4e0d}\u{8be5}\u{6263}"
        );
    }

    #[test]
    fn zou_shen_chao_guo_kuan_xian_cai_start_kou() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);
        let yuan = s.yu_e_hao_miao;
        s.jie_duan = FocusStage::Away {
            qi_yu_2: Instant::now() - Duration::from_secs(11),
        };
        tui_jin(&mut s, &settings_2, 10);

        let kou_le = yuan - s.yu_e_hao_miao;
        assert!((9_000..=11_000).contains(&kou_le), "\u{6263}\u{4e86} {kou_le} \u{6beb}\u{79d2}\u{ff0c}\u{8be5}\u{662f} 10 \u{79d2}\u{4e0a}\u{4e0b}");
    }

    #[test]
    fn qie_hui_lai_yi_xia_shua_bu_chu_e_du() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);

        s.jie_duan = FocusStage::Away {
            qi_yu_2: Instant::now() - Duration::from_secs(11),
        };
        tui_jin(&mut s, &settings_2, 19 * 60);
        assert_eq!(
            s.jing_bao_ci_shu, 0,
            "19 \u{5206}\u{949f}\u{8fd8}\u{4e0d}\u{8be5}\u{54cd}"
        );

        assert!(
            (58_000..=62_000).contains(&s.yu_e_hao_miao),
            "\u{8d70}\u{795e} 19 \u{5206}\u{949f}\u{8be5}\u{53ea}\u{5269}\u{4e00}\u{5206}\u{949f}\u{4e0a}\u{4e0b}\u{ff0c}\u{5b9e}\u{5f97} {}",
            s.yu_e_hao_miao
        );

        s.jie_duan = FocusStage::Focusing;
        tui_jin(&mut s, &settings_2, 3);
        assert!(
            s.yu_e_hao_miao < 66_000,
            "\u{5207}\u{56de}\u{6765} 3 \u{79d2}\u{53ea}\u{8be5}\u{8865}\u{56de} 3 \u{79d2}\u{ff0c}\u{5b9e}\u{5f97} {}",
            s.yu_e_hao_miao
        );

        s.jie_duan = FocusStage::Away {
            qi_yu_2: Instant::now() - Duration::from_secs(11),
        };
        let xiang = tui_jin(&mut s, &settings_2, 120);
        assert_eq!(xiang, 1, "\u{9760}\u{5207}\u{56de}\u{6765} 3 \u{79d2}\u{7eed}\u{547d}\u{ff0c}\u{5f88}\u{5feb}\u{5c31}\u{8be5}\u{54cd}\u{4e86}");
        assert_eq!(s.jing_bao_ci_shu, 1, "\u{54cd}\u{8fc7}\u{4e00}\u{6b21}\u{4e4b}\u{540e}\u{51b7}\u{5374}\u{7ba1}\u{7740}\u{ff0c}\u{4e0d}\u{8be5}\u{8fde}\u{7740}\u{54cd}");
    }

    #[test]
    fn jing_bao_zhong_zhang_ben_dong_jie() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);
        s.jie_duan = FocusStage::Alarm;
        s.yu_e_hao_miao = 0;
        let xiang = tui_jin(&mut s, &settings_2, 600);
        assert_eq!(
            xiang, 0,
            "\u{8b66}\u{62a5}\u{4e2d}\u{4e0d}\u{8be5}\u{91cd}\u{590d}\u{89e6}\u{53d1}"
        );
        assert_eq!(
            s.yu_e_hao_miao, 0,
            "\u{8b66}\u{62a5}\u{4e2d}\u{4f59}\u{989d}\u{4e0d}\u{8be5}\u{52a8}"
        );
    }

    #[test]
    fn leng_que_yao_zan_hui_fu_huo_xian_cai_jie_chu() {
        let settings_2 = Focus::default();
        let mut s = xin_session(&settings_2);
        s.leng_que_zhong = true;
        s.yu_e_hao_miao = 0;
        s.jie_duan = FocusStage::Focusing;

        tui_jin(&mut s, &settings_2, 10);
        assert!(
            s.leng_que_zhong,
            "\u{624d}\u{6512} 10 \u{79d2}\u{ff0c}\u{51b7}\u{5374}\u{4e0d}\u{8be5}\u{89e3}\u{9664}"
        );
        assert!(s.yu_e_hao_miao < s.fu_huo_xian());

        tui_jin(&mut s, &settings_2, 120);
        assert!(
            !s.leng_que_zhong,
            "\u{6512}\u{8fc7}\u{590d}\u{6d3b}\u{7ebf}\u{8be5}\u{89e3}\u{9664}\u{51b7}\u{5374}"
        );
    }

    #[test]
    fn confirm_zhi_hou_yu_e_gui_ling_qie_dai_leng_que() {
        let status_2 = FocusState::default();
        let settings_2 = Focus::default();
        start_2(&status_2, &settings_2);
        confirm(&status_2);
        let snapshot_2 = xian_zai(&status_2);
        assert!(snapshot_2.running);
        assert_eq!(snapshot_2.balance_ms, 0);
    }

    #[test]
    fn mei_zai_pao_de_shi_hou_yi_qie_dou_shi_kong_de() {
        let status_2 = FocusState::default();
        let snapshot_2 = xian_zai(&status_2);
        assert!(!snapshot_2.running);
        assert_eq!(snapshot_2.balance_ms, 0);
    }

    #[test]
    fn zhong_fu_start_bu_hui_zhong_zhi_yu_e() {
        let status_2 = FocusState::default();
        let settings_2 = Focus::default();
        start_2(&status_2, &settings_2);
        {
            let mut nei = status_2.nei.lock().unwrap();
            nei.as_mut().unwrap().yu_e_hao_miao = 12345;
        }
        let snapshot_2 = start_2(&status_2, &settings_2);
        assert_eq!(snapshot_2.balance_ms, 12345, "\u{7b2c}\u{4e8c}\u{6b21}\u{5f00}\u{59cb}\u{4e0d}\u{8be5}\u{628a}\u{4f59}\u{989d}\u{6e05}\u{6389}");
    }

    #[test]
    fn stop_zhi_hou_snapshot_shi_kong_de() {
        let status_2 = FocusState::default();
        start_2(&status_2, &Focus::default());
        stop_2(&status_2);
        assert!(!xian_zai(&status_2).running);
    }

    #[test]
    fn de_jiao_hui_ba_zou_shen_gai_hui_zhuan_zhu() {
        let status_2 = FocusState::default();
        start_2(&status_2, &Focus::default());
        window_kou_jiao_dian(&status_2, false);
        assert_eq!(xian_zai(&status_2).phase, "away");
        window_kou_jiao_dian(&status_2, true);
        assert_eq!(xian_zai(&status_2).phase, "focusing");
    }

    #[test]
    fn jing_bao_zhong_shi_jiao_bu_hui_gai_jie_duan() {
        let status_2 = FocusState::default();
        start_2(&status_2, &Focus::default());
        {
            let mut nei = status_2.nei.lock().unwrap();
            nei.as_mut().unwrap().jie_duan = FocusStage::Alarm;
        }
        window_kou_jiao_dian(&status_2, false);
        assert_eq!(xian_zai(&status_2).phase, "alarm", "\u{8b66}\u{62a5}\u{4e2d}\u{4e0d}\u{80fd}\u{88ab}\u{5931}\u{7126}\u{4e8b}\u{4ef6}\u{62fd}\u{8d70}");
    }
}
