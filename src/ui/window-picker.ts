export function windowIdWidth(ids: readonly number[]): number {
  return String(Math.max(1, ...ids)).length;
}

export function formatWindowId(id: number, ids: readonly number[]): string {
  return String(id).padStart(windowIdWidth(ids), "0");
}

export function windowPickerError(
  value: string,
  ids: readonly number[],
  currentId: number,
): "digits" | "width" | "self" | "missing" | null {
  if (value === "") return null;
  const width = windowIdWidth(ids);
  if (!/^\d+$/.test(value)) return "digits";
  if (value.length !== width) return "width";
  const id = Number(value);
  if (id === currentId) return "self";
  if (!ids.includes(id)) return "missing";
  return null;
}

