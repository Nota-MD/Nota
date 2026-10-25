/**
 * Emoji：**一张表** ＋ **一条输入规则** ＋ **一个补全面板**。
 *
 * 用户 2026-09-27 的原话是那句总的「**所有的未开始全部写完**」——
 * `docs/10` §1 里「Emoji」（§3 编辑与格式化）与「Emoji 自动补全」（§8 输入辅助）
 * 两格 ⬜ 是这一批结的。
 *
 * # ⚠️ 「Emoji 自动补全」这一格不是新账，是**还债**
 *
 * `settings/editor.rs` 里 `emoji_autocomplete`（默认 `true`）**从 2026-09-24
 * 就摆着了**，界面上「编辑器」那一页也有那一格开关，而全仓**一个消费者都没有**
 * ——与 Markdown 那一页那六个智能标点字段是同一类账（`docs/10` §11.2 第一类）。
 * 所以这一批有两件事：**给旧字段补消费者**（补全面板）＋ **新建那一格**
 * （插入 Emoji 的入口，此前连菜单项都没有）。
 *
 * # 三个部件，各管一件事
 *
 * | 部件 | 什么时候动手 | 动的是什么 |
 * |---|---|---|
 * | `Emoji表` | —— | 数据。**没有任何逻辑**，改它不用读别的 |
 * | `emoji输入规则` | 敲下 `:smile: ` 那一下 | 把那七个字符换成 😄 |
 * | `补全插件` | 敲 `:sm` 的时候 | **只在屏幕上**画一块候选面板，一个字节都不写 |
 *
 * # ⚠️⚠️ 补全面板为什么是"只画不改"
 *
 * 候选面板出现的时机是"用户**可能**想打一个 emoji"——这时候他还没决定。
 * 面板若真往文档里写点什么（比如先把 `:sm` 替换成候选），**猜错了就是改用户的字节**，
 * 而且是用户根本没确认过的那种改。所以面板走 `Plugin` 的 `view`（自己管一块挂在
 * `document.body` 上的浮层），文档树里**一个字都不动**——这跟智能标点 `Render` 档
 * 与查找高亮是同一条口径。
 *
 * ⚠️ 代价如实记：因为面板不是 Decoration，**它不会被 ProseMirror 的坐标系统
 * 自动摆正**。位置全靠 `view.coordsAtPos()` 每次更新时现算——滚动、换行、
 * 窗口缩放都要重算一次，所以 `update()` 里那次定位不能省。
 *
 * # ⚠️ 与智能标点共用一条坑：`inCodeMark: false` 必须显式写
 *
 * `prosemirror-inputrules` 的 `inCodeMark` **默认是 `true`**（源码里那句
 * `options.inCodeMark !== false`），而它那条守卫写的是
 * `if (!rule.inCodeMark && …) continue;`——默认值让守卫整个不生效，
 * 也就是**行内代码里的 `:smile:` 也会被换成 😄**。行内代码里那一串是要给
 * 人看的字面文本（写文档讲 shortcode 语法时就会出现），不能动。
 * 详见 `smart-punctuation.ts` 的 `规则选项`。
 *
 * # ⚠️ 面板不吃中文输入法的组合键
 *
 * `handleKeyDown` 里第一句是 `if (event.isComposing) return false;`。
 * 中文输入法在选字时也会发 `ArrowUp/Down/Enter`，**那是给候选字用的**，
 * 被这里吃掉的话用户就选不了字了。这一条是硬要求，不是优化。
 */

import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** 表里的一行。 */
export interface EmojiItem {
  /** GitHub 风格的短代码，**不带冒号**、全小写（`:smile:` → `"smile"`）。 */
  shortcode: string;
  /** 真正插进文档的那个字符（可能带变体选择符，如 `❤️` 是两个码点）。 */
  character: string;
  /** 分类名，只用来在面板里分组与在对话框里分栏。 */
  category: string;
}

/**
 * 全表。
 *
 * ⚠️ **判据：表里的短代码必须与 GitHub / Slack 那一套主流记法一致**——
 * 用户从别处贴一段 `:tada:` 进来，在这里搜不到就是坏体验。所以不收自造记法。
 *
 * ⚠️ **每个字符都带变体选择符（`U+FE0F`）的地方要带着**：`❤️` 是
 * `U+2764 U+FE0F`，写成裸 `U+2764` 在某些字体下会渲染成一个黑白的心形符号
 * 而不是彩色 emoji。表里这类字符是**照抄出来的**，不是手打的两个码点。
 *
 * ⚠️ **不做"全表搜索"**：`找Emoji` 只按**前缀**匹配（下面有理由）。所以
 * 这个表的排序是有意义的——**同一前缀下越靠前的越可能被选中**，常用词
 * （`smile` / `heart` / `tada`）排在各分类靠前的位置。
 */
