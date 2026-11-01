/**
 * 长尾代码语言表的按需加载层。
 *
 * `refractor` 的基础入口只注册常用语言；`refractor/all` 会一次性注册数百种
 * 语言。后者不应在启动或只要文档里出现代码块时加载：注册表和对应解析器会
 * 常驻网页进程，纯文本编辑并不需要它们。
 *
 * 需要完整语言表的只有两条路：
 * - 打开语言选择器，供用户挑选或搜索；
 * - 文档里的代码块使用了基础表尚未注册的语言。
 */

let fullTablePromise: Promise<void> | null = null;
let fullTableReady = false;

/** 完整语言表是否已经加载并完成注册。 */
export function languageTableReady(): boolean {
  return fullTableReady;
}

/** 按需加载完整语言表；重复调用共享同一个 Promise。 */
export function ensureFullLanguageTable(): Promise<void> {
  fullTablePromise ??= import("refractor/all")
    .then(() => {
      fullTableReady = true;
    })
    .catch((error: unknown) => {
      // 动态 import 失败时允许下一次重试；否则一次临时 I/O 错误会让完整语言表
      // 在本次进程里永久不可用。
      fullTablePromise = null;
      throw error;
    });
  return fullTablePromise;
}
