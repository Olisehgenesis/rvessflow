import Link from "next/link";
import { IconMark } from "@/components/icons";
import { ProtocolStatsPanel } from "@/components/protocol-stats-panel";

export const metadata = {
  title: "On-chain stats · Rvess",
  description: "Vaults, groups, locks, users, transactions, and G$ volume on Celo and Base.",
};

export default function StatsPage() {
  return (
    <main className="min-h-dvh bg-[#F7F6F3] text-[#141414]">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.03em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141414]"
        >
          <IconMark className="size-8" />
          Rvess
          <span className="rounded-full bg-[#D6F34A] px-2 py-0.5 text-[11px] font-semibold tracking-normal">Beta</span>
        </Link>
        <h1 className="mt-8 text-[2rem] leading-none font-semibold tracking-[-0.04em]">On-chain</h1>
        <ProtocolStatsPanel />
      </div>
    </main>
  );
}
