/**
 * **外部改动提示条**：别的程序动了我们打开着的那份文件时，编辑区顶上那一条。
 *
 * 用户 2026-09-26 点的那一条：「加入对本地其他程序修改后提示支持。有：**忽略**
 *（这里修改完保存依然直接存）、**重新载入**（载入磁盘修改文件）、**查看修改**
 *（用 diff）。」
 *
 * # 为什么是"条"而不是 toast
 *
 * 见 `ui/useExternalChanges.ts` 文件头那段：toast 会自己消失，而这条一旦消失，
 * 用户就再没有处理它的入口了。它是**状态**，不是"一次操作的结果"。
 *
 * # 三个按钮的措辞与后果（三句话都得说准）
 *
 * | 按钮 | 干了什么 | 用户以为会发生什么 | 会不会丢东西 |
 * |---|---|---|---|
 * | 忽略 | **只把这条划掉**（宿主那边已经不再报同一次改动） | 我继续编，存盘就覆盖它 | 磁盘上那份被别人改的内容会被覆盖——**这正是用户要的** |
 * | 重新载入 | `api.doc.reload`（磁盘那份进编辑器） | 我改的没了，换成磁盘上的 | **编辑器里没存的改动会丢**，所以走 `reloadDoc` 那道"有未保存的改动"确认 |
 * | 查看修改 | 摊一块只读对照（`ui/ExternalDiffPane.tsx`） | 先让我看看别人改了什么 | 什么都不动 |
 *
 * ⚠️ 三颗按钮**都不静音**：这是用户自己点的，每个后果都与他有关。这里没有
 * "省一条提示"的余地。
 *
 * # 多条同时存在
 *
 * 几份文件可能同时被改（比如一个 git checkout 动了工作区里好几个文件）。
 * 那就**一条一行**画出来，各自带自己的三个按钮——不要合成一句"有 3 个文件被改了"：
 * 那样用户得先点开才知道是哪几个，而"要不要去看"这个判断正需要文件名。
 */

import { useT } from "@/i18n";
import type { 外部改动 } from "@/ui/useExternalChanges";

interface Props {
  改动: 外部改动[];
  忽略: (id: number) => void;
  重新载入: (id: number) => void;
  查看修改: (id: number) => void;
  /** 正在看哪一份的对照（`null` = 没在看）。看的时候那颗按钮改成"回到正文"。 */
  正在看: number | null;
  /** 收起对照。 */
  关对照: () => void;
}

export function ExternalChangeBar({
  改动,
  忽略,
  重新载入,
  查看修改,
  正在看,
  关对照,
}: Props) {
  // ⚠️ 这一行不只是取值：它订阅了语言（宿主报来语言之后这一条要重画）。
  const t = useT();

  // 一条都没有时**整块不画**（返回 `null`，不是画一个空框子）。
  if (改动.length === 0) return null;

  return (
    <div className="external-change-bar" role="status">
      {改动.map((一) => (
        <div className="external-change-row" key={一.id}>
          {/* ⚠️ `title` 放完整路径：条上写的是文件名（窄），而"到底是哪一份"
              有时候得靠路径才分得清（两个目录下同名的 `README.md`）。 */}
          <span className="external-change-text" title={一.path}>
            {t("「{0}」在磁盘上被别的程序改了。", 一.title)}
          </span>
          <span className="external-change-spacer" />
          <button
            type="button"
            className="btn external-change-btn"
            onClick={() =>
              正在看 === 一.id ? 关对照() : 查看修改(一.id)
            }
            title={t("在编辑区里看磁盘上那份和编辑器里这份的差别")}
          >
            {正在看 === 一.id ? t("收起对照") : t("查看修改")}
          </button>
          <button
            type="button"
            className="btn external-change-btn"
            onClick={() => void 重新载入(一.id)}
            title={t("用磁盘上那份替换编辑器里的（没存的改动会丢，会先问你一次）")}
          >
            {t("重新载入")}
          </button>
          <button
            type="button"
            className="btn external-change-btn"
            onClick={() => 忽略(一.id)}
            title={t("不管它：继续编辑，存盘时覆盖磁盘上那份")}
          >
            {t("忽略")}
          </button>
        </div>
      ))}
    </div>
  );
}