export const emojiTable: EmojiItem[] = [
  // ── 表情 ─────────────────────────────────────────────────────────────
  { shortcode: "smile", character: "😄", category: "表情" },
  { shortcode: "smiley", character: "😃", category: "表情" },
  { shortcode: "grinning", character: "😀", category: "表情" },
  { shortcode: "grin", character: "😁", category: "表情" },
  { shortcode: "laughing", character: "😆", category: "表情" },
  { shortcode: "satisfied", character: "😆", category: "表情" },
  { shortcode: "sweat_smile", character: "😅", category: "表情" },
  { shortcode: "rofl", character: "🤣", category: "表情" },
  { shortcode: "joy", character: "😂", category: "表情" },
  { shortcode: "slightly_smiling_face", character: "🙂", category: "表情" },
  { shortcode: "upside_down_face", character: "🙃", category: "表情" },
  { shortcode: "wink", character: "😉", category: "表情" },
  { shortcode: "blush", character: "😊", category: "表情" },
  { shortcode: "innocent", character: "😇", category: "表情" },
  { shortcode: "smiling_face_with_three_hearts", character: "🥰", category: "表情" },
  { shortcode: "heart_eyes", character: "😍", category: "表情" },
  { shortcode: "star_struck", character: "🤩", category: "表情" },
  { shortcode: "kissing_heart", character: "😘", category: "表情" },
  { shortcode: "kissing", character: "😗", category: "表情" },
  { shortcode: "relaxed", character: "☺️", category: "表情" },
  { shortcode: "yum", character: "😋", category: "表情" },
  { shortcode: "stuck_out_tongue", character: "😛", category: "表情" },
  { shortcode: "stuck_out_tongue_winking_eye", character: "😜", category: "表情" },
  { shortcode: "zany_face", character: "🤪", category: "表情" },
  { shortcode: "money_mouth_face", character: "🤑", category: "表情" },
  { shortcode: "hugs", character: "🤗", category: "表情" },
  { shortcode: "hand_over_mouth", character: "🤭", category: "表情" },
  { shortcode: "shushing_face", character: "🤫", category: "表情" },
  { shortcode: "thinking", character: "🤔", category: "表情" },
  { shortcode: "zipper_mouth_face", character: "🤐", category: "表情" },
  { shortcode: "raised_eyebrow", character: "🤨", category: "表情" },
  { shortcode: "neutral_face", character: "😐", category: "表情" },
  { shortcode: "expressionless", character: "😑", category: "表情" },
  { shortcode: "no_mouth", character: "😶", category: "表情" },
  { shortcode: "smirk", character: "😏", category: "表情" },
  { shortcode: "unamused", character: "😒", category: "表情" },
  { shortcode: "roll_eyes", character: "🙄", category: "表情" },
  { shortcode: "grimacing", character: "😬", category: "表情" },
  { shortcode: "lying_face", character: "🤥", category: "表情" },
  { shortcode: "relieved", character: "😌", category: "表情" },
  { shortcode: "pensive", character: "😔", category: "表情" },
  { shortcode: "sleepy", character: "😪", category: "表情" },
  { shortcode: "sleeping", character: "😴", category: "表情" },
  { shortcode: "mask", character: "😷", category: "表情" },
  { shortcode: "face_with_thermometer", character: "🤒", category: "表情" },
  { shortcode: "face_with_head_bandage", character: "🤕", category: "表情" },
  { shortcode: "nauseated_face", character: "🤢", category: "表情" },
  { shortcode: "vomiting_face", character: "🤮", category: "表情" },
  { shortcode: "sneezing_face", character: "🤧", category: "表情" },
  { shortcode: "hot_face", character: "🥵", category: "表情" },
  { shortcode: "cold_face", character: "🥶", category: "表情" },
  { shortcode: "woozy_face", character: "🥴", category: "表情" },
  { shortcode: "dizzy_face", character: "😵", category: "表情" },
  { shortcode: "exploding_head", character: "🤯", category: "表情" },
  { shortcode: "cowboy_hat_face", character: "🤠", category: "表情" },
  { shortcode: "partying_face", character: "🥳", category: "表情" },
  { shortcode: "sunglasses", character: "😎", category: "表情" },
  { shortcode: "nerd_face", character: "🤓", category: "表情" },
  { shortcode: "monocle_face", character: "🧐", category: "表情" },
  { shortcode: "confused", character: "😕", category: "表情" },
  { shortcode: "worried", character: "😟", category: "表情" },
  { shortcode: "slightly_frowning_face", character: "🙁", category: "表情" },
  { shortcode: "frowning_face", character: "☹️", category: "表情" },
  { shortcode: "open_mouth", character: "😮", category: "表情" },
  { shortcode: "hushed", character: "😯", category: "表情" },
  { shortcode: "astonished", character: "😲", category: "表情" },
  { shortcode: "flushed", character: "😳", category: "表情" },
  { shortcode: "pleading_face", character: "🥺", category: "表情" },
  { shortcode: "frowning", character: "😦", category: "表情" },
  { shortcode: "anguished", character: "😧", category: "表情" },
  { shortcode: "fearful", character: "😨", category: "表情" },
  { shortcode: "cold_sweat", character: "😰", category: "表情" },
  { shortcode: "disappointed_relieved", character: "😥", category: "表情" },
  { shortcode: "cry", character: "😢", category: "表情" },
  { shortcode: "sob", character: "😭", category: "表情" },
  { shortcode: "scream", character: "😱", category: "表情" },
  { shortcode: "confounded", character: "😖", category: "表情" },
  { shortcode: "persevere", character: "😣", category: "表情" },
  { shortcode: "disappointed", character: "😞", category: "表情" },
  { shortcode: "sweat", character: "😓", category: "表情" },
  { shortcode: "weary", character: "😩", category: "表情" },
  { shortcode: "tired_face", character: "😫", category: "表情" },
  { shortcode: "yawning_face", character: "🥱", category: "表情" },
  { shortcode: "triumph", character: "😤", category: "表情" },
  { shortcode: "rage", character: "😡", category: "表情" },
  { shortcode: "angry", character: "😠", category: "表情" },
  { shortcode: "cursing_face", character: "🤬", category: "表情" },
  { shortcode: "smiling_imp", character: "😈", category: "表情" },
  { shortcode: "imp", character: "👿", category: "表情" },
  { shortcode: "skull", character: "💀", category: "表情" },
  { shortcode: "poop", character: "💩", category: "表情" },
  { shortcode: "clown_face", character: "🤡", category: "表情" },
  { shortcode: "ghost", character: "👻", category: "表情" },
  { shortcode: "alien", character: "👽", category: "表情" },
  { shortcode: "robot", character: "🤖", category: "表情" },
  { shortcode: "see_no_evil", character: "🙈", category: "表情" },
  { shortcode: "hear_no_evil", character: "🙉", category: "表情" },
  { shortcode: "speak_no_evil", character: "🙊", category: "表情" },
  { shortcode: "smiley_cat", character: "😺", category: "表情" },
  { shortcode: "smile_cat", character: "😸", category: "表情" },
  { shortcode: "heart_eyes_cat", character: "😻", category: "表情" },
  { shortcode: "crying_cat_face", character: "😿", category: "表情" },
  { shortcode: "pouting_cat", character: "😾", category: "表情" },

  // ── 手势 / 身体 ──────────────────────────────────────────────────────
  { shortcode: "wave", character: "👋", category: "手势" },
  { shortcode: "raised_hand", character: "✋", category: "手势" },
  { shortcode: "raised_back_of_hand", character: "🤚", category: "手势" },
  { shortcode: "vulcan_salute", character: "🖖", category: "手势" },
  { shortcode: "ok_hand", character: "👌", category: "手势" },
  { shortcode: "pinched_fingers", character: "🤌", category: "手势" },
  { shortcode: "v", character: "✌️", category: "手势" },
  { shortcode: "crossed_fingers", character: "🤞", category: "手势" },
  { shortcode: "love_you_gesture", character: "🤟", category: "手势" },
  { shortcode: "metal", character: "🤘", category: "手势" },
  { shortcode: "call_me_hand", character: "🤙", category: "手势" },
  { shortcode: "point_left", character: "👈", category: "手势" },
  { shortcode: "point_right", character: "👉", category: "手势" },
  { shortcode: "point_up_2", character: "👆", category: "手势" },
  { shortcode: "point_down", character: "👇", category: "手势" },
  { shortcode: "point_up", character: "☝️", category: "手势" },
  { shortcode: "thumbsup", character: "👍", category: "手势" },
  { shortcode: "+1", character: "👍", category: "手势" },
  { shortcode: "thumbsdown", character: "👎", category: "手势" },
  { shortcode: "-1", character: "👎", category: "手势" },
  { shortcode: "fist_raised", character: "✊", category: "手势" },
  { shortcode: "fist_oncoming", character: "👊", category: "手势" },
  { shortcode: "fist_left", character: "🤛", category: "手势" },
  { shortcode: "fist_right", character: "🤜", category: "手势" },
  { shortcode: "clap", character: "👏", category: "手势" },
  { shortcode: "raised_hands", character: "🙌", category: "手势" },
  { shortcode: "open_hands", character: "👐", category: "手势" },
  { shortcode: "palms_up_together", character: "🤲", category: "手势" },
  { shortcode: "handshake", character: "🤝", category: "手势" },
  { shortcode: "pray", character: "🙏", category: "手势" },
  { shortcode: "writing_hand", character: "✍️", category: "手势" },
  { shortcode: "nail_care", character: "💅", category: "手势" },
  { shortcode: "muscle", character: "💪", category: "手势" },
  { shortcode: "eyes", character: "👀", category: "手势" },
  { shortcode: "eye", character: "👁️", category: "手势" },
  { shortcode: "ear", character: "👂", category: "手势" },
  { shortcode: "nose", character: "👃", category: "手势" },
  { shortcode: "brain", character: "🧠", category: "手势" },
  { shortcode: "tongue", character: "👅", category: "手势" },
  { shortcode: "lips", character: "👄", category: "手势" },
  { shortcode: "selfie", character: "🤳", category: "手势" },
  { shortcode: "shrug", character: "🤷", category: "手势" },
  { shortcode: "facepalm", character: "🤦", category: "手势" },
  { shortcode: "bow", character: "🙇", category: "手势" },
  { shortcode: "no_good", character: "🙅", category: "手势" },
  { shortcode: "ok_woman", character: "🙆", category: "手势" },
  { shortcode: "raising_hand", character: "🙋", category: "手势" },

  // ── 人物 ─────────────────────────────────────────────────────────────
  { shortcode: "baby", character: "👶", category: "人物" },
  { shortcode: "boy", character: "👦", category: "人物" },
  { shortcode: "girl", character: "👧", category: "人物" },
  { shortcode: "man", character: "👨", category: "人物" },
  { shortcode: "woman", character: "👩", category: "人物" },
  { shortcode: "older_man", character: "👴", category: "人物" },
  { shortcode: "older_woman", character: "👵", category: "人物" },
  { shortcode: "family", character: "👪", category: "人物" },
  { shortcode: "couple", character: "👫", category: "人物" },
  { shortcode: "two_men_holding_hands", character: "👬", category: "人物" },
  { shortcode: "two_women_holding_hands", character: "👭", category: "人物" },
  { shortcode: "dancer", character: "💃", category: "人物" },
  { shortcode: "man_dancing", character: "🕺", category: "人物" },
  { shortcode: "santa", character: "🎅", category: "人物" },
  { shortcode: "snowman", character: "⛄", category: "人物" },

  // ── 动物 / 自然 ──────────────────────────────────────────────────────
  { shortcode: "dog", character: "🐶", category: "动物" },
  { shortcode: "cat", character: "🐱", category: "动物" },
  { shortcode: "mouse", character: "🐭", category: "动物" },
  { shortcode: "hamster", character: "🐹", category: "动物" },
  { shortcode: "rabbit", character: "🐰", category: "动物" },
  { shortcode: "fox_face", character: "🦊", category: "动物" },
  { shortcode: "bear", character: "🐻", category: "动物" },
  { shortcode: "panda_face", character: "🐼", category: "动物" },
  { shortcode: "koala", character: "🐨", category: "动物" },
  { shortcode: "tiger", character: "🐯", category: "动物" },
  { shortcode: "lion", character: "🦁", category: "动物" },
  { shortcode: "cow", character: "🐮", category: "动物" },
  { shortcode: "pig", character: "🐷", category: "动物" },
  { shortcode: "frog", character: "🐸", category: "动物" },
  { shortcode: "monkey_face", character: "🐵", category: "动物" },
  { shortcode: "chicken", character: "🐔", category: "动物" },
  { shortcode: "penguin", character: "🐧", category: "动物" },
  { shortcode: "bird", character: "🐦", category: "动物" },
  { shortcode: "baby_chick", character: "🐤", category: "动物" },
  { shortcode: "hatching_chick", character: "🐣", category: "动物" },
  { shortcode: "duck", character: "🦆", category: "动物" },
  { shortcode: "eagle", character: "🦅", category: "动物" },
  { shortcode: "owl", character: "🦉", category: "动物" },
  { shortcode: "bat", character: "🦇", category: "动物" },
  { shortcode: "wolf", character: "🐺", category: "动物" },
  { shortcode: "boar", character: "🐗", category: "动物" },
  { shortcode: "horse", character: "🐴", category: "动物" },
  { shortcode: "unicorn", character: "🦄", category: "动物" },
  { shortcode: "bee", character: "🐝", category: "动物" },
  { shortcode: "bug", character: "🐛", category: "动物" },
  { shortcode: "butterfly", character: "🦋", category: "动物" },
  { shortcode: "snail", character: "🐌", category: "动物" },
  { shortcode: "beetle", character: "🐞", category: "动物" },
  { shortcode: "ant", character: "🐜", category: "动物" },
  { shortcode: "spider", character: "🕷️", category: "动物" },
  { shortcode: "scorpion", character: "🦂", category: "动物" },
  { shortcode: "crab", character: "🦀", category: "动物" },
  { shortcode: "snake", character: "🐍", category: "动物" },
  { shortcode: "lizard", character: "🦎", category: "动物" },
  { shortcode: "turtle", character: "🐢", category: "动物" },
  { shortcode: "tropical_fish", character: "🐠", category: "动物" },
  { shortcode: "fish", character: "🐟", category: "动物" },
  { shortcode: "blowfish", character: "🐡", category: "动物" },
  { shortcode: "dolphin", character: "🐬", category: "动物" },
  { shortcode: "whale", character: "🐳", category: "动物" },
  { shortcode: "shark", character: "🦈", category: "动物" },
  { shortcode: "octopus", character: "🐙", category: "动物" },
  { shortcode: "shell", character: "🐚", category: "动物" },
  { shortcode: "dragon", character: "🐉", category: "动物" },
  { shortcode: "t_rex", character: "🦖", category: "动物" },
  { shortcode: "sauropod", character: "🦕", category: "动物" },

  // ── 食物 ─────────────────────────────────────────────────────────────
  { shortcode: "apple", character: "🍎", category: "食物" },
  { shortcode: "green_apple", character: "🍏", category: "食物" },
  { shortcode: "pear", character: "🍐", category: "食物" },
  { shortcode: "tangerine", character: "🍊", category: "食物" },
  { shortcode: "lemon", character: "🍋", category: "食物" },
  { shortcode: "cherries", character: "🍒", category: "食物" },
  { shortcode: "grapes", character: "🍇", category: "食物" },
  { shortcode: "watermelon", character: "🍉", category: "食物" },
  { shortcode: "strawberry", character: "🍓", category: "食物" },
  { shortcode: "peach", character: "🍑", category: "食物" },
  { shortcode: "melon", character: "🍈", category: "食物" },
  { shortcode: "banana", character: "🍌", category: "食物" },
  { shortcode: "pineapple", character: "🍍", category: "食物" },
  { shortcode: "coconut", character: "🥥", category: "食物" },
  { shortcode: "kiwi_fruit", character: "🥝", category: "食物" },
  { shortcode: "tomato", character: "🍅", category: "食物" },
  { shortcode: "avocado", character: "🥑", category: "食物" },
  { shortcode: "eggplant", character: "🍆", category: "食物" },
  { shortcode: "potato", character: "🥔", category: "食物" },
  { shortcode: "carrot", character: "🥕", category: "食物" },
  { shortcode: "corn", character: "🌽", category: "食物" },
  { shortcode: "hot_pepper", character: "🌶️", category: "食物" },
  { shortcode: "cucumber", character: "🥒", category: "食物" },
  { shortcode: "mushroom", character: "🍄", category: "食物" },
  { shortcode: "bread", character: "🍞", category: "食物" },
  { shortcode: "croissant", character: "🥐", category: "食物" },
  { shortcode: "baguette_bread", character: "🥖", category: "食物" },
  { shortcode: "pancakes", character: "🥞", category: "食物" },
  { shortcode: "cheese", character: "🧀", category: "食物" },
  { shortcode: "meat_on_bone", character: "🍖", category: "食物" },
  { shortcode: "poultry_leg", character: "🍗", category: "食物" },
  { shortcode: "hamburger", character: "🍔", category: "食物" },
  { shortcode: "fries", character: "🍟", category: "食物" },
  { shortcode: "pizza", character: "🍕", category: "食物" },
  { shortcode: "hotdog", character: "🌭", category: "食物" },
  { shortcode: "sandwich", character: "🥪", category: "食物" },
  { shortcode: "taco", character: "🌮", category: "食物" },
  { shortcode: "burrito", character: "🌯", category: "食物" },
  { shortcode: "egg", character: "🥚", category: "食物" },
  { shortcode: "fried_egg", character: "🍳", category: "食物" },
  { shortcode: "ramen", character: "🍜", category: "食物" },
  { shortcode: "spaghetti", character: "🍝", category: "食物" },
  { shortcode: "rice", character: "🍚", category: "食物" },
  { shortcode: "curry", character: "🍛", category: "食物" },
  { shortcode: "sushi", character: "🍣", category: "食物" },
  { shortcode: "bento", character: "🍱", category: "食物" },
  { shortcode: "dumpling", character: "🥟", category: "食物" },
  { shortcode: "icecream", character: "🍦", category: "食物" },
  { shortcode: "shaved_ice", character: "🍧", category: "食物" },
  { shortcode: "cake", character: "🍰", category: "食物" },
  { shortcode: "birthday", character: "🎂", category: "食物" },
  { shortcode: "cupcake", character: "🧁", category: "食物" },
  { shortcode: "pie", character: "🥧", category: "食物" },
  { shortcode: "chocolate_bar", character: "🍫", category: "食物" },
  { shortcode: "candy", character: "🍬", category: "食物" },
  { shortcode: "lollipop", character: "🍭", category: "食物" },
  { shortcode: "honey_pot", character: "🍯", category: "食物" },
  { shortcode: "coffee", character: "☕", category: "食物" },
  { shortcode: "tea", character: "🍵", category: "食物" },
  { shortcode: "beer", character: "🍺", category: "食物" },
  { shortcode: "beers", character: "🍻", category: "食物" },
  { shortcode: "wine_glass", character: "🍷", category: "食物" },
  { shortcode: "cocktail", character: "🍸", category: "食物" },
  { shortcode: "tropical_drink", character: "🍹", category: "食物" },
  { shortcode: "sake", character: "🍶", category: "食物" },
  { shortcode: "milk_glass", character: "🥛", category: "食物" },

  // ── 活动 ─────────────────────────────────────────────────────────────
  { shortcode: "soccer", character: "⚽", category: "活动" },
  { shortcode: "basketball", character: "🏀", category: "活动" },
  { shortcode: "football", character: "🏈", category: "活动" },
  { shortcode: "baseball", character: "⚾", category: "活动" },
  { shortcode: "tennis", character: "🎾", category: "活动" },
  { shortcode: "volleyball", character: "🏐", category: "活动" },
  { shortcode: "rugby_football", character: "🏉", category: "活动" },
  { shortcode: "golf", character: "⛳", category: "活动" },
  { shortcode: "ski", character: "🎿", category: "活动" },
  { shortcode: "ice_skate", character: "⛸️", category: "活动" },
  { shortcode: "dart", character: "🎯", category: "活动" },
  { shortcode: "8ball", character: "🎱", category: "活动" },
  { shortcode: "bowling", character: "🎳", category: "活动" },
  { shortcode: "video_game", character: "🎮", category: "活动" },
  { shortcode: "game_die", character: "🎲", category: "活动" },
  { shortcode: "chess_pawn", character: "♟️", category: "活动" },
  { shortcode: "performing_arts", character: "🎭", category: "活动" },
  { shortcode: "art", character: "🎨", category: "活动" },
  { shortcode: "musical_note", character: "🎵", category: "活动" },
  { shortcode: "notes", character: "🎶", category: "活动" },
  { shortcode: "trophy", character: "🏆", category: "活动" },
  { shortcode: "medal_sports", character: "🏅", category: "活动" },
  { shortcode: "first_place_medal", character: "🥇", category: "活动" },
  { shortcode: "second_place_medal", character: "🥈", category: "活动" },
  { shortcode: "third_place_medal", character: "🥉", category: "活动" },
  { shortcode: "ticket", character: "🎫", category: "活动" },
  { shortcode: "tickets", character: "🎟️", category: "活动" },
  { shortcode: "gift", character: "🎁", category: "活动" },
  { shortcode: "balloon", character: "🎈", category: "活动" },
  { shortcode: "tada", character: "🎉", category: "活动" },
  { shortcode: "confetti_ball", character: "🎊", category: "活动" },
  { shortcode: "sparkles", character: "✨", category: "活动" },
  { shortcode: "firecracker", character: "🧨", category: "活动" },
  { shortcode: "crystal_ball", character: "🔮", category: "活动" },

  // ── 旅行 / 地点 ──────────────────────────────────────────────────────
  { shortcode: "car", character: "🚗", category: "旅行" },
  { shortcode: "taxi", character: "🚕", category: "旅行" },
  { shortcode: "bus", character: "🚌", category: "旅行" },
  { shortcode: "minibus", character: "🚐", category: "旅行" },
  { shortcode: "police_car", character: "🚓", category: "旅行" },
  { shortcode: "ambulance", character: "🚑", category: "旅行" },
  { shortcode: "fire_engine", character: "🚒", category: "旅行" },
  { shortcode: "truck", character: "🚚", category: "旅行" },
  { shortcode: "bicycle", character: "🚲", category: "旅行" },
  { shortcode: "motor_scooter", character: "🛵", category: "旅行" },
  { shortcode: "motorcycle", character: "🏍️", category: "旅行" },
  { shortcode: "train", character: "🚆", category: "旅行" },
  { shortcode: "bullettrain_side", character: "🚄", category: "旅行" },
  { shortcode: "airplane", character: "✈️", category: "旅行" },
  { shortcode: "small_airplane", character: "🛩️", category: "旅行" },
  { shortcode: "rocket", character: "🚀", category: "旅行" },
  { shortcode: "helicopter", character: "🚁", category: "旅行" },
  { shortcode: "sailboat", character: "⛵", category: "旅行" },
  { shortcode: "speedboat", character: "🚤", category: "旅行" },
  { shortcode: "ship", character: "🚢", category: "旅行" },
  { shortcode: "anchor", character: "⚓", category: "旅行" },
  { shortcode: "fuelpump", character: "⛽", category: "旅行" },
  { shortcode: "traffic_light", character: "🚦", category: "旅行" },
  { shortcode: "construction", character: "🚧", category: "旅行" },
  { shortcode: "house", character: "🏠", category: "旅行" },
  { shortcode: "office", character: "🏢", category: "旅行" },
  { shortcode: "hospital", character: "🏥", category: "旅行" },
  { shortcode: "bank", character: "🏦", category: "旅行" },
  { shortcode: "hotel", character: "🏨", category: "旅行" },
  { shortcode: "school", character: "🏫", category: "旅行" },
  { shortcode: "church", character: "⛪", category: "旅行" },
  { shortcode: "tent", character: "⛺", category: "旅行" },
  { shortcode: "castle", character: "🏰", category: "旅行" },
  { shortcode: "statue_of_liberty", character: "🗽", category: "旅行" },
  { shortcode: "mount_fuji", character: "🗻", category: "旅行" },

  // ── 自然 ─────────────────────────────────────────────────────────────
  { shortcode: "sunny", character: "☀️", category: "自然" },
  { shortcode: "moon", character: "🌙", category: "自然" },
  { shortcode: "star", character: "⭐", category: "自然" },
  { shortcode: "star2", character: "🌟", category: "自然" },
  { shortcode: "sunrise", character: "🌅", category: "自然" },
  { shortcode: "rainbow", character: "🌈", category: "自然" },
  { shortcode: "cloud", character: "☁️", category: "自然" },
  { shortcode: "snowflake", character: "❄️", category: "自然" },
  { shortcode: "zap", character: "⚡", category: "自然" },
  { shortcode: "fire", character: "🔥", category: "自然" },
  { shortcode: "ocean", character: "🌊", category: "自然" },
  { shortcode: "earth_asia", character: "🌏", category: "自然" },
  { shortcode: "globe_with_meridians", character: "🌐", category: "自然" },
  { shortcode: "cactus", character: "🌵", category: "自然" },
  { shortcode: "four_leaf_clover", character: "🍀", category: "自然" },
  { shortcode: "maple_leaf", character: "🍁", category: "自然" },
  { shortcode: "fallen_leaf", character: "🍂", category: "自然" },
  { shortcode: "herb", character: "🌿", category: "自然" },
  { shortcode: "rose", character: "🌹", category: "自然" },
  { shortcode: "sunflower", character: "🌻", category: "自然" },
  { shortcode: "tulip", character: "🌷", category: "自然" },
  { shortcode: "cherry_blossom", character: "🌸", category: "自然" },

  // ── 物件 ─────────────────────────────────────────────────────────────
  { shortcode: "watch", character: "⌚", category: "物件" },
  { shortcode: "iphone", character: "📱", category: "物件" },
  { shortcode: "computer", character: "💻", category: "物件" },
  { shortcode: "desktop_computer", character: "🖥️", category: "物件" },
  { shortcode: "keyboard", character: "⌨️", category: "物件" },
  { shortcode: "printer", character: "🖨️", category: "物件" },
  { shortcode: "computer_mouse", character: "🖱️", category: "物件" },
  { shortcode: "floppy_disk", character: "💾", category: "物件" },
  { shortcode: "cd", character: "💿", category: "物件" },
  { shortcode: "dvd", character: "📀", category: "物件" },
  { shortcode: "battery", character: "🔋", category: "物件" },
  { shortcode: "electric_plug", character: "🔌", category: "物件" },
  { shortcode: "bulb", character: "💡", category: "物件" },
  { shortcode: "flashlight", character: "🔦", category: "物件" },
  { shortcode: "camera", character: "📷", category: "物件" },
  { shortcode: "video_camera", character: "📹", category: "物件" },
  { shortcode: "movie_camera", character: "🎥", category: "物件" },
  { shortcode: "phone", character: "☎️", category: "物件" },
  { shortcode: "telephone_receiver", character: "📞", category: "物件" },
  { shortcode: "tv", character: "📺", category: "物件" },
  { shortcode: "radio", character: "📻", category: "物件" },
  { shortcode: "bell", character: "🔔", category: "物件" },
  { shortcode: "no_bell", character: "🔕", category: "物件" },
  { shortcode: "loud_sound", character: "🔊", category: "物件" },
  { shortcode: "mute", character: "🔇", category: "物件" },
  { shortcode: "mega", character: "📣", category: "物件" },
  { shortcode: "hourglass", character: "⌛", category: "物件" },
  { shortcode: "alarm_clock", character: "⏰", category: "物件" },
  { shortcode: "lock", character: "🔒", category: "物件" },
  { shortcode: "unlock", character: "🔓", category: "物件" },
  { shortcode: "key", character: "🔑", category: "物件" },
  { shortcode: "hammer", character: "🔨", category: "物件" },
  { shortcode: "wrench", character: "🔧", category: "物件" },
  { shortcode: "nut_and_bolt", character: "🔩", category: "物件" },
  { shortcode: "gear", character: "⚙️", category: "物件" },
  { shortcode: "link", character: "🔗", category: "物件" },
  { shortcode: "paperclip", character: "📎", category: "物件" },
  { shortcode: "scissors", character: "✂️", category: "物件" },
  { shortcode: "pencil2", character: "✏️", category: "物件" },
  { shortcode: "pen", character: "🖊️", category: "物件" },
  { shortcode: "fountain_pen", character: "🖋️", category: "物件" },
  { shortcode: "memo", character: "📝", category: "物件" },
  { shortcode: "books", character: "📚", category: "物件" },
  { shortcode: "book", character: "📖", category: "物件" },
  { shortcode: "newspaper", character: "📰", category: "物件" },
  { shortcode: "bookmark", character: "🔖", category: "物件" },
  { shortcode: "email", character: "📧", category: "物件" },
  { shortcode: "envelope", character: "✉️", category: "物件" },
  { shortcode: "inbox_tray", character: "📥", category: "物件" },
  { shortcode: "outbox_tray", character: "📤", category: "物件" },
  { shortcode: "package", character: "📦", category: "物件" },
  { shortcode: "mailbox", character: "📫", category: "物件" },
  { shortcode: "chart_with_upwards_trend", character: "📈", category: "物件" },
  { shortcode: "chart_with_downwards_trend", character: "📉", category: "物件" },
  { shortcode: "bar_chart", character: "📊", category: "物件" },
  { shortcode: "clipboard", character: "📋", category: "物件" },
  { shortcode: "calendar", character: "📅", category: "物件" },
  { shortcode: "pushpin", character: "📌", category: "物件" },
  { shortcode: "round_pushpin", character: "📍", category: "物件" },
  { shortcode: "triangular_ruler", character: "📐", category: "物件" },
  { shortcode: "straight_ruler", character: "📏", category: "物件" },
  { shortcode: "mag", character: "🔍", category: "物件" },
  { shortcode: "mag_right", character: "🔎", category: "物件" },
  { shortcode: "moneybag", character: "💰", category: "物件" },
  { shortcode: "dollar", character: "💵", category: "物件" },
  { shortcode: "credit_card", character: "💳", category: "物件" },
  { shortcode: "gem", character: "💎", category: "物件" },
  { shortcode: "shield", character: "🛡️", category: "物件" },
  { shortcode: "wastebasket", character: "🗑️", category: "物件" },

  // ── 符号 ─────────────────────────────────────────────────────────────
  { shortcode: "heart", character: "❤️", category: "符号" },
  { shortcode: "orange_heart", character: "🧡", category: "符号" },
  { shortcode: "yellow_heart", character: "💛", category: "符号" },
  { shortcode: "green_heart", character: "💚", category: "符号" },
  { shortcode: "blue_heart", character: "💙", category: "符号" },
  { shortcode: "purple_heart", character: "💜", category: "符号" },
  { shortcode: "black_heart", character: "🖤", category: "符号" },
  { shortcode: "white_heart", character: "🤍", category: "符号" },
  { shortcode: "brown_heart", character: "🤎", category: "符号" },
  { shortcode: "broken_heart", character: "💔", category: "符号" },
  { shortcode: "two_hearts", character: "💕", category: "符号" },
  { shortcode: "sparkling_heart", character: "💖", category: "符号" },
  { shortcode: "heartpulse", character: "💗", category: "符号" },
  { shortcode: "heartbeat", character: "💓", category: "符号" },
  { shortcode: "revolving_hearts", character: "💞", category: "符号" },
  { shortcode: "cupid", character: "💘", category: "符号" },
  { shortcode: "gift_heart", character: "💝", category: "符号" },
  { shortcode: "100", character: "💯", category: "符号" },
  { shortcode: "anger", character: "💢", category: "符号" },
  { shortcode: "boom", character: "💥", category: "符号" },
  { shortcode: "dizzy", character: "💫", category: "符号" },
  { shortcode: "sweat_drops", character: "💦", category: "符号" },
  { shortcode: "dash", character: "💨", category: "符号" },
  { shortcode: "speech_balloon", character: "💬", category: "符号" },
  { shortcode: "thought_balloon", character: "💭", category: "符号" },
  { shortcode: "zzz", character: "💤", category: "符号" },
  { shortcode: "white_check_mark", character: "✅", category: "符号" },
  { shortcode: "x", character: "❌", category: "符号" },
  { shortcode: "heavy_check_mark", character: "✔️", category: "符号" },
  { shortcode: "heavy_multiplication_x", character: "✖️", category: "符号" },
  { shortcode: "bangbang", character: "‼️", category: "符号" },
  { shortcode: "question", character: "❓", category: "符号" },
  { shortcode: "exclamation", character: "❗", category: "符号" },
  { shortcode: "warning", character: "⚠️", category: "符号" },
  { shortcode: "no_entry", character: "⛔", category: "符号" },
  { shortcode: "recycle", character: "♻️", category: "符号" },
  { shortcode: "arrow_up", character: "⬆️", category: "符号" },
  { shortcode: "arrow_down", character: "⬇️", category: "符号" },
  { shortcode: "arrow_left", character: "⬅️", category: "符号" },
  { shortcode: "arrow_right", character: "➡️", category: "符号" },
  { shortcode: "arrows_clockwise", character: "🔃", category: "符号" },
  { shortcode: "repeat", character: "🔁", category: "符号" },
  { shortcode: "infinity", character: "♾️", category: "符号" },
  { shortcode: "yin_yang", character: "☯️", category: "符号" },
  { shortcode: "trident", character: "🔱", category: "符号" },
  { shortcode: "atom_symbol", character: "⚛️", category: "符号" },
  { shortcode: "fleur_de_lis", character: "⚜️", category: "符号" },
  { shortcode: "hash", character: "#️⃣", category: "符号" },
  { shortcode: "asterisk", character: "*️⃣", category: "符号" },

  // ── 旗帜 ─────────────────────────────────────────────────────────────
  { shortcode: "checkered_flag", character: "🏁", category: "旗帜" },
  { shortcode: "triangular_flag_on_post", character: "🚩", category: "旗帜" },
  { shortcode: "cn", character: "🇨🇳", category: "旗帜" },
  { shortcode: "us", character: "🇺🇸", category: "旗帜" },
  { shortcode: "jp", character: "🇯🇵", category: "旗帜" },
  { shortcode: "kr", character: "🇰🇷", category: "旗帜" },
  { shortcode: "gb", character: "🇬🇧", category: "旗帜" },
  { shortcode: "de", character: "🇩🇪", category: "旗帜" },
  { shortcode: "fr", character: "🇫🇷", category: "旗帜" },
  { shortcode: "es", character: "🇪🇸", category: "旗帜" },
  { shortcode: "it", character: "🇮🇹", category: "旗帜" },
  { shortcode: "ru", character: "🇷🇺", category: "旗帜" },
];

