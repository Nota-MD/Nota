




















import type { PluginPrompt } from "@/bridge/ipc";
import type { PromptRequest } from "@/ui/useDialogs";

type AskSentence = (req: PromptRequest) => Promise<{ value: string; second: string } | null>;

export interface AskParameterEnterParameter {

  prompt: PluginPrompt | null;

  askPrompt: AskSentence;

  args?: unknown;






  title?: string;
}








export async function askParameter(o: AskParameterEnterParameter): Promise<{ args: unknown } | null> {
  const { prompt, askPrompt, args } = o;
  if (!prompt) return { args };

  const answer = await askPrompt({
    title: o.title || prompt.label,
    label: prompt.label,
    placeholder: prompt.placeholder || undefined,
    hint: prompt.hint || undefined,
    secret: prompt.secret,


    secondLabel: prompt.secondLabel || undefined,
    secondPlaceholder: prompt.secondPlaceholder || undefined,
  });



  if (!answer) return null;




  const bottom = typeof args === "object" && args !== null && !Array.isArray(args) ? args : {};
  const output2: Record<string, unknown> = { ...(bottom as Record<string, unknown>), [prompt.arg]: answer.value };


  if (prompt.secondArg) output2[prompt.secondArg] = answer.second;
  return { args: output2 };
}
