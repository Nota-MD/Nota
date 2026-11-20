export type PluginApiRelation = "compatible" | "too-new" | "too-old" | "invalid";

function parseVersion(value: string): [number, number] | null {
  const match = /^v(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function pluginApiRelation(required: string, supported: string): PluginApiRelation {
  const want = parseVersion(required);
  const have = parseVersion(supported);
  if (!want || !have) return "invalid";
  if (want[0] > have[0] || (want[0] === have[0] && want[1] > have[1])) return "too-new";
  if (want[0] < have[0]) return "too-old";
  return "compatible";
}

export function pluginApiHintKey(
  required: string,
  supported: string,
): "update" | "contact" | null {
  const relation = pluginApiRelation(required, supported);
  if (relation === "too-new") return "update";
  if (relation === "too-old") return "contact";
  return null;
}

export function pluginApiHintFromError(
  error: unknown,
  hostFallback: string,
): {
  required: string;
  supported: string;
  hint: "update" | "contact" | null;
} {
  const versions = String(error).match(/v\d+\.\d+/g) ?? [];
  const required = versions[0] ?? "";
  const supported = versions[1] ?? hostFallback;
  return {
    required,
    supported,
    hint: pluginApiHintKey(required, supported),
  };
}