/** 按表里的**出现顺序**去重的分类名（对话框要拿它分栏）。 */
export const emojiCategory: string[] = [...new Set(emojiTable.map((item5) => item5.category))];

/**
 * 短代码 → 表项。表里可能有重名（`+1` 与 `thumbsup` 是同一个字符），
 * 所以这里**只留第一条**——`输入规则` 用它把 `:thumbsup:` 换成 👍。
 */
const pressShortcode = new Map<string, EmojiItem>();
for (const item5 of emojiTable) {
  if (!pressShortcode.has(item5.shortcode)) pressShortcode.set(item5.shortcode, item5);
}

/** 短代码查表（**大小写不敏感**：用户可能打成 `:Smile:`）。查不到给 `null`。 */
export function checkShortcode(shortcode: string): EmojiItem | null {
  return pressShortcode.get(shortcode.toLowerCase()) ?? null;
}

/**
 * 前缀匹配的候选，最多 `上限` 条。
 *
 * ⚠️ **只做前缀匹配，不做模糊/子串匹配**。理由：子串匹配让 `:a` 命中几百条，
 * 面板上第一个候选是哪个就变成了"表里的顺序"说了算的随机结果；而前缀匹配下
 * `:sm` 的候选是 `smile` / `smiley` / `smirk` 这一族，**用户想打的就是其中一个**。
 * 代价如实记：`heart_eyes` 用 `:eyes` 搜不到（只能从头打）。这一条与 Typora /
 * GitHub 的行为一致，不是本仓自创。
 */
