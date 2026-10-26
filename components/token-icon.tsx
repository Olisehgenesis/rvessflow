const tones: Record<string, { bg: string; glyph: string }> = {
  USDC: { bg: "#2775CA", glyph: "$" },
  USDT: { bg: "#26A17B", glyph: "₮" },
  ETH: { bg: "#627EEA", glyph: "◆" },
  USDCx: { bg: "#7C6BF2", glyph: "$" },
  ETHx: { bg: "#8B7CDB", glyph: "◆" },
};

export function TokenIcon({ symbol }: { symbol: string }) {
  const tone = tones[symbol] ?? { bg: "#141B2D", glyph: symbol.slice(0, 1) };
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: tone.bg }}>
      {tone.glyph}
    </span>
  );
}
