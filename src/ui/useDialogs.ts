/**
 * **两个自绘对话框的"谁在等答案"状态**：确认框与单行输入框。
 *
 * 从 `App.tsx` 搬出来的（2026-09-24，那边顶着 1000 行上限，见 `AGENTS.md` §0.4）。
 * 搬的理由是这一块**和外壳骨架无关**：它是一对"问一句、等回答"的 Promise
 * 拼接器，谁在问（关文档、退出、填链接地址）它一概不知道。
 *
 * # 为什么不用 `window.confirm` / `window.prompt`
 *
 * - `confirm` 会**阻塞 WebView**，把中文输入法的组合态打断；
 * - `prompt` 在 WebKitGTK 上**默认被关掉**，调用**静默返回 null**——
 *   「格式 → 超链接」点下去什么都不发生，看起来就是那个菜单项坏了。
 *
 * 两条完整理由分别在 `ui/ConfirmDialog.tsx` 与 `ui/PromptDialog.tsx` 顶上。
 *
 * # ⚠️ 一次只可能有一个
 *
 * 每个框后面是**单个** ref（不是队列）。今天所有调用点都是用户动作直接
 * 触发的，不存在并发；真要并发弹两个，后来者会把前一个的 Promise 永远挂着
 * ——那时再改成队列。
 */

import { useCallback, useRef, useState } from "react";

/**
 * 确认框的出口。
 *
 * ⚠️ 用**三个字符串**而不是 `boolean` + 一个额外的旗标：三条路互斥，
 * `boolean` 表达不了第三个（"都不是"和"取消"分不开）。
 */
export type ConfirmAnswer = "confirm" | "cancel" | "extra";

/** 确认框要问的话。`hideCancel` 用于只报信不问事的场合（「关于 Nota」）。 */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  hideCancel?: boolean;
  /**
   * 第三个按钮的字。给了才有这个按钮。
   *
   * ⚠️ 它是**第三条路**，不是"更强烈的确定"：「关掉有未保存改动的文档」那种
   * 问题里，「取消」和「丢弃并关闭」都表达不了"先存再关"，用户只能先关掉
   * 对话框、自己去按 Ctrl+S、再回来关一遍——每一步都要重新找到原位置。
   * 所以有这个按钮时它**拿到默认焦点**（安全的那条做默认，见 `ConfirmDialog`）。
   */
  extraLabel?: string;
}

/** 输入框要问的话。给了 `secondLabel` 才会有第二个字段。 */
export interface PromptRequest {
  title: string;
  label: string;
  /**
   * 打开时就填好的值（2026-09-27 补上的一个口子）。
   *
   * ⚠️ **框里的字是"已有的那个值"时，不给它用户就得先删一遍**：重命名一份
   * `笔记.md` 时框里空着，用户得自己把整条名字敲一遍——而他要做的往往只是
   * 改一个词。给上之后框一开就**全选**着（`PromptDialog` 里那条规矩），
   * 直接打字就是替换。
   *
   * ⚠️ 它**不是默认值**：用户按回车但没动过输入框时，交回来的就是这个 `initial`
   * ——调用方要自己判"和原来一样吗"（`useDocuments::renameDoc` 就是这么做的）。
   * 框本身不替调用方省这一步：它不知道哪个值是"原来那样"。
   */
  initial?: string;
  /**
   * 确认按钮上的字。不给就是 `PromptDialog` 的默认「确定」。
   *
   * ⚠️ 给它的场合是"确定之后**会动磁盘上的东西**"——重命名那颗按钮写「重命名」，
   * 用户按下去之前就知道自己在改什么。别的框（插链接、插图片）沿用默认即可。
   */
  confirmLabel?: string;
  placeholder?: string;
  hint?: string;
  secondLabel?: string;
  secondPlaceholder?: string;
  /**
   * 遮住输入的内容。
   *
   * ⚠️ 给的是**插件面板的 `prompt`**（`ui/panel-nodes.ts` 里的 `secret`）：
   * AI 插件的 API key 要用户当场填进去，那是屏幕上一个活生生的密钥，
   * 明文摆着会被旁边的人看走。填完就写进 `~/.config/nota/plugin-settings/`
   * （明文，见 `lua/api/settings.rs` 顶上那段"为什么不做加密"）。
   */
  secret?: boolean;
}

/**
 * 插入图像框要问的话。
 *
 * ⚠️ 框里问的**都不是问题本身**，全是"要不要多说一句话"：
 * `文档存过盘` 决定要不要提醒"复制到…那几个动作需要文档目录"；`能上传` /
 * `会自动上传` 决定那个上传勾选框显示、还是换成一句说明、还是根本不出现。
 *
 * ⚠️ 它**不问设置**——落地方式由宿主按 `settings.image` 自己算
 * （`src-tauri/src/image.rs`），框里只说"看设置"，不预告最后的落点：
 * 预告就得在前端再算一遍路径。
 */
export interface ImageRequest {
  /** 当前文档存过盘没有（没存盘 = 没有"文档旁边"这个目录）。 */
  文档存过盘: boolean;
  /**
   * 这台机器配了上传服务器吗（`image-upload.toml` 里 `enabled` 开着、
   * 地址也是 http/https）。**没配就不显示那个勾选框**——摆一个按下去报错的
   * 勾选框，比不摆更费解。
   */
  能上传: boolean;
  /**
   * 这份文档插一张本地图会不会**自动**上传（三道闸都过了）。
   * ⚠️ 为真时勾选框换成一句说明：这次会上传是文档说了算，勾不勾都一样。
   */
  会自动上传: boolean;
}

