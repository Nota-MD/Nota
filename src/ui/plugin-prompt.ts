/**
 * 「点了之后先问一句」的那一步。**插件面板的按钮和插件的菜单项共用它。**
 *
 * # 为什么值得单独一个文件
 *
 * 两条路都要做同一件事：拿插件声明的 `prompt` 去弹宿主的输入框，把用户填的
 * 值塞进 `args`。这件事里有一条**容易写错、错了还不报错**的规矩——
 * 用户取消时**什么都别做**，绝不能退化成"把空串当参数发出去"
 * （git 会收到一条空提交信息；AI 那边会拿空串当提问发到网上）。
 *
 * 规矩写两遍就会漂：一边改了、另一边没改。所以收在这里一处，
 * 两条路都调它。这也是 `commands.ts` 的 `resolvePick`、`commands.ts` 的
 * `themeEntries` 处理同一类问题的办法——**判据只有一处**。
 *
 * # 面板**没有自己的输入控件**
 *
 * 面板的内容是一份"只读的 JSON"（见 `ui/panel-nodes.ts`），里面没有任何
 * 控件状态。要输入就借宿主的 `PromptDialog`（和「格式 → 超链接」用的是同一个），
 * 于是"面板里能不能输入"这件事不引入第二套实现。
 */

import type { PluginPrompt } from "@/bridge/ipc";
import type { PromptRequest } from "@/ui/useDialogs";

type AskSentence = (req: PromptRequest) => Promise<{ value: string; second: string } | null>;

export interface AskParameterEnterParameter {
  /** 插件声明的问句。**`null` = 不用问，原样发 `args`。** */
  prompt: PluginPrompt | null;
  /** 弹框的函数（`App.tsx` 的 `askPrompt`）。 */
  askPrompt: AskSentence;
  /** 插件自己写的参数。用户填的那个键会盖在它上面。 */
  args?: unknown;
  /**
   * 对话框**标题**。省略时用 `prompt.label`。
   *
   * 按钮那一路传按钮上的字（「提交…」），于是框里是"标题＝提交…、字段＝提交信息"；
   * 菜单那一路没有"按钮上的字"可传，标题和字段就是同一句。
   */
  title?: string;
}

/**
 * 问一句，换回真正要发出去的参数。
 *
 * @returns `{ args }` 可以发了；**`null` = 用户取消了，调用方什么都别做**。
 *   包一层对象而不是直接返回 `args`：`args` 本身可以是 `undefined`
 *   （"这条命令没有参数"是合法的），不包的话"取消"和"没有参数"就分不开。
 */
export async function askParameter(o: AskParameterEnterParameter): Promise<{ args: unknown } | null> {
  const { prompt, askPrompt, args } = o;
  if (!prompt) return { args };

  const answer = await askPrompt({
    title: o.title || prompt.label,
    label: prompt.label,
    placeholder: prompt.placeholder || undefined,
    hint: prompt.hint || undefined,
    secret: prompt.secret,
    // 第二个字段：空串就是"没这一行"。`secondArg` 有值而标签没有的情况
    // 到不了这里——`提示()` 已经把它们一起清空了（两处判据一致）。
    secondLabel: prompt.secondLabel || undefined,
    secondPlaceholder: prompt.secondPlaceholder || undefined,
  });

  // ⚠️ 取消就**到此为止**。`PromptDialog` 把"填了空白再确定"也当取消
  // （见那边 `submit` 的注释），所以这一条同时挡住了"空提交信息"。
  if (!answer) return null;

  // 插件自己写的 `args` 与用户填的**合并**，同名时用户填的赢——
  // 他就是来改这个键的。不是对象（数组、字符串、`undefined`）就当没有，
  // 不硬往里塞：那样得到的 `args` 形状是插件没约好的。
  const bottom = typeof args === "object" && args !== null && !Array.isArray(args) ? args : {};
  const output2: Record<string, unknown> = { ...(bottom as Record<string, unknown>), [prompt.arg]: answer.value };
  // 第二个值只在**真问了**的时候才放：`secondArg` 空着而这里硬塞一个空串，
  // 会让插件收到一个它没要的键（Git 那条会把邮箱写成空串）。
  if (prompt.secondArg) output2[prompt.secondArg] = answer.second;
  return { args: output2 };
}
