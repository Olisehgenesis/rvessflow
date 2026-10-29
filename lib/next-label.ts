/** Next unused `flow#1`, `saving#2`, … from names this account already has. */
export function nextLabel(prefix: string, names: readonly string[]): string {
  const used = new Set<number>();
  const pattern = new RegExp(`^${escapeRegExp(prefix)}#(\\d+)$`, "i");
  for (const name of names) {
    const match = name.trim().match(pattern);
    if (match?.[1]) used.add(Number(match[1]));
  }
  let index = 1;
  while (used.has(index)) index += 1;
  return `${prefix}#${index}`;
}

export function filledName(raw: string, prefix: string, names: readonly string[]): string {
  const clean = raw.trim();
  if (clean) return clean.slice(0, 31);
  return nextLabel(prefix, names);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