export function findEmoji(prefix: string, limit = 8): EmojiItem[] {
  const small = prefix.toLowerCase();
  const output2: EmojiItem[] = [];
  for (const item5 of emojiTable) {
    if (item5.shortcode.startsWith(small)) {
      output2.push(item5);
      if (output2.length >= limit) break;
    }
  }
  return output2;
}

/** 面板里显示的文本：`:smile:`。 */
export function withEmergeNumber(shortcode: string): string {
  return `:${shortcode}:`;
}

// ── 输入规则 ────────────────────────────────────────────────────────────

/**
 * `inCodeMark: false` —— ⚠️ **必须显式写**，理由见文件头（上游默认 `true`）。
 * 与 `smart-punctuation.ts` 的 `规则选项` 是同一个常量值，**没有共享**：
 * 两个文件各有各的理由，将来一个改了不该牵动另一个。
 */
const ruleRuleOption = { inCodeMark: false } as const;

/**
 * **短代码的形状**（`:smile:` 里那一段），也是输入规则那条正则。
 *
 * ⚠️ **单独导出来是给 `tests/emoji.test.ts` 用的**：它拿这条正则去核表里的
 * **每一条**短代码都打得出来。⚠️ 字符数是 `{1,}` 而**不是 `{2,}`**——表里有
 * `:x:`（❌）与 `:v:`（✌️）这种单字符短代码（GitHub 也这么收），写成 `{2,}`
 * 的话这两条在面板里选得到、**却永远敲不出来**：一种不报错的死行。
 */
