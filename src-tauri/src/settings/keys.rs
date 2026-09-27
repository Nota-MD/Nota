//! 「快捷键」那一页里**用户改过的那几条**。
//!
//! # 为什么只存"改过的"，不存整张表
//!
//! 整张表的真相源是 `src/ui/commands.ts` 的 `MENUS`（前端）。存整张表的两个坏处：
//!
//! 1. **加了新命令，老用户的设置里没有它** —— 于是"表里有几条"和"实际有几条命令"
//!    就出现了两个数，而缺的那条会静默地没有快捷键；
//! 2. 改一个默认键位（哪怕是修一个撞车），**所有用户都被钉在旧值上**，
//!    因为他们那份完整快照里存着旧值。
//!
//! 只存差量就没有这两个问题：没动过的命令永远跟着 `commands.ts` 走。
//!
//! # 值的两种含义
//!
//! 键是**命令 id**（`file.saveAs` 这种，和 `MENUS` 里那个 `id` 是同一个），
//! 值是**键位串**（`Ctrl+Shift+S` 这种，和 `MENUS` 里 `accel` 的写法同一套语法）。
//!
//! | 表里 | 含义 |
//! |---|---|
//! | **没有这个 id** | 用 `commands.ts` 里的默认键位（可能本来就没有） |
//! | 有，值非空 | 用这个键位 |
//! | 有，值是**空串** | **这条命令不要快捷键** |
//!
//! ⚠️ **空串那一档是必需的，不是"顺带支持"**：用户想把某条的键位腾出来给别条用，
//! 就得能把它清掉；而"从表里删掉这一项"表达的是"回到默认"，正好相反。
//! 两者必须能分开，否则用户改不回默认。
//!
//! ⚠️ **这里不做清洗、不做校验**（不认得的 id、认不出的键位串，原样存原样取）。
//! 有两个理由：① 判据（认不认得）在前端，那份表在 `commands.ts`，在这儿重写一遍
//! 迟早两边不一致；② 手写 `settings.toml` 的人写错一个键位，前端会当"没有快捷键"
//! 处理，不炸——这和别的设置项的待遇一致，没必要单独为它加一层报错。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Keys {
    /// 命令 id → 键位串。**只放用户动过的那些**，理由见文件头。
    ///
    /// ⚠️ 用 `BTreeMap` 而不是 `HashMap`：它要写进 TOML，**按键名排序**之后
    /// 每次存盘的字节是一样的，用户拿它去 diff 或者交给版本管理时不会满屏乱跳。
    pub overrides: BTreeMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    /// 从别处借一个 `Settings` 进来，只为看它序列化之后长什么样。
    use crate::settings::Settings;

    #[test]
    fn 快捷键覆盖默认是空的() {
        // ⚠️ 空表 ＝ "一条都没改过" ＝ 全部跟着 `commands.ts` 走。
        // 这一条要红，先想清楚"新装一份 Nota 该不该自带一份键位快照"。
        assert!(Keys::default().overrides.is_empty());
    }

    #[test]
    fn 默认序列化出来也留着那一节() {
        // ⚠️ `#[serde(default)]` 让**读**的时候缺一节不报错，但**写**的时候
        // 仍然要写出这一节（空表也写）。少写一节的话，用户打开
        // `settings.toml` 找不到"在哪儿改快捷键"——而设置文件是这个应用
        // 唯一的高级设置入口（见 `general.rs` 头上的说明）。
        //
        // ⚠️ 形状是 `[keys.overrides]`（一层套一层），**不是** `[keys]`：
        // `Keys` 是个结构体、里面那个 map 叫 `overrides`。这条断言第一版
        // 就是照 `[keys]` 写的，当场红了——写成前缀匹配，两种形状都认。
        let text = toml::to_string_pretty(&Settings::default()).unwrap();
        assert!(text.contains("[keys"), "设置文件里该有 keys 这一节：\n{text}");
    }

    #[test]
    fn 改过的键位能存能读() {
        let mut s = Settings::default();
        s.keys.overrides.insert("file.saveAs".into(), "Ctrl+Alt+S".into());
        let text = toml::to_string_pretty(&s).unwrap();
        let back: Settings = toml::from_str(&text).unwrap();
        assert_eq!(back.keys.overrides.get("file.saveAs").map(String::as_str), Some("Ctrl+Alt+S"));
    }

    #[test]
    fn 空串和不在表里是两件事() {
        // ⚠️ **这一条是这一节的判据**（文件头那张表）：空串 ＝ "这条不要快捷键"，
        // 不在表里 ＝ "用默认"。两者绝不能合并——合并之后用户**改不回默认**。
        let mut s = Settings::default();
        s.keys.overrides.insert("view.forceFocus".into(), String::new());
        let text = toml::to_string_pretty(&s).unwrap();
        let back: Settings = toml::from_str(&text).unwrap();

        assert_eq!(
            back.keys.overrides.get("view.forceFocus").map(String::as_str),
            Some(""),
            "空串要能原样存回来（它表示「这条不要快捷键」）"
        );
        assert_eq!(
            back.keys.overrides.get("file.save"),
            None,
            "没动过的命令**不能**出现在表里（出现就等于把默认值钉死了）"
        );
    }

    #[test]
    fn 老设置文件里没有这一节也能读() {
        // ⚠️ 承重：`#[serde(default)]` 就是为这一条存在的。这也正是
        // "只存差量"那个设计的另一半——老用户的文件里没有 `[keys]`，
        // 读进来是一张空表，一切照默认走。
        let old = "language = \"zh-CN\"\n";
        let s: Settings = toml::from_str(old).unwrap();
        assert!(s.keys.overrides.is_empty());
    }
}
