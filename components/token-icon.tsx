import { money } from "@/lib/display";
import { asGroupToken, groupTokenKindFromAddress, groupUnit } from "@/lib/group-token";

const sources: Record<string, string> = {
  USDC: "/tokens/usdc.svg",
  USD: "/tokens/usdc.svg",
  USDCx: "/tokens/usdc.svg",
  cUSDx: "/tokens/usdc.svg",
  fUSDCx: "/tokens/usdc.svg",
  USDm: "/tokens/usdm.png",
  USDM: "/tokens/usdc.svg",
  ETH: "/tokens/eth.png",
  ETHx: "/tokens/eth.png",
  USDT: "/tokens/usdt.png",
  CELO: "/tokens/celo.svg",
  CELOx: "/tokens/celo.svg",
  "G$": "/tokens/gdx.png",
  GDX: "/tokens/gdx.png",
  GoodDollar: "/tokens/gdx.png",
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
  if (symbol === "CELO" || symbol === "CELOx" || symbol === "cUSDx" || symbol === "G$") return ["celo"];
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
  withChain = true,
}: {
  symbol: string;
  network?: string;
  className?: string;
  withChain?: boolean;
}) {
  const src = sources[symbol];
  const marks = withChain ? chainKeys(network, symbol) : [];
  const face = src ? (
    <img src={src} alt="" className="size-full rounded-full object-contain" />
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

function groupKind(token: string) {
  if (token.startsWith("0x")) return groupTokenKindFromAddress(token);
  if (token === "gdx" || token === "G$" || token === "GDX" || token === "GoodDollar") return "gdx" as const;
  return asGroupToken(token);
}

function groupSymbol(token: string, network?: string) {
  const kind = groupKind(token);
  if (kind === "gdx") return "G$";
  if (network === "celo" || /\bcelo\b/i.test(network ?? "")) return "cUSDx";
  if (network === "base" || /\bbase\b/i.test(network ?? "")) return "USDCx";
  return "USD";
}

export function GroupMoney({
  amount,
  wei,
  token,
  network,
  className = "size-4",
}: {
  amount?: string;
  wei?: string | bigint;
  token: string;
  network?: string;
  className?: string;
}) {
  const kind = groupKind(token);
  const symbol = groupSymbol(token, network);
  const shown = amount ?? money(wei ?? "0");
  return (
    <span className="inline-flex items-center gap-1.5">
      <TokenIcon symbol={symbol} network={kind === "gdx" ? "Celo" : network} className={className} withChain={false} />
      <span className="tabular-nums">
        {shown} {groupUnit(kind)}
      </span>
    </span>
  );
}
