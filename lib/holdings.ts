import "server-only";

import { zeroAddress, type Address } from "viem";
import { baseMarket } from "@/lib/base-market";
import { maxUsdInput } from "@/lib/deposit-math";
import { balanceColumns } from "@/lib/home-math";
import { formatAmount, formatCents, formatUsd8, formatUsdRow, roundUsdCents, type PayAsset } from "@/lib/pay-math";
import { loadPrices, type Prices } from "@/lib/prices";
import { addresses, erc20, factoryAbi, networkName, publicClient, stableLabel, vaultAbi, type Portfolio } from "@/lib/protocol";
import type { Quote } from "@/lib/quote";

export type HoldingRow = {
  key: string;
  label: string;
  network: string;
  amount: string;
  /** Cents text such as "0.18", dust "<0.01", or empty when the row is not a dollar figure. */
  usd: string;
  /** priced rows have a dollar figure. unpriced has a balance and no price. unsupported has no contract. */
  availability: "priced" | "unpriced" | "unsupported";
  local?: string;
};

export type PayChoice = {
  pay: PayAsset;
  label: string;
  balance: string;
  usd: string;
  maxUsd: string;
};

export type HoldingsView = {
  rows: HoldingRow[];
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  /** USD value with 8 decimals, before display rounding. */
  totalUsd8: string;
  availableUsd8: string;
  streamingUsd8: string;
  lockedUsd8: string;
  usdcUsd8: string;
  available: string;
  streaming: string;
  locked: string;
  idleUsd: string;
  /** Shown under the balance when a price is assumed or missing. */
  priceNotes: string[];
  choices: PayChoice[];
};

function valueOf(amount: bigint, scale: number, price8: bigint): bigint {
  return (amount * price8) / 10n ** BigInt(scale);
}

function localText(usd8: bigint, quote: Quote, usdcUsd8: bigint): string | undefined {
  if (quote.code === "usd" || quote.code === "fusdcx" || !(quote.perToken > 0) || usdcUsd8 <= 0n) return undefined;
  const dollars = Number(usd8) / 1e8;
  const usdc = Number(usdcUsd8) / 1e8;
  if (!(usdc > 0)) return undefined;
  const local = (dollars * quote.perToken) / usdc;
  if (!Number.isFinite(local)) return undefined;
  return local.toLocaleString("en-US", {
    minimumFractionDigits: quote.digits > 0 ? Math.min(quote.digits, 2) : 0,
    maximumFractionDigits: quote.digits,
  });
}

function money(usd8: bigint): string {
  return formatUsd8(usd8);
}

async function hasCode(token: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address: token });
  return Boolean(code && code !== "0x");
}

async function tokenBalance(token: Address, owner: Address): Promise<{ supported: true; amount: bigint } | { supported: false }> {
  if (!(await hasCode(token))) return { supported: false };
  return { supported: true, amount: await publicClient.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] }) };
}

function pricedRow(input: {
  key: string;
  label: string;
  supported: boolean;
  amount: bigint;
  scale: number;
  digits: number;
  usd8: bigint | null;
}): { key: string; label: string; amount: string; usd: string; availability: HoldingRow["availability"]; cents: bigint; raw: bigint } {
  if (!input.supported) {
    return { key: input.key, label: input.label, amount: "Not on this network", usd: "", availability: "unsupported", cents: 0n, raw: 0n };
  }
  const amount = formatAmount(input.amount, input.scale, input.digits);
  if (input.amount === 0n) {
    return { key: input.key, label: input.label, amount, usd: "0.00", availability: "priced", cents: 0n, raw: 0n };
  }
  if (input.usd8 == null) {
    return { key: input.key, label: input.label, amount, usd: "", availability: "unpriced", cents: 0n, raw: 0n };
  }
  const cents = roundUsdCents(input.usd8);
  return {
    key: input.key,
    label: input.label,
    amount,
    usd: cents === 0n ? "<0.01" : formatCents(cents),
    availability: "priced",
    cents,
    raw: input.usd8,
  };
}

