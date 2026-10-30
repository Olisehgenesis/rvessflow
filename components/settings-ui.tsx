"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronRight, Lock, Settings2, ShieldCheck, UserRound, Wrench } from "lucide-react";

export const settingsLinks = [
  { href: "/settings", match: (path: string) => path === "/settings" || path.startsWith("/settings/account"), label: "Account", hint: "Profile, identity and wallet", Icon: UserRound },
  { href: "/settings/verify", match: (path: string) => path.startsWith("/settings/verify"), label: "Verification", hint: "Face check and daily G$", Icon: ShieldCheck },
  { href: "/settings/preferences", match: (path: string) => path.startsWith("/settings/preferences"), label: "Preferences", hint: "Currency and how people find you", Icon: Settings2 },
  { href: "/settings/security", match: (path: string) => path.startsWith("/settings/security"), label: "Wallet & Security", hint: "Passkeys, sessions and backup", Icon: Lock },
  { href: "/settings/advanced", match: (path: string) => path.startsWith("/settings/advanced"), label: "Advanced", hint: "Network, contracts and more", Icon: Wrench },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-6 hidden lg:block" aria-label="Settings">
      <ul className="space-y-1">
        {settingsLinks.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] ${
                  active ? "bg-[#E7F4C4] font-semibold text-[#141414]" : "text-[#3A3F47] hover:bg-white"
                }`}
              >
                <item.Icon className="size-4 shrink-0" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsHubList() {
  return (
    <ul className="overflow-hidden rounded-[1.6rem] border border-[#E6EADF] bg-white">
      {settingsLinks.map((item, index) => (
        <li key={item.href} className={index === 0 ? "" : "border-t border-[#E6EADF]"}>
          <Link href={item.href === "/settings" ? "/settings/account" : item.href} className="flex min-h-[4.25rem] items-center gap-3 px-4 py-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#F3F7E8] text-[#141414]">
              <item.Icon className="size-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#141414]">{item.label}</span>
              <span className="mt-0.5 block truncate text-sm text-[#5C6572]">{item.hint}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#9AA3AE]" strokeWidth={1.75} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.6rem] border border-[#E6EADF] bg-white p-5 shadow-[0_1px_0_rgba(20,20,20,0.04)] lg:p-6">
      {title ? <h2 className="mb-4 font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.03em] text-[#141414]">{title}</h2> : null}
      {children}
    </section>
  );
}

export function SettingsRow({
  label,
  value,
  action,
}: {
  label: string;
  value?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-t border-[#E6EADF]">
      <p className="shrink-0 py-3 text-sm text-[#5C6572]">{label}</p>
      <div className="flex min-w-0 items-center justify-end gap-2 py-3 text-sm font-medium text-[#141414]">
        {value}
        {action}
      </div>
    </div>
  );
}
