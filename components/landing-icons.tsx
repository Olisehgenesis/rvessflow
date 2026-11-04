export type MarkName = "save" | "stream" | "lock" | "groups" | "swirl";

const appIcons: Record<MarkName, string> = {
  save: "/nav/goals.png",
  stream: "/marks/flow.png",
  lock: "/marks/lock.png",
  groups: "/nav/groups.png",
  swirl: "/marks/flow.png",
};

export function ProductGlyph({ name, className }: { name: MarkName; className?: string }) {
  return <img src={appIcons[name]} alt="" className={`object-contain ${className ?? ""}`} />;
}
