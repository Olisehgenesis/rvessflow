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
};

export function TokenIcon({ symbol, className = "size-11" }: { symbol: string; className?: string }) {
  const src = sources[symbol];
  if (!src) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background ${className}`}>
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return <img src={src} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
}