/** Wallet fUSDCx plus idle vault fUSDCx. Both can fund a goal without a swap. */
async function spendableSuper(owner: Address): Promise<bigint> {
  if (!(await hasCode(addresses.fusdcx))) return 0n;
  const [wallet, vault] = await Promise.all([
    publicClient.readContract({ address: addresses.fusdcx, abi: erc20, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] }),
  ]);
  if (vault === zeroAddress) return wallet;
  const idle = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "unallocated", args: [addresses.fusdcx] });
  return wallet + idle;
}

function superChoice(amount: bigint, price8: bigint): PayChoice {
  const shown = formatAmount(amount / 10n ** 12n, 6, 2);
  const value = valueOf(amount, 18, price8);
  return { pay: "usdcx", label: stableLabel, balance: shown, usd: money(value), maxUsd: maxUsdInput(value) };
}

export async function loadHoldings(owner: Address, portfolio: Portfolio, quote: Quote): Promise<HoldingsView> {
  const [prices, usdc, usdt, eth, ethx] = await Promise.all([
    loadPrices(),
    tokenBalance(baseMarket.usdc, owner),
    tokenBalance(baseMarket.usdt, owner),
    publicClient.getBalance({ address: owner }),
    tokenBalance(addresses.ethx, owner),
  ]);
  const usdSuper =
    BigInt(portfolio.wallet) + BigInt(portfolio.idle) + BigInt(portfolio.held) + BigInt(portfolio.streaming) + BigInt(portfolio.locked);
  let ethxLocked = 0n;
  for (const lock of portfolio.locks) {
    if (!lock.settled && lock.token.toLowerCase() === addresses.ethx.toLowerCase()) ethxLocked += BigInt(lock.principal);
  }
  const usdcAmount = usdc.supported ? usdc.amount : 0n;
  const usdtAmount = usdt.supported ? usdt.amount : 0n;
  const ethxAmount = (ethx.supported ? ethx.amount : 0n) + ethxLocked;
  const ethxSupported = ethx.supported || ethxLocked > 0n;
  const built = [
    pricedRow({ key: "usdc", label: "USDC", supported: usdc.supported, amount: usdcAmount, scale: 6, digits: 2, usd8: dollar(usdcAmount, 6, prices.usdcUsd8) }),
    pricedRow({ key: "usdt", label: "USDT", supported: usdt.supported, amount: usdtAmount, scale: 6, digits: 2, usd8: dollar(usdtAmount, 6, prices.usdtUsd8) }),
    pricedRow({ key: "eth", label: "ETH", supported: true, amount: eth, scale: 18, digits: 6, usd8: dollar(eth, 18, prices.ethUsd8) }),
    pricedRow({
      key: "usdcx",
      label: stableLabel,
      supported: true,
      amount: usdSuper / 10n ** 12n,
      scale: 6,
      digits: 2,
      usd8: dollar(usdSuper, 18, prices.usdcUsd8),
    }),
    pricedRow({
      key: "ethx",
      label: "ETHx",
      supported: ethxSupported,
      amount: ethxAmount,
      scale: 18,
      digits: 6,
      usd8: dollar(ethxAmount, 18, prices.ethUsd8),
    }),
  ];
  const totalCents = built.reduce((sum, row) => sum + row.cents, 0n);
  const rawTotal = built.reduce((sum, row) => sum + row.raw, 0n);
  const streamingRaw = dollar(BigInt(portfolio.streaming), 18, prices.usdcUsd8) ?? 0n;
  const lockedRaw = (dollar(BigInt(portfolio.locked), 18, prices.usdcUsd8) ?? 0n) + (dollar(ethxLocked, 18, prices.ethUsd8) ?? 0n);
  const columns = balanceColumns(totalCents, roundUsdCents(streamingRaw), roundUsdCents(lockedRaw));
  const idleRaw = dollar(BigInt(portfolio.idle), 18, prices.usdcUsd8);
  const localUnit = quote.code === "usd" || quote.code === "fusdcx" ? undefined : quote.unit;
  const usdcForLocal = prices.usdcUsd8 ?? 0n;
  const dustOnly = totalCents === 0n && rawTotal > 0n;
  const priceGap = totalCents === 0n && !dustOnly && built.some((row) => row.availability === "unpriced");
  return {
    rows: built.map((row) => ({
      key: row.key,
      label: row.label,
      network: networkName,
      amount: row.amount,
      usd: row.usd,
      availability: row.availability,
      local: row.availability === "priced" && row.raw > 0n ? localText(row.raw, quote, usdcForLocal) : undefined,
    })),
    totalUsd: priceGap ? "" : dustOnly ? "<0.01" : formatCents(totalCents),
    totalLocal: localText(rawTotal, quote, usdcForLocal),
    localUnit,
    totalUsd8: rawTotal.toString(),
    availableUsd8: (columns.available * 1_000_000n).toString(),
    streamingUsd8: (columns.streaming * 1_000_000n).toString(),
    lockedUsd8: (columns.locked * 1_000_000n).toString(),
    usdcUsd8: usdcForLocal.toString(),
    available: priceGap ? "" : columns.available === 0n && dustOnly ? "<0.01" : formatCents(columns.available),
    streaming: formatCents(columns.streaming),
    locked: formatCents(columns.locked),
    idleUsd: idleRaw == null ? "" : formatUsdRow(idleRaw),
    priceNotes: prices.notes,
    choices: await payChoices(owner, prices, usdc, usdt, eth),
  };
}