export const inputRuleRuleCorrectRule = /:([a-zA-Z0-9_+-]{1,}):[ \t]$/;

/**
 * 敲完整短代码 ＋ **一个空白**时换成字符。
 *
 * ⚠️ **触发字符只有空格与制表符**（`auto-correct.ts` 同一条口径）：正则收尾的
 * `[ \t]$` 里那个字符是**输入规则刚吃掉的那一个**，替换时把它**留着**
 * （`终 - 1`），所以 `:smile: 你好` 打完是 `😄 你好`，那颗空格原地不动。
 *
 * ⚠️ **结尾那个冒号必须有**：没有它的话 `:smile` 后面一敲空格就变，而用户
 * 可能正想打 `:smile:` 之后接着打别的东西——不，那不是问题；真正的问题是
 * `10:30` 这种写法：`30` 不是短代码，查表为空，规则不中，安全。
 * 冒号是"这是一段短代码"的开头标记，`找Emoji` 又只认表里的词，
 * 所以**误触的代价上限是"表里真有一个同名词、而用户恰好写了 `:词:`"**。
 */
export function emojiInputRuleRule(open2: boolean) {
  if (!open2) return [];
  return [
    $inputRule(() =>
      new InputRule(inputRuleRuleCorrectRule, (state, match2, start6, end3) => {
        const item5 = checkShortcode(match2[1]!);
        if (!item5) return null;
        // ⚠️ 只换短代码那一段，**后面那颗空白留在原地**（同 `auto-correct.ts`）。
        // 多插一个空格，或者把用户敲的空格吃掉，都会让下文的缩进/换行错位。
        return state.tr.insertText(item5.character, start6, end3 - 1);
      }, ruleRuleOption),
    ),
  ];
}

