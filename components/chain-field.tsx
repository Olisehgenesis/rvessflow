"use client";

import { useState } from "react";
import Link from "next/link";
import { ChainMark } from "@/components/token-icon";
import { groupChainFacts, groupNetLabel, recommendedGroupNet, type GroupNet } from "@/lib/group-network";

export function ChainField({
  name = "network",
  initial = recommendedGroupNet,
  value,
  onChange,
  hint = "Same address on both. This saving, stream, or lock stays on the chain you pick.",
}: {
  name?: string;
  initial?: GroupNet;
  value?: GroupNet;
  onChange?: (net: GroupNet) => void;
  hint?: string;
}) {
  const [inner, setInner] = useState<GroupNet>(initial);
  const network = value ?? inner;
  function pick(next: GroupNet) {
    setInner(next);
    onChange?.(next);
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Chain</legend>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {hint}{" "}
        <Link href="/groups/chains" className="font-medium text-foreground underline">
          Base vs Celo
        </Link>
      </p>
      <input type="hidden" name={name} value={network} />
      {(["celo", "base"] as const).map((net) => {
        const fact = groupChainFacts[net];
        const on = network === net;
        return (
          <button
            key={net}
            type="button"
            aria-pressed={on}
            onClick={() => pick(net)}
            className={`flex w-full items-start gap-3 rounded-2xl bg-card px-3 py-3 text-left ${on ? "border-2 border-foreground" : "border border-border"}`}
          >
            <ChainMark chain={net} className="mt-0.5 size-6" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold">{groupNetLabel(net)}</span>
                {fact.recommend ? <span className="rounded-full bg-[#E7F4C4] px-2 py-0.5 text-[11px] font-medium">Recommended</span> : null}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{fact.fee}</span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
