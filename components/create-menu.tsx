"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBolt, IconDown, IconLock, IconPeople, IconPlus, IconTarget } from "@/components/icons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const actions = [
  { href: "/home/add", title: "Top up", body: "Crypto, mobile money, or a card", icon: IconDown, well: "bg-[#D4F06B] text-[#1C2A14]" },
  { href: "/goals/new", title: "New goal", body: "Set a goal and watch it grow", icon: IconTarget, well: "bg-[#D4F06B] text-[#1C2A14]" },
  { href: "/vaults/new", title: "New lock", body: "Vaults", icon: IconLock, well: "bg-[#E7F6C8] text-[#1C2A14]" },
  { href: "/goals/new?kind=flow", title: "Start stream", body: "A recurring payment", icon: IconBolt, well: "bg-[#E4D9FF] text-[#6A4ED4]" },
  { href: "/groups/new", title: "New group", body: "Save with trusted people", icon: IconPeople, well: "bg-[#DDD4FF] text-[#6550C4]" },
];

export function CreateMenu() {
  const pathname = usePathname();
  return <CreateMenuBody key={pathname} />;
}

function CreateMenuBody() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="Create"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative -mt-7 grid size-14 place-items-center rounded-full bg-[#D4F06B] text-[#141B2D] shadow-[0_10px_24px_rgba(20,27,45,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141B2D]"
      >
        <IconPlus className="size-7" />
      </button>
      <SheetContent side="bottom" className="mx-auto w-full max-w-lg rounded-t-3xl border-0 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#E3E8DC]" />
        <SheetHeader className="px-1 pb-2">
          <SheetTitle>Create</SheetTitle>
          <SheetDescription>Top up, or start a goal, lock, stream, or group.</SheetDescription>
        </SheetHeader>
        <ul className="space-y-2">
          {actions.map((action) => (
            <li key={action.href}>
              <Link href={action.href} className="flex items-center gap-3 rounded-2xl px-2 py-2.5" onClick={() => setOpen(false)}>
                <span className={`grid size-11 place-items-center rounded-full ${action.well}`}>
                  <action.icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{action.title}</span>
                  <span className="block text-xs text-muted-foreground">{action.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/vaults" className="mt-2 flex h-11 items-center justify-center rounded-full text-sm font-medium text-[#3C4A2E]" onClick={() => setOpen(false)}>
          Open vaults
        </Link>
      </SheetContent>
    </Sheet>
  );
}