/** 用户在插入图像框里回答了什么。取消给 `null`。 */
export interface ImageAnswer {
  /** 哪张图。`path` = 磁盘上的文件，`url` = 一条网址。 */
  source: { kind: "path"; path: string } | { kind: "url"; url: string };
  /** 替代文字（可能为空串）。 */
  alt: string;
  /**
   * 勾了「插入后上传」。⚠️ **勾了不等于传成了**：上传失败时前端会退回
   * 正常的插入（图照进文档，地址是本地那条），错误另说一句。
   * 自动上传那条路不看这一项（那由文档的前件决定）。
   */
  上传: boolean;
}

export interface Dialogs {
  /** 现在要不要显示确认框，显示什么。`null` = 不显示。 */
  confirmReq: ConfirmRequest | null;
  /** 弹确认框，返回用户走的是哪条路（见 `ConfirmAnswer`）。 */
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>;
  /** 用户回答了（`ui/ConfirmDialog` 的 `onAnswer` 接这个）。 */
  answerConfirm: (answer: ConfirmAnswer) => void;

  promptReq: PromptRequest | null;
  /** 弹输入框，返回他填的值；取消给 `null`。 */
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
  /** 用户回答了（`ui/PromptDialog` 的 `onAnswer` 接这个）。 */
  answerPrompt: (value: string | null, second?: string) => void;

  imageReq: ImageRequest | null;
  /** 弹插入图像框，返回他选的图；取消给 `null`。 */
  askImage: (req: ImageRequest) => Promise<ImageAnswer | null>;
  /** 用户回答了（`ui/ImageDialog` 的 `onAnswer` 接这个）。 */
  answerImage: (answer: ImageAnswer | null) => void;

  emojiOpen: boolean;
  /**
   * 弹 Emoji 选择器，返回他选的**那一个字符**；取消给 `null`。
   *
   * ⚠️ 它**不收请求参数**（与上面三个不一样）：那个框没有"要先知道什么才能
   * 问对"的东西——表是页面上就有的，分类是表自己带的。多一个每次调用都要
   * 现造的 `{}` 只会让下面那个 `useState` 看起来像在传什么。
   *
   * ⚠️ 也**不是**"问一个问题"：用户是在**挑一个东西**，所以它落在一个
   * 整屏的网格上而不是一行输入上。这一点与另外三个框相同（都要答案）。
   */
  askEmoji: () => Promise<string | null>;
  /** 用户回答了（`ui/EmojiDialog` 的 `onAnswer` 接这个）。 */
  answerEmoji: (字符: string | null) => void;
}

export function useDialogs(): Dialogs {
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const confirmResolve = useRef<((answer: ConfirmAnswer) => void) | null>(null);

  const [promptReq, setPromptReq] = useState<PromptRequest | null>(null);
  const promptResolve = useRef<
    ((r: { value: string; second: string } | null) => void) | null
  >(null);

  const askConfirm = useCallback((req: ConfirmRequest) => {
    return new Promise<ConfirmAnswer>((resolve) => {
      confirmResolve.current = resolve;
      setConfirmReq(req);
    });
  }, []);

  const answerConfirm = useCallback((answer: ConfirmAnswer) => {
    setConfirmReq(null);
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    resolve?.(answer);
  }, []);

  const askPrompt = useCallback((req: PromptRequest) => {
    return new Promise<{ value: string; second: string } | null>((resolve) => {
      promptResolve.current = resolve;
      setPromptReq(req);
    });
  }, []);

  const answerPrompt = useCallback((value: string | null, second?: string) => {
    setPromptReq(null);
    const resolve = promptResolve.current;
    promptResolve.current = null;
    resolve?.(value === null ? null : { value, second: second ?? "" });
  }, []);

  const [imageReq, setImageReq] = useState<ImageRequest | null>(null);
  const imageResolve = useRef<((a: ImageAnswer | null) => void) | null>(null);

  const askImage = useCallback((req: ImageRequest) => {
    return new Promise<ImageAnswer | null>((resolve) => {
      imageResolve.current = resolve;
      setImageReq(req);
    });
  }, []);

  const answerImage = useCallback((answer: ImageAnswer | null) => {
    setImageReq(null);
    const resolve = imageResolve.current;
    imageResolve.current = null;
    resolve?.(answer);
  }, []);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiResolve = useRef<((字符: string | null) => void) | null>(null);

  const askEmoji = useCallback(() => {
    return new Promise<string | null>((resolve) => {
      emojiResolve.current = resolve;
      setEmojiOpen(true);
    });
  }, []);

  const answerEmoji = useCallback((字符: string | null) => {
    setEmojiOpen(false);
    const resolve = emojiResolve.current;
    emojiResolve.current = null;
    resolve?.(字符);
  }, []);

  return {
    confirmReq,
    askConfirm,
    answerConfirm,
    promptReq,
    askPrompt,
    answerPrompt,
    imageReq,
    askImage,
    answerImage,
    emojiOpen,
    askEmoji,
    answerEmoji,
  };
}
