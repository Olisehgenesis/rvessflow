import "server-only";

import { zeroAddress, type Address } from "viem";
import { baseMarket } from "@/lib/base-market";
import { maxUsdInput } from "@/lib/deposit-math";
import { balanceColumns } from "@/lib/home-math";
import { formatAmount, formatUsd8, type PayAsset } from "@/lib/pay-math";
import { loadPrices } from "@/lib/prices";
import { addresses, erc20, factoryAbi, networkName, publicClient, stableLabel, vaultAbi, type Portfolio } from "@/lib/protocol";
import type { Quote } from "@/lib/quote";

export type HoldingRow = {
  key: string;
  label: string;
  network: string;
  amount: string;
  usd: string;
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

async function tokenBalance(token: Address, owner: Address): Promise<bigint> {
  if (!(await hasCode(token))) return 0n;
  return publicClient.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
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
  const wrappedEth = ethx + ethxLocked;
  const priced = [
    { key: "usdc", label: "USDC", amount: formatAmount(usdc, 6, 2), value: valueOf(usdc, 6, prices.usdcUsd8) },
    { key: "usdt", label: "USDT", amount: formatAmount(usdt, 6, 2), value: valueOf(usdt, 6, prices.usdtUsd8) },
    { key: "eth", label: "ETH", amount: formatAmount(eth, 18, 6), value: valueOf(eth, 18, prices.ethUsd8) },
    {
      key: "usdcx",
      label: stableLabel,
      amount: formatAmount(usdSuper / 10n ** 12n, 6, 2),
      value: valueOf(usdSuper, 18, prices.usdcUsd8),
    },
    {
      key: "ethx",
      label: "ETHx",
      amount: formatAmount(wrappedEth, 18, 6),
      value: valueOf(wrappedEth, 18, prices.ethUsd8),
    },
  ];
  const total = priced.reduce((sum, row) => sum + row.value, 0n);
  const streamingUsd8 = valueOf(BigInt(portfolio.streaming), 18, prices.usdcUsd8);
  const lockedUsd8 = valueOf(BigInt(portfolio.locked), 18, prices.usdcUsd8) + valueOf(ethxLocked, 18, prices.ethUsd8);
  const columns = balanceColumns(total, streamingUsd8, lockedUsd8);
  const idleValue = valueOf(BigInt(portfolio.idle), 18, prices.usdcUsd8);
  const localUnit = quote.code === "usd" || quote.code === "fusdcx" ? undefined : quote.unit;
  return {
    rows: priced.map((row) => ({
      key: row.key,
      label: row.label,
      network: networkName,
      amount: row.amount,
      usd: money(row.value),
      local: localText(row.value, quote, prices.usdcUsd8),
    })),
    totalUsd: money(total),
    totalLocal: localText(total, quote, prices.usdcUsd8),
    localUnit,
    totalUsd8: total.toString(),
    availableUsd8: columns.available.toString(),
    streamingUsd8: columns.streaming.toString(),
    lockedUsd8: columns.locked.toString(),
    usdcUsd8: prices.usdcUsd8.toString(),
    available: money(columns.available),
    streaming: money(columns.streaming),
    locked: money(columns.locked),
    idleUsd: money(idleValue),
    choices: await payChoices(owner, prices, usdc, usdt, eth),
  };
}

async function payChoices(
  owner: Address,
  prices: Awaited<ReturnType<typeof loadPrices>>,
  usdc: bigint,
  usdt: bigint,
  eth: bigint,
): Promise<PayChoice[]> {
  const [usdcListed, usdtListed, superAmount] = await Promise.all([
    hasCode(baseMarket.usdc),
    hasCode(baseMarket.usdt),
    spendableSuper(owner),
  ]);
  const choices: PayChoice[] = [];
  if (superAmount > 0n) choices.push(superChoice(superAmount, prices.usdcUsd8));
  choices.push({
    pay: "eth",
    label: "ETH",
    balance: formatAmount(eth, 18, 6),
    usd: money(valueOf(eth, 18, prices.ethUsd8)),
    maxUsd: maxUsdInput(valueOf(eth, 18, prices.ethUsd8)),
  });
  if (usdcListed) {
    choices.push({
      pay: "usdc",
      label: "USDC",
      balance: formatAmount(usdc, 6, 2),
      usd: money(valueOf(usdc, 6, prices.usdcUsd8)),
      maxUsd: maxUsdInput(valueOf(usdc, 6, prices.usdcUsd8)),
    });
  }
  if (usdtListed) {
    choices.push({
      pay: "usdt",
      label: "USDT",
      balance: formatAmount(usdt, 6, 2),
      usd: money(valueOf(usdt, 6, prices.usdtUsd8)),
      maxUsd: maxUsdInput(valueOf(usdt, 6, prices.usdtUsd8)),
    });
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