function dollar(amount: bigint, scale: number, price: bigint | null): bigint | null {
  if (amount === 0n) return 0n;
  if (price == null || price <= 0n) return null;
  return valueOf(amount, scale, price);
}

function choiceMoney(amount: bigint, scale: number, price: bigint | null): { usd: string; maxUsd: string } {
  const value = dollar(amount, scale, price);
  if (value == null) return { usd: "", maxUsd: "0.00" };
  return { usd: money(value), maxUsd: maxUsdInput(value) };
}

async function payChoices(
  owner: Address,
  prices: Prices,
  usdc: { supported: boolean; amount?: bigint },
  usdt: { supported: boolean; amount?: bigint },
  eth: bigint,
): Promise<PayChoice[]> {
  const superAmount = await spendableSuper(owner);
  const choices: PayChoice[] = [];
  if (superAmount > 0n && prices.usdcUsd8 != null) choices.push(superChoice(superAmount, prices.usdcUsd8));
  const ethMoney = choiceMoney(eth, 18, prices.ethUsd8);
  choices.push({ pay: "eth", label: "ETH", balance: formatAmount(eth, 18, 6), ...ethMoney });
  if (usdc.supported && usdc.amount != null) {
    const shown = choiceMoney(usdc.amount, 6, prices.usdcUsd8);
    choices.push({ pay: "usdc", label: "USDC", balance: formatAmount(usdc.amount, 6, 2), ...shown });
  }
  if (usdt.supported && usdt.amount != null) {
    const shown = choiceMoney(usdt.amount, 6, prices.usdtUsd8);
    choices.push({ pay: "usdt", label: "USDT", balance: formatAmount(usdt.amount, 6, 2), ...shown });
  }
  return choices;
}

export async function loadPayChoices(owner: Address): Promise<PayChoice[]> {
  const [prices, usdc, usdt, eth] = await Promise.all([
    loadPrices(),
    tokenBalance(baseMarket.usdc, owner),
    tokenBalance(baseMarket.usdt, owner),
    publicClient.getBalance({ address: owner }),
  ]);
  return payChoices(owner, prices, usdc, usdt, eth);
}