// ── 补全面板 ────────────────────────────────────────────────────────────

/** 插件键。⚠️ 单独导出：测试要据此读插件状态。 */
export const emojiFillAllKey = new PluginKey<FillAllState | null>("notaEmoji");

/** 面板此刻该显示什么。`null` = 不显示。 */
export interface FillAllState {
  /** `:` 的位置（文档坐标）——替换范围的左端。 */
  start5: number;
  /** 已经打出来的前缀（不含 `:`）。 */
  prefix: string;
  /** 候选（已经按上限截过）。 */
  candidate: EmojiItem[];
  /** 高亮第几条。 */
  selected: number;
}

/** 光标前最多往回看这么多字符。够长到覆盖最长的短代码（`smiling_face_with_three_hearts`）。 */
const returnSee = 40;

/**
 * 从光标往前认一段"正在打的短代码"。
 *
 * ⚠️ **只看当前文本块**（`$from.parent`）：跨块的 `:` 不是短代码的开头，
 * 而且 `textBetween` 的偏移是块内偏移，走出去就错位了。
 *
 * ⚠️ **不跨行、不认空格**：正则里没有空白，所以 `:sm ile` 一经空格就断。
 * 这正是要的——用户在 `:sm` 后面敲空格说明他不打算打 emoji 了。
 */
