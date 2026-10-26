"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowRight, ChevronRight, Menu, X } from "lucide-react";
import { IconMark } from "@/components/icons";
import { InstallButton } from "@/components/install-app";
import { LoginGate } from "@/components/login-gate";
import { ProductGlyph, type MarkName } from "@/components/landing-icons";
import { PhoneStage } from "@/components/landing-phone";
import type { Quote } from "@/lib/quote";

const features: { name: MarkName; title: string; body: string; well: string; ink: string }[] = [
  {
    name: "save",
    title: "Save",
    body: "Set goals and watch your money grow.",
    well: "bg-[#E7F6D8]",
    ink: "text-[#3C9A34]",
  },
  {
    name: "stream",
    title: "Stream",
    body: "Send and receive recurring payments.",
    well: "bg-[#EDE7FF]",
    ink: "text-[#7A5CDB]",
  },
  {
    name: "lock",
    title: "Lock",
    body: "Keep your funds safe until the right time.",
    well: "bg-[#F1F0EC]",
    ink: "text-[#17191C]",
  },
  {
    name: "groups",
    title: "Groups",
    body: "Save together with trusted people.",
    well: "bg-[#E5F0FF]",
    ink: "text-[#3B82F6]",
  },
];

const tools: { name: MarkName; title: string; body: string; action: string; well: string; ink: string }[] = [
  {
    name: "save",
    title: "Everyday Saver",
    body: "Build your goals, fund your future.",
    action: "Start saving",
    well: "bg-[#F3E9FF]",
    ink: "text-[#6FAE3A]",
  },
  {
    name: "swirl",
    title: "Flow Plans",
    body: "Automate your recurring payments.",
    action: "Create a plan",
    well: "bg-[#F3E9FF]",
    ink: "text-[#8B6FE0]",
  },
  {
    name: "lock",
    title: "Lock Vault",
    body: "Choose your term. Lock your funds.",
    action: "Create a vault",
    well: "bg-[#F4F1EA]",
    ink: "text-[#17191C]",
  },
];

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", mobileHref: "#features", label: "How it works" },
  { href: "#about", label: "About" },
];

const stats = [
  { value: "Base", label: "The network this beta uses" },
  { value: "USD", label: "What you see. Wrapped on chain." },
  { value: "Yours", label: "A vault signs with your key" },
];

function LimeButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#D6F34A] font-semibold text-[#141414] transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#c9ea38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

