export type HoldingRow = {
  key: string;
  label: string;
  network: string;
  amount: string;
  usd: string;
  local?: string;
  /** Tokens inside this balance. USD opens onto USDC, USDT, and the other dollar tokens. */
  parts?: HoldingRow[];
};