export function recognizePrefix(state: EditorState): FillAllState | null {
  const select = state.selection;
  if (!select.empty) return null;
  const $from = select.$from;
  if (!$from.parent.isTextblock) return null;
  const start5 = Math.max(0, $from.parentOffset - returnSee);
  const prefixText = $from.parent.textBetween(start5, $from.parentOffset, undefined, "￼");
  const match2 = /:([a-zA-Z0-9_+-]{1,})$/.exec(prefixText);
  if (!match2) return null;
  const prefix = match2[1]!;
  const candidate = findEmoji(prefix);
  if (candidate.length === 0) return null;
  return {
    prefix,
    // ⚠️ 文档坐标 = 块起点 ＋ 块内偏移。`$from.start()` 是**块内**第一个
    // 位置的文档坐标，加块内偏移才对得上（与 `smart-punctuation.ts` 的
    // `装饰清单` 同一个换算，那边是按节点位置加的）。
    start5: $from.start() + start5 + match2.index,
    candidate,
    selected: 0,
  };
}

/**
 * 把第 `第几条` 个候选替换掉正在打的那段。
 *
 * ⚠️ 替换范围是 **[`起`, 光标]**，右端**用当前光标**而不是"起 ＋ 前缀长度"：
 * 两者理论上一回事，但用光标位置就不必再假设前缀长度与文档长度一致
 * （认前缀走的是 `textBetween`，它对被替换过的字符 `￼` 有特殊处理）。
 */
export function adoptUseCandidate(state: EditorState, state3: FillAllState, ordinalHowManyItem: number): Transaction | null {
  const item5 = state3.candidate[ordinalHowManyItem];
  if (!item5) return null;
  const to2 = state.selection.from;
  if (to2 < state3.start5) return null;
  return state.tr.insertText(item5.character, state3.start5, to2);
}

