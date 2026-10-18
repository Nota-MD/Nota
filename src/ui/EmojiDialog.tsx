/**
 * 「插入 Emoji」这个框（搜索框 ＋ 一排分类 ＋ 一张网格）。
 *
 * # 它和「补全面板」不是一回事
 *
 * 那个面板（`editor/emoji.ts` 的 `emoji补全`）是**在打字时跟着光标弹的**，
 * 只在用户已经打出 `:smi` 之后才可能出现；这个框是**用户主动叫出来的**
 * ——"我要找一个 emoji，但不知道该打哪个短代码"。
 *
 * ⚠️ 两者的搜索口径**故意不一样**：面板**只做前缀匹配**（打 `:a` 若做子串，
 * 会命中几百条，反而挡着人），这个框**做子串匹配**——用户在这儿是**在找**，
 * 多给几条候选比少给好。⚠️ 所以这里没有复用 `找Emoji`，用的是 `Emoji表`
 * 上的 `includes`。两条口径各自的理由都写在它自己那一处。
 *
 * # ⚠️ 这个框不碰文档
 *
 * 它只回一个字符，往哪儿插、插完光标在哪，全归调用方（`App.tsx` 走
 * `run("insertText", …)`，与「插入图像」那条路同一个口径：框不持有编辑器）。
 *
 * ⚠️ 按钮顺序、Esc = 取消、点遮罩 = 取消，三条和另外三个框一致
 * （`ConfirmDialog` / `PromptDialog` / `ImageDialog`）。
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useT } from "@/i18n";
import { Emoji表, Emoji分类, 带冒号, type Emoji项 } from "@/editor/emoji";
import { DialogClose } from "@/ui/DialogClose";
import { useTablistKeys } from "@/ui/useTablistKeys";

export function EmojiDialog({
  onAnswer,
}: {
  /** 选中的字符；取消给 `null`（与另外三个框同形）。 */
  onAnswer: (字符: string | null) => void;
}) {
  // ⚠️ 这一行不只是取值：它订阅了语言（见 `i18n/index.ts::useT`）。
  const t = useT();
  const [搜索, set搜索] = useState("");
  /** 当前分类，`null` = 全部。 */
  const [分类, set分类] = useState<string | null>(null);
  const 输入框 = useRef<HTMLInputElement>(null);
  // 分类页签的方向键（第 50 项，2026-10-04）。
  const 页签栏 = useRef<HTMLDivElement>(null);
  useTablistKeys(页签栏);

  useEffect(() => {
    输入框.current?.focus();
  }, []);

  /**
   * 过一遍表：先按分类圈定，再按搜索串过滤。
   *
   * ⚠️ 搜索串**两头各去掉一个冒号**（`:` 是短代码的壳，用户很自然会带着打
   * ——面板里看起来就是 `:smile:`），并转小写（短代码全是小写）。
   */
  const 结果 = useMemo<Emoji项[]>(() => {
    const 池 = 分类 === null ? Emoji表 : Emoji表.filter((项) => 项.分类 === 分类);
    const 串 = 搜索.trim().replace(/^:/, "").replace(/:$/, "").toLowerCase();
    if (串 === "") return 池;
    return 池.filter((项) => 项.短代码.includes(串));
  }, [搜索, 分类]);

  /**
   * 分类名 → 译文。
   *
   * ⚠️ **十一条键逐个写成字面量**（不是 `t(一类)`）：`tools/i18n-check.sh`
   * 只认源码里的字面量，写成 `t(变量)` 的话那十一条英文会被算成"废键"
   * （判据 ②，FAIL——它把"这句原文没人用"当成"英文白翻了"）。
   * ⚠️ 也不能把这十一个分类名当普通数据放进 `zh-ui.ts` 那种表里蒙过去：
   * 检查器只把 `ui/commands.ts` / `ui/view-modes.ts` 当"表存键"的文件，
   * 而 `editor/emoji.ts` **恰恰不能**进那个名单——那里的中文是**数据**
   * （分类名本身），进去会把 503 条表项全算成键。
   *
   * ⚠️ `default` **原样还回去**，不吞：表里将来多一个分类，用户看到的是那个
   * 中文名，而不是一片空白。
   */
  const 分类文案 = (一类: string) => {
    switch (一类) {
      case "表情":
        return t("Smileys");
      case "手势":
        return t("Gestures");
      case "人物":
        return t("People");
      case "动物":
        return t("Animals");
      case "食物":
        return t("Food");
      case "活动":
        return t("Activities");
      case "旅行":
        return t("Travel");
      case "自然":
        return t("Nature");
      case "物件":
        return t("Objects");
      case "符号":
        return t("Symbols");
      case "旗帜":
        return t("Flags");
      default:
        return 一类;
    }
  };

  /**
   * 回车＝选第一条。
   *
   * ⚠️ 没有"上下键选、高亮当前那条"这一层：那一层要维护一个选中下标，
   * 而它的收益（少点一次鼠标）在**一个"我在找东西"的框里**不成立——用户
   * 还在看着网格挑。⚠️ 面板那边**必须**有上下键（那是打字流里，手不在鼠标上）。
   */
  const 回车或退出 = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const 第一条 = 结果[0];
      if (第一条) onAnswer(第一条.字符);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onAnswer(null);
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        className="confirm-dialog emoji-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Insert Emoji")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{t("Insert Emoji")}</h2>

        <input
          id="nota-emoji-search"
          ref={输入框}
          className="prompt-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={搜索}
          placeholder={t("Search shortcodes, e.g. smi or check")}
          onChange={(e) => set搜索(e.target.value)}
          onKeyDown={回车或退出}
        />

        {/* 分类筛选。⚠️ 「全部」在最前、`null` 表示它——不摆一个"全部"的话，
            用户进了某个分类就出不来了（只能关掉框重开）。 */}
        <div ref={页签栏} className="emoji-cats" role="tablist" aria-label={t("Emoji category")}>
          <button
            type="button"
            role="tab"
            aria-selected={分类 === null}
            className={`btn emoji-cat ${分类 === null ? "btn-primary" : ""}`}
            onClick={() => set分类(null)}
          >
            {t("All")}
          </button>
          {Emoji分类.map((一类) => (
            <button
              key={一类}
              type="button"
              role="tab"
              aria-selected={分类 === 一类}
              className={`btn emoji-cat ${分类 === 一类 ? "btn-primary" : ""}`}
              onClick={() => set分类(一类)}
            >
              {分类文案(一类)}
            </button>
          ))}
        </div>

        {结果.length === 0 ? (
          <p className="prompt-hint">{t("No matching emoji.")}</p>
        ) : (
          <div className="emoji-grid">
            {结果.map((项) => (
              // ⚠️ `key` 用短代码而不是字符：表里同一个字符可能有两条短代码
              // （比如 `-1` 与 `thumbsdown`），用字符当 key 会撞。
              <button
                key={项.短代码}
                type="button"
                className="emoji-cell"
                title={带冒号(项.短代码)}
                onClick={() => onAnswer(项.字符)}
              >
                <span className="emoji-glyph">{项.字符}</span>
                <span className="emoji-name">{带冒号(项.短代码)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
