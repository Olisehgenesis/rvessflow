import { createAvatar } from "@dicebear/core";
import * as personas from "@dicebear/personas";

export function ProfileAvatar({ seed, className = "size-9" }: { seed: string; className?: string }) {
  const svg = createAvatar(personas, {
    seed: seed.trim() || "rvess",
    backgroundColor: ["e4f6b8"],
    radius: 50,
  }).toString();
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt=""
      className={`${className} rounded-full bg-[#E4F6B8]`}
    />
  );
}