/**
 * 补全面板插件。
 *
 * 开与不开由 `settings/editor.rs` 的 `emoji_autocomplete` 决定（⚠️ 那个字段
 * 从 2026-09-24 起就没有消费者，本文件是它第一个）。关掉时**返回 `null`**，
 * 调用方 `create.ts` 不把它放进 `.use()` 链——与 `自动更正` 同一条口径。
 *
 * ⚠️ 面板是 `document.body` 上的一个 `position: fixed` 浮层（与 `lang-picker.ts`
 * 同一条路子，那边的理由在这里逐字成立）：挂在编辑区里会被滚动容器算进
 * 可滚动范围，而且 ProseMirror 会把它当成文档的一部分。
 */
export function emojiFillAll(open2: boolean) {
  if (!open2) return [];
  return [
    $prose(() => {
      const panel = document.createElement("div");
      panel.className = "nota-emoji-pop";
      panel.setAttribute("role", "listbox");
      // ⚠️ `contenteditable="false"`：面板挂在 body 上，不在编辑器 DOM 里，
      // 但 WebKit 仍可能把它当成"可编辑区域之外的"东西——写上这一条是为了
      // 点它的时候不把焦点从编辑器抢走（`mousedown` 那条 `preventDefault` 同理）。
      panel.contentEditable = "false";
      panel.hidden = true;
      document.body.appendChild(panel);

      /** 当前面板上画的是哪一版状态——用来判断要不要重画（省掉每帧重建 DOM）。 */
      let rendered: FillAllState | null = null;

      function collapse() {
        if (!panel.hidden) panel.hidden = true;
        rendered = null;
      }

      function arrangePosition(view: EditorView) {
        // ⚠️ 用**面板左上角对齐光标**，而不是居中：emoji 是从光标处往外铺，
        // 居中的话面板左边缘会跑到光标左边去盖住已经写好的字。
        const coordinate = view.coordsAtPos(view.state.selection.from);
        // 先量高度再决定往上还是往下：往下会超出视口底边时翻到光标上方。
        const height = panel.offsetHeight;
        const below = coordinate.bottom + 4;
        const above = coordinate.top - height - 4;
        panel.style.left = `${Math.min(coordinate.left, window.innerWidth - panel.offsetWidth - 8)}px`;
        panel.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, above) : below}px`;
      }

      function draw(view: EditorView, state3: FillAllState) {
        // 状态没变就不重画（方向键改的是 `选中`，那个要重画，所以比的是整份）。
        if (rendered && rendered.start5 === state3.start5 && rendered.prefix === state3.prefix && rendered.selected === state3.selected) {
          arrangePosition(view);
          return;
        }
        panel.replaceChildren(
          ...state3.candidate.map((item5, i) => {
            const line3 = document.createElement("div");
            line3.className = "nota-emoji-item" + (i === state3.selected ? " is-on" : "");
            line3.setAttribute("role", "option");
            line3.setAttribute("aria-selected", String(i === state3.selected));
            const character2 = document.createElement("span");
            character2.className = "nota-emoji-glyph";
            character2.textContent = item5.character;
            const name3 = document.createElement("span");
            name3.className = "nota-emoji-name";
            name3.textContent = withEmergeNumber(item5.shortcode);
            line3.append(character2, name3);
            // ⚠️ 鼠标点也得能选（键盘那几条在 `handleKeyDown` 里）。两件事
            // 缺一不可：
            //   ① `preventDefault()` —— 不写的话 WebKit 会把焦点从编辑器挪到
            //      这个 `div` 上，而**没有焦点就没有光标**：替换完光标丢了，
            //      用户接着打的字不知道会落在哪儿；
            //   ② 用**闭包里的 `i`**，不是 `状.选中` —— 点的那一条才是要选的
            //      那一条，而 `状` 在这一次重画里是快照。
            line3.addEventListener("mousedown", (e) => {
              e.preventDefault();
              const tr = adoptUseCandidate(view.state, state3, i);
              if (tr) view.dispatch(tr);
            });
            return line3;
          }),
        );
        panel.hidden = false;
        rendered = state3;
        arrangePosition(view);
      }

      return new Plugin<FillAllState | null>({
        key: emojiFillAllKey,

        state: {
          init: () => null,
          apply(tr, _OldValue, _OldValuestate, newValuestate) {
            // ⚠️⚠️ **先看这一笔事务带没带面板自己的 meta**，带的话直接采用它。
            // 听起来像是优化，其实是**正确性**问题：上下键那两条改的只是
            // "高亮第几条"，它们没有改文档，所以在重算这条路上会**原样算回来**
            // ——上一版把 `选中` 从 0 改成 1，下一秒被 `认前缀` 重置成 0，
            // 表现为"按↓没反应"。那两条命令只能靠这条 meta 传递。
            const pointFixed = tr.getMeta(emojiFillAllKey) as FillAllState | null | undefined;
            if (pointFixed !== undefined) return pointFixed ?? null;
            // 其余事务一律重算：光标动、字变了、选区变了，前缀都可能不一样。
            // ⚠️ **不缓存、不做增量**：`认前缀` 只往回看 40 个字符，比任何
            // "哪些事务可能影响它"的判断都便宜，也不会漏。
            return recognizePrefix(newValuestate);
          },
        },

        props: {
          handleKeyDown(view, event) {
            // ⚠️⚠️ **输入法组合期间一律不接管**：中文输入法选字时也发上下键与回车，
            // 吃掉它们用户就选不了字了。这一条是硬要求（见文件头）。
            if (event.isComposing) return false;
            const state3 = emojiFillAllKey.getState(view.state);
            if (!state3) return false;
            switch (event.key) {
              case "ArrowDown":
                view.dispatch(
                  view.state.tr.setMeta(emojiFillAllKey, { ...state3, selected: (state3.selected + 1) % state3.candidate.length }),
                );
                return true;
              case "ArrowUp":
                view.dispatch(
                  view.state.tr.setMeta(emojiFillAllKey, {
                    ...state3,
                    selected: (state3.selected - 1 + state3.candidate.length) % state3.candidate.length,
                  }),
                );
                return true;
              case "Enter":
              case "Tab": {
                const tr = adoptUseCandidate(view.state, state3, state3.selected);
                if (!tr) return false;
                view.dispatch(tr);
                return true;
              }
              case "Escape":
                // ⚠️ Esc 只收面板，**不退出别的**（比如不关查找条）：它在这里的
                // 层级最低，只吃掉"我画的那块浮层"。
                collapse();
                return true;
              default:
                return false;
            }
          },
        },

        view() {
          return {
            update(view) {
              const state3 = emojiFillAllKey.getState(view.state);
              if (state3) draw(view, state3);
              else collapse();
            },
            destroy() {
              panel.remove();
            },
          };
        },
      });
    }),
  ];
}
