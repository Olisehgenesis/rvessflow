import { erc20Abi, type Address, type PublicClient } from "viem";

/** Celo mainnet CIP-64. `feeCurrency` is the adapter when decimals are not 18. */
export const celoFeeCurrencies = [
  {
    label: "USDT",
    token: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address,
    feeCurrency: "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72" as Address,
    decimals: 6,
    min: 20_000n,
  },
  {
    label: "USDC",
    token: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address,
    feeCurrency: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B" as Address,
    decimals: 6,
    min: 20_000n,
  },
  {
    label: "USDm",
    token: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address,
    feeCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address,
    decimals: 18,
    min: 20_000_000_000_000_000n,
  },
] as const;

export type CeloFeePick = (typeof celoFeeCurrencies)[number];

export function pickCeloFeeFromBalances(amounts: readonly bigint[]): CeloFeePick | null {
  for (let index = 0; index < celoFeeCurrencies.length; index += 1) {
    const row = celoFeeCurrencies[index];
    if (row && (amounts[index] ?? 0n) >= row.min) return row;
  }
  return null;
}

/** First dollar token that can cover a Celo fee: USDT, then USDC, then USDm. */
export async function pickCeloFee(reader: Pick<PublicClient, "readContract">, owner: Address): Promise<CeloFeePick | null> {
  const amounts = await Promise.all(
    celoFeeCurrencies.map((row) =>
      reader.readContract({ address: row.token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }).catch(() => 0n),
    ),
  );
  return pickCeloFeeFromBalances(amounts);
}

export function celoFeeTx(feeCurrency?: Address) {
  if (!feeCurrency) return {};
  return { feeCurrency, type: "0x7b" as const };
}
