"use client";

import { IconMoon, IconSun } from "@/components/icons";

export function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const day = hour < 17;
  return (
    <div>
      <p className="text-base text-[#4E5A48]">{hello},</p>
      <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.85rem] font-semibold leading-tight tracking-tight">
        {name}
        {day ? <IconSun className="size-6 text-[#E2A93B]" /> : <IconMoon className="size-6 text-[#7A6AD4]" />}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Save. Stream. Lock. Grow.</p>
    </div>
  );
}
