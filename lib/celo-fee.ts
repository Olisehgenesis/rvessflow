import { encodeFunctionData, erc20Abi, type Address, type Hex, type PublicClient } from "viem";

/** Recoup sponsored Celo passkey gas here. */
export const celoGasTreasury = "0x50c503dFFd9e8d0903Bf33376F6DdD278209939A" as Address;

/** Extra UserOp gas for the ERC-20 transfer that pays the treasury. */
export const celoSkimTransferGas = 80_000n;

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

/** Native CELO UserOp cost plus the skim transfer, with the same 20% headroom as userOpCost. */
export function withSkimGas(costWei: bigint, maxFeePerGas: bigint) {
  return costWei + (celoSkimTransferGas * maxFeePerGas * 120n) / 100n;
}

/** Convert a CELO-wei UserOp cost into token units, including Pimlico's 10% surcharge, rounding up. */
export function tokenAmountForCeloGas(input: { costWei: bigint; nativePrice: bigint; tokenPrice: bigint; decimals: number }) {
  if (input.nativePrice === 0n) throw new Error("Celo gas price was zero.");
  const as18 = (input.costWei * input.tokenPrice * 110n) / (input.nativePrice * 100n);
  if (input.decimals >= 18) {
    const amount = as18 * 10n ** BigInt(input.decimals - 18);
    return amount > 0n ? amount : 1n;
  }
  const scale = 10n ** BigInt(18 - input.decimals);
  const amount = (as18 + scale - 1n) / scale;
  return amount > 0n ? amount : 1n;
}

export function pickCeloFeeCovering(amounts: readonly bigint[], needed: readonly bigint[]): CeloFeePick | null {
  for (let index = 0; index < celoFeeCurrencies.length; index += 1) {
    const row = celoFeeCurrencies[index];
    const due = needed[index] ?? 0n;
    if (row && due > 0n && (amounts[index] ?? 0n) >= due) return row;
  }
  return pickCeloFeeFromBalances(amounts);
}

export function celoGasSkimCall(token: Address, amount: bigint): { to: Address; data: Hex; value: bigint } {
  return {
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [celoGasTreasury, amount] }),
    value: 0n,
  };
}