export function LandingHome({ quote, placed, hold = false }: { quote: Quote; placed: boolean; hold?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [intent, setIntent] = useState<"start" | "login">("start");

  function openAuth(next: "start" | "login") {
    setIntent(next);
    setMenuOpen(false);
    setAuthOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div id="top" className="min-h-dvh bg-[#F7F6F3] text-[#141414]">
      <header className="sticky top-0 z-40 border-b border-transparent bg-[#F7F6F3]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:h-[4.5rem] lg:px-8">
          <a href="#top" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.03em]">
            <IconMark className="size-8" />
            RvessFlow
            <span className="rounded-full bg-[#D6F34A] px-2 py-0.5 text-[11px] font-semibold tracking-normal">Beta</span>
          </a>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-sm text-[#3d4450] lg:flex" aria-label="Page">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="rounded-full px-1 py-1 hover:text-[#141414] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141414]">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="h-10 rounded-full px-3 text-sm font-medium text-[#141414] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
            >
              Log in
            </button>
            <InstallButton />
            <LimeButton onClick={() => openAuth("start")} className="h-10 px-4 text-sm">
              Get started
            </LimeButton>
          </div>
          <div className="flex items-center lg:hidden">
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="h-10 rounded-full px-3 text-sm font-medium text-[#141414] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
            >
              Log in
            </button>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-full hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div id="mobile-nav" className="border-t border-[#E7E4DC] px-5 py-3 lg:hidden">
            <nav className="flex flex-col" aria-label="Page">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={"mobileHref" in link ? link.mobileHref : link.href}
                  onClick={closeMenu}
                  className="flex h-12 items-center text-base font-medium"
                >
                  {link.label}
                </a>
              ))}
              <button type="button" onClick={() => openAuth("login")} className="flex h-12 items-center text-left text-base font-medium">
                Log in
              </button>
              <InstallButton className="py-2" />
            </nav>
          </div>
        ) : null}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-6 px-5 pt-8 pb-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-4 lg:px-8 lg:pt-10 lg:pb-2">
          <div className="max-w-xl">
            <h1 className="text-[3.15rem] leading-[0.94] font-semibold tracking-[-0.045em] sm:text-[4.25rem] lg:text-[5.15rem]">
              Your money,
              <br />
              in motion.
            </h1>
            <p className="mt-5 max-w-[28rem] text-[15px] leading-relaxed text-[#5C6572] sm:text-base">
              Save for your goals, stream payments, lock your funds, and grow together. This beta runs on Base.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <LimeButton onClick={() => openAuth("start")} className="h-12 w-full px-5 text-[15px] sm:w-auto sm:px-6">
                Get started
                <ArrowRight className="size-4" />
              </LimeButton>
              <InstallButton className="sm:hidden" />
            </div>
          </div>
          <PhoneStage quote={quote} placed={placed} hold={hold} />
        </section>

        <section id="features" className="scroll-mt-20 mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-14">
          <ul className="lg:hidden">
            {features.map((feature) => (
              <li key={feature.title} className="border-b border-[#E6E2D8] last:border-b-0">
                <button
                  type="button"
                  onClick={() => openAuth("start")}
                  className="flex w-full items-center gap-3 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
                >
                  <span className={`grid size-11 shrink-0 place-items-center rounded-full ${feature.well} ${feature.ink}`}>
                    <ProductGlyph name={feature.name} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{feature.title}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-[#5C6572]">{feature.body}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-[#B0B4BC]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <ul className="hidden lg:grid lg:grid-cols-4">
            {features.map((feature, index) => (
              <li key={feature.title} className={`px-6 text-center ${index > 0 ? "border-l border-[#E6E2D8]" : ""}`}>
                <span className={`mx-auto grid size-12 place-items-center rounded-full ${feature.well} ${feature.ink}`}>
                  <ProductGlyph name={feature.name} className="size-6" />
                </span>
                <h2 className="mt-4 text-base font-semibold">{feature.title}</h2>
                <p className="mx-auto mt-1.5 max-w-[14rem] text-sm leading-relaxed text-[#5C6572]">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how-it-works" className="scroll-mt-20 mx-auto hidden max-w-6xl items-start gap-10 px-8 py-6 lg:grid lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:py-10">
          <div className="max-w-md pt-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8A9099]">BUILT FOR REAL LIFE</p>
            <h2 className="mt-3 text-[2.7rem] leading-[1.02] font-semibold tracking-[-0.04em]">
              Simple tools
              <br />
              for bigger dreams.
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#5C6572]">
              RvessFlow combines the power of streaming payments, savings vaults, and group rotations into one seamless experience.
            </p>
            <LimeButton onClick={() => openAuth("start")} className="mt-7 h-12 px-5 text-[15px]">
              Get started
              <ArrowRight className="size-4" />
            </LimeButton>
          </div>
          <ul className="grid grid-cols-3 gap-4">
            {tools.map((tool) => (
              <li key={tool.title} className="flex min-h-[280px] flex-col rounded-[1.4rem] border border-[#EFECE6] bg-white px-5 pt-6 pb-5 shadow-[0_1px_0_rgba(20,20,20,0.03)]">
                <span className={`grid size-14 place-items-center rounded-2xl ${tool.well} ${tool.ink}`}>
                  <ProductGlyph name={tool.name} className="size-7" />
                </span>
                <h3 className="mt-6 text-[15px] font-semibold">{tool.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#5C6572]">{tool.body}</p>
                <button
                  type="button"
                  onClick={() => openAuth("start")}
                  className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-[#141414] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
                >
                  {tool.action}
                  <ArrowRight className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section id="about" className="scroll-mt-20 mx-auto max-w-6xl px-5 pt-2 pb-10 lg:px-8 lg:pt-8 lg:pb-16">
          <div className="rounded-[1.6rem] bg-[#F3F2EE] px-6 py-8 text-center lg:hidden">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Simple. Secure. Yours.</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#5C6572]">
              Built for everyday people, not just crypto experts.
            </p>
          </div>
          <div className="hidden items-center rounded-[1.4rem] border border-[#EFECE6] bg-white px-8 py-6 shadow-[0_1px_0_rgba(20,20,20,0.03)] lg:flex">
            <div className="min-w-[14rem] pr-8">
              <p className="text-sm font-semibold">Beta on Base</p>
              <p className="mt-1 text-sm text-[#5C6572]">Your vault. Your signature. No second chain hiding behind this screen.</p>
            </div>
            <ul className="grid flex-1 grid-cols-3">
              {stats.map((stat, index) => (
                <li key={stat.label} className={`px-6 ${index > 0 ? "border-l border-[#E6E2D8]" : ""}`}>
                  <p className="text-[1.7rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">{stat.value}</p>
                  <p className="mt-1.5 text-sm text-[#5C6572]">{stat.label}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <Dialog.Root open={authOpen} onOpenChange={setAuthOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#141414]/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[min(92dvh,820px)] w-[min(100%-1.25rem,27.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.7rem] bg-white shadow-[0_28px_80px_-28px_rgba(0,0,0,0.55)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <LoginGate intent={intent} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
