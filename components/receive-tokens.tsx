"use client";

import { ChainMark, TokenIcon } from "@/components/token-icon";

const baseTokens = ["USDC", "USDT", "USDM", "ETH", "USDCx", "ETHx"] as const;
const celoTokens = ["USDC", "USDT", "USDm", "USDM", "CELO", "cUSDx", "CELOx", "G$"] as const;

export function ReceiveTokens() {
  return (
    <div className="mt-4 space-y-3">
      <TokenRow chain="base" title="Base" tokens={baseTokens} />
      <TokenRow chain="celo" title="Celo" tokens={celoTokens} />
    </div>
  );
}

function TokenRow({
  chain,
  title,
  tokens,
}: {
  chain: "base" | "celo";
  title: string;
  tokens: readonly string[];
}) {
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="mt-2 flex flex-wrap gap-x-1.5 gap-y-2">
        {tokens.map((symbol) => (
          <li key={`${chain}-${symbol}`} className="w-9">
            <div className="flex flex-col items-center gap-0.5">
              <TokenIcon symbol={symbol} className="size-5" />
              <ChainMark chain={chain} className="size-2.5" />
              <span className="w-full truncate text-center text-[9px] leading-none text-muted-foreground">{symbol}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
