const sources: Record<string, string> = {
  USDC: "/tokens/usdc.svg",
  USD: "/tokens/usdc.svg",
  USDCx: "/tokens/usdc.svg",
  cUSDx: "/tokens/usdc.svg",
  fUSDCx: "/tokens/usdc.svg",
  USDm: "/tokens/usdc.svg",
  USDM: "/tokens/usdc.svg",
  ETH: "/tokens/eth.png",
  ETHx: "/tokens/eth.png",
  USDT: "/tokens/usdt.png",
  CELO: "/tokens/celo.svg",
  CELOx: "/tokens/celo.svg",
};

const chainMark: Record<"base" | "celo", { src: string; round: string }> = {
  base: { src: "/tokens/chains/base.svg", round: "rounded-[18%]" },
  celo: { src: "/tokens/chains/celo.svg", round: "rounded-full" },
};

function chainKeys(network?: string, symbol?: string): ("base" | "celo")[] {
  const keys: ("base" | "celo")[] = [];
  if (network) {
    if (/\bbase\b/i.test(network)) keys.push("base");
    if (/\bcelo\b/i.test(network)) keys.push("celo");
    return keys;
  }
  if (symbol === "CELO" || symbol === "CELOx" || symbol === "cUSDx") return ["celo"];
  if (symbol === "ETH" || symbol === "ETHx" || symbol === "USDCx" || symbol === "fUSDCx") return ["base"];
  return [];
}

export function ChainMark({ chain, className = "size-5" }: { chain: "base" | "celo"; className?: string }) {
  const mark = chainMark[chain];
  return <img src={mark.src} alt={chain === "base" ? "Base" : "Celo"} className={`${className} shrink-0 ${mark.round}`} />;
}

export function TokenIcon({
  symbol,
  network,
  className = "size-11",
}: {
  symbol: string;
  network?: string;
  className?: string;
}) {
  const src = sources[symbol];
  const marks = chainKeys(network, symbol);
  const face = src ? (
    <img src={src} alt="" className="size-full rounded-full object-cover" />
  ) : (
    <span className="grid size-full place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
      {symbol.slice(0, 1)}
    </span>
  );
  if (marks.length === 0) {
    return <span className={`${className} relative block shrink-0`}>{face}</span>;
  }
  return (
    <span className={`${className} relative mb-1.5 block shrink-0`}>
      {face}
      <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
        {marks.map((key) => (
          <img
            key={key}
            src={chainMark[key].src}
            alt=""
            className={`size-3.5 ring-[1.5px] ring-background ${chainMark[key].round}`}
          />
        ))}
      </span>
    </span>
  );
}
