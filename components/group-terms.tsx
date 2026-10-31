"use client";

import { CYCLE_PRESETS, MAX_GROUP_CYCLES, type CycleChoice } from "@/lib/cycle";
import type { GroupTokenKind } from "@/lib/group-token";
import { ChainMark, TokenIcon } from "@/components/token-icon";
import { groupMark } from "@/components/groups-ui";
import { groupChainFacts, type GroupNet } from "@/lib/group-network";

export const field = "h-12 rounded-2xl border-border bg-white px-4 text-base shadow-none";

export function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${on ? "bg-[#E7F4C4] text-[#141414]" : "border border-[#E6EADF] bg-white text-[#3A3F47]"}`}
    >
      {children}
    </button>
  );
}

export function CycleCount({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {CYCLE_PRESETS.map((n) => (
          <Chip key={n} on={value === String(n)} onClick={() => onChange(String(n))}>
            {n}
          </Chip>
        ))}
      </div>
      <input
        id="cycles"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 3))}
        className={`${field} w-full`}
        aria-label="Number of turns"
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Two people, every week: Week, then 2 for one turn each, or 52 for a year. Max {MAX_GROUP_CYCLES}.
      </p>
    </div>
  );
}

export function DurationChips({
  choice,
  onChoice,
}: {
  choice: CycleChoice;
  onChoice: (next: CycleChoice) => void;
}) {
  const options: { id: CycleChoice; label: string }[] = [
    { id: "hour", label: "Hourly" },
    { id: "week", label: "Weekly" },
    { id: "month", label: "Monthly" },
    { id: "year", label: "Yearly" },
    { id: "custom", label: "Custom" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((item) => (
        <Chip key={item.id} on={choice === item.id} onClick={() => onChoice(item.id)}>
          {item.label}
        </Chip>
      ))}
    </div>
  );
}

export function TokenChips({
  network,
  token,
  onToken,
}: {
  network: GroupNet;
  token: GroupTokenKind;
  onToken: (next: GroupTokenKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip on={token === "usd"} onClick={() => onToken("usd")}>
        <TokenIcon symbol={network === "celo" ? "cUSDx" : "USDCx"} className="size-5" withChain={false} />
        USD
      </Chip>
      {network === "celo" ? (
        <Chip on={token === "gdx"} onClick={() => onToken("gdx")}>
          <TokenIcon symbol="G$" className="size-5" withChain={false} />
          G$
        </Chip>
      ) : null}
    </div>
  );
}

export function ChainTiles({
  network,
  onNetwork,
}: {
  network: GroupNet;
  onNetwork: (next: GroupNet) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["celo", "base"] as const).map((net) => {
        const fact = groupChainFacts[net];
        const on = network === net;
        return (
          <button
            key={net}
            type="button"
            onClick={() => onNetwork(net)}
            className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-left ${on ? "border-2 border-foreground bg-white" : "border border-border bg-card"}`}
          >
            <ChainMark chain={net} className="size-5" />
            <span className="text-sm font-semibold">{fact.title}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PayoutTiles({
  payout,
  onPayout,
  live,
}: {
  payout: string;
  onPayout: (next: string) => void;
  live: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={!live}
        onClick={() => onPayout("plain")}
        className={`rounded-2xl px-3 py-3 text-left ${payout === "plain" ? "border-2 border-foreground bg-white" : "border border-border bg-card"} ${live ? "" : "opacity-40"}`}
      >
        <img src={groupMark.save} alt="" className="mb-2 size-8 object-contain" />
        <span className="block text-sm font-semibold">Paid each turn</span>
        <span className="mt-1 block text-xs text-muted-foreground">Sends the contribution to whose turn it is.</span>
      </button>
      <button
        type="button"
        onClick={() => onPayout("stream")}
        className={`rounded-2xl px-3 py-3 text-left ${payout === "stream" ? "border-2 border-foreground bg-white" : "border border-border bg-card"}`}
      >
        <img src={groupMark.stream} alt="" className="mb-2 size-8 object-contain" />
        <span className="block text-sm font-semibold">Streaming pot</span>
        <span className="mt-1 block text-xs text-muted-foreground">Pays that person every second.</span>
      </button>
    </div>
  );
}
