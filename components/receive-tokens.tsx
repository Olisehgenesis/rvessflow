"use client";

import { useState } from "react";
import { TokenIcon } from "@/components/token-icon";

const baseTokens = ["USDC", "USDT", "USDM", "ETH", "USDCx", "ETHx"] as const;
const celoTokens = ["USDC", "USDT", "USDm", "USDM", "CELO", "cUSDx", "CELOx", "G$"] as const;

export function ReceiveTokens() {
  const [picked, setPicked] = useState<{ chain: "base" | "celo"; symbol: string } | null>({
    chain: "celo",
    symbol: "G$",
  });
  return (
    <div className="mt-4 space-y-4">
      <TokenRow chain="base" title="Base" tokens={baseTokens} picked={picked} onPick={setPicked} />
      <TokenRow chain="celo" title="Celo" tokens={celoTokens} picked={picked} onPick={setPicked} />
      {picked ? (
        <p className="text-center text-sm font-medium">
          {picked.symbol}
          <span className="font-normal text-muted-foreground"> · {picked.chain === "base" ? "Base" : "Celo"}</span>
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Tap a token to see its name.</p>
      )}
    </div>
  );
}

function TokenRow({
  chain,
  title,
  tokens,
  picked,
  onPick,
}: {
  chain: "base" | "celo";
  title: string;
  tokens: readonly string[];
  picked: { chain: "base" | "celo"; symbol: string } | null;
  onPick: (next: { chain: "base" | "celo"; symbol: string }) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {tokens.map((symbol) => {
          const on = picked?.chain === chain && picked.symbol === symbol;
          return (
            <li key={`${chain}-${symbol}`}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={symbol}
                title={symbol}
                onClick={() => onPick({ chain, symbol })}
                className={`grid size-12 place-items-center rounded-full ${on ? "ring-2 ring-foreground" : "ring-1 ring-border"}`}
              >
                <TokenIcon symbol={symbol} network={title} className="size-10" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
