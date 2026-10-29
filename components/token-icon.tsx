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

const chainMark: Record<"base" | "celo", string> = {
  base: "/tokens/chains/base.svg",
  celo: "/tokens/chains/celo.svg",
};

function chainKeys(network?: string): ("base" | "celo")[] {
  if (!network) return [];
  const keys: ("base" | "celo")[] = [];
  if (/\bbase\b/i.test(network)) keys.push("base");
  if (/\bcelo\b/i.test(network)) keys.push("celo");
  return keys;
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
  const marks = chainKeys(network);
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
    <span className={`${className} relative mb-1 block shrink-0`}>
      {face}
      <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
        {marks.map((key) => (
          <img key={key} src={chainMark[key]} alt="" className="size-3.5 rounded-full ring-[1.5px] ring-background" />
        ))}
      </span>
    </span>
  );
}
